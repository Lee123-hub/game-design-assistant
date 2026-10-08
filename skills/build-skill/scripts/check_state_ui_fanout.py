#!/usr/bin/env python3
r"""check_state_ui_fanout.py — 校验 state key 写入 / 消费的双向 fanout.

规范依据: references/02-actions-shape.md + references/05-flow.md

规则:
  - 遍历 handler.type in {write_state, patch_state}, 抽 target 里的 state-mirror/*.json 路径 (写侧)
  - 遍历所有组件 template.html, 抽用到的 state-mirror/... 路径 (消费侧)
  - 遍历所有 script handler.input, 抽输入路径 (消费侧)
  - 写但无任何 UI/script 消费 → warn "死数据"
  - 消费但无 write → info "可能是 external state"

注意: 路径提取是启发式, 正则 findall `state-mirror/[^"'\s{}<>]+`, 保留 path 段.
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"
COMPONENTS_REL = "skills/scene-skill/components"
SCENE_REL = "skills/scene-skill"

# 匹配 state-mirror/xxx.json (禁止匹配空格/引号/花括号/尖括号)
STATE_PATH_RE = re.compile(r"state-mirror/[^\"'\s{}<>()]+")


def _normalize_state_path(raw: str) -> str:
    """把 target 里可能含模板变量的路径归一化为 state-mirror/xxx 段."""
    # 去掉尾部标点
    raw = raw.rstrip(".,;)")
    # 只留 state-mirror 开头段
    m = STATE_PATH_RE.search(raw)
    return m.group(0) if m else raw


def _extract_state_paths_from_string(s: str) -> set:
    """从任意字符串抽 state-mirror/xxx 路径集."""
    out = set()
    for m in STATE_PATH_RE.findall(s):
        # 去尾部标点
        cleaned = m.rstrip(".,;)}\"'")
        out.add(cleaned)
    return out


def _walk_handlers(handlers):
    """展开 pipeline handler (含 parallel.children)."""
    for h in handlers:
        if not isinstance(h, dict):
            continue
        yield h
        if h.get("type") == "parallel" and isinstance(h.get("children"), list):
            for child in h["children"]:
                if isinstance(child, dict):
                    yield child


def _iter_all_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from _iter_all_strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _iter_all_strings(v)


def run(workspace_root: str) -> Report:
    report = Report(check_name="state_ui_fanout")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL, "state_ui_fanout:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip",
        )
        return report

    try:
        with open(actions_path, "r", encoding="utf-8") as f:
            actions = json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(
            ACTIONS_REL, "state_ui_fanout:invalid_json",
            f"actions.json JSON 解析失败: {e}",
        )
        return report
    except OSError as e:
        report.add_fail(ACTIONS_REL, "state_ui_fanout:read_error", str(e))
        return report

    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL, "state_ui_fanout:actions_not_object",
            "actions.json 顶层不是 object",
        )
        return report

    # ---- 收集写侧 state 路径 (write_state / patch_state.target) ----
    written = {}  # path -> [ctx...]
    # ---- 收集消费侧 (script.input) ----
    consumed_by_script = {}

    for cid, comp in actions.items():
        if cid.startswith("_") or not isinstance(comp, dict):
            continue
        for atype, action in comp.items():
            if atype.startswith("_") or not isinstance(action, dict):
                continue
            handlers = action.get("handlers")
            if not isinstance(handlers, list):
                continue
            for i, h in enumerate(_walk_handlers(handlers)):
                htype = h.get("type")
                ctx = f"{cid}.{atype}.handlers[{i}]"
                if htype in ("write_state", "patch_state"):
                    tgt = h.get("target")
                    if isinstance(tgt, str):
                        for p in _extract_state_paths_from_string(tgt):
                            written.setdefault(p, []).append(ctx)
                elif htype == "script":
                    inp = h.get("input")
                    if isinstance(inp, dict):
                        for s in _iter_all_strings(inp):
                            for p in _extract_state_paths_from_string(s):
                                consumed_by_script.setdefault(p, []).append(ctx)
                # value_from / params 里若也引 state-mirror 也算消费
                for key in ("params", "payload", "value_from", "value"):
                    if key in h:
                        for s in _iter_all_strings(h[key]):
                            for p in _extract_state_paths_from_string(s):
                                consumed_by_script.setdefault(p, []).append(ctx)

    # ---- 收集 UI 消费 (template.html 里的引用) ----
    consumed_by_ui = {}
    components_dir = os.path.join(workspace_root, COMPONENTS_REL)
    if os.path.isdir(components_dir):
        for cname in os.listdir(components_dir):
            cdir = os.path.join(components_dir, cname)
            if not os.path.isdir(cdir):
                continue
            # 扫所有 html / js / json 文件
            for dirpath, _, files in os.walk(cdir):
                for fname in files:
                    if not fname.endswith((".html", ".js", ".json", ".ts", ".jsx", ".tsx")):
                        continue
                    fpath = os.path.join(dirpath, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                    except OSError:
                        continue
                    for p in _extract_state_paths_from_string(content):
                        rel = os.path.relpath(fpath, workspace_root).replace(os.sep, "/")
                        consumed_by_ui.setdefault(p, []).append(rel)

    # ---- diff ----
    written_set = set(written.keys())
    ui_set = set(consumed_by_ui.keys())
    script_set = set(consumed_by_script.keys())

    # 死数据: 被 write 但无任何 UI / script 消费
    dead = written_set - ui_set - script_set
    for p in sorted(dead):
        writers = written[p]
        report.add_warn(
            ACTIONS_REL, "state_ui_fanout:dead_write",
            f"state 路径 {p!r} 被写入但无 UI / script 消费 (可能死数据)",
            fix_hint=f"写入位置: {writers[:3]}{'...' if len(writers) > 3 else ''}",
        )

    # 外部 state: 被消费但无 write
    external = (ui_set | script_set) - written_set
    for p in sorted(external):
        srcs = consumed_by_ui.get(p, []) + consumed_by_script.get(p, [])
        report.add_info(
            ACTIONS_REL, "state_ui_fanout:external_read",
            f"state 路径 {p!r} 被消费但无 handler write, 可能是 external state 或前置初始化产出",
            fix_hint=f"消费位置: {srcs[:3]}{'...' if len(srcs) > 3 else ''}",
        )

    report.add_info(
        ACTIONS_REL, "state_ui_fanout:summary",
        f"写={len(written_set)} UI消费={len(ui_set)} script消费={len(script_set)} 死={len(dead)} 外部={len(external)}",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
