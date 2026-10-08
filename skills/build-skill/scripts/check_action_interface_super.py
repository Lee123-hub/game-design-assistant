#!/usr/bin/env python3
"""check_action_interface_super.py — 校验 template 头 ACTION INTERFACE 是 actions.json 超集.

规范依据: references/06-component.md §二 —
  template.html 头部注释块必须列出所有 actionType, 且集合 ⊇ actions.json 该组件的 keys.
  (前端可比 backend 多纯前端行为, 不能反过来)

用法:
  python3 check_action_interface_super.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import re
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"
COMPONENTS_REL = "skills/scene-skill/components"

# 抓头部注释块 <!-- ... ACTION INTERFACE ... -->
# 注意: ={2,} 后只吃到行尾换行 (不用 \s*, 否则会连带吞掉下一行的行首缩进,
# 导致紧跟在 ==== 后面第一个 actionType 因为丢失缩进而匹配不到 _ACTION_LINE_RE)
_BLOCK_RE = re.compile(
    r"<!--\s*.*?ACTION\s+INTERFACE\s*={2,}[ \t]*\r?\n(.*?)-->",
    re.IGNORECASE | re.DOTALL,
)
# 每行 "  actionName:" 抓 name (行首缩进, 后跟 :)
_ACTION_LINE_RE = re.compile(r"^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*$")


def _extract_template_actions(text: str):
    """从 template.html 头部提取 ACTION INTERFACE 声明的 actionType 集合.

    找不到注释块 → None (调用者 warn); 找到但空 → 空 set.
    """
    m = _BLOCK_RE.search(text)
    if not m:
        return None
    block = m.group(1)
    actions = set()
    for line in block.splitlines():
        mm = _ACTION_LINE_RE.match(line)
        if mm:
            name = mm.group(1)
            # 排除子字段常见词 (payload / file / return / example)
            if name.lower() in {"payload", "file", "return", "example", "note", "notes"}:
                continue
            actions.add(name)
    return actions


def _load_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except json.JSONDecodeError as e:
        return None, f"JSON 解析失败: {e}"
    except OSError as e:
        return None, f"读文件失败: {e}"


def _read_text(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read(), None
    except OSError as e:
        return None, str(e)


def run(workspace_root: str) -> Report:
    report = Report(check_name="action_interface_super")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    components_dir = os.path.join(workspace_root, COMPONENTS_REL)

    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL,
            "aif:actions_missing",
            "actions.json 不存在, skip",
        )
        return report

    if not os.path.isdir(components_dir):
        report.add_warn(
            COMPONENTS_REL,
            "aif:components_dir_missing",
            "components/ 目录不存在, skip",
        )
        return report

    actions, err = _load_json(actions_path)
    if err:
        report.add_fail(ACTIONS_REL, "aif:actions_invalid", err)
        return report
    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL,
            "aif:actions_not_object",
            f"actions.json 顶层应为 object, 实际 {type(actions).__name__}",
        )
        return report

    for cid in sorted(os.listdir(components_dir)):
        if cid.startswith(".") or cid.startswith("_"):
            continue
        comp_dir = os.path.join(components_dir, cid)
        if not os.path.isdir(comp_dir):
            continue

        tpl_path = os.path.join(comp_dir, "template.html")
        rel_tpl = f"{COMPONENTS_REL}/{cid}/template.html"
        if not os.path.isfile(tpl_path):
            report.add_warn(rel_tpl, "aif:template_missing", f"{cid} 缺 template.html, skip")
            continue

        text, err = _read_text(tpl_path)
        if err:
            report.add_warn(rel_tpl, "aif:template_read_error", err)
            continue

        tpl_actions = _extract_template_actions(text)
        if tpl_actions is None:
            report.add_warn(
                rel_tpl,
                "aif:no_interface_block",
                "template 头部缺 ACTION INTERFACE 注释块, 后端契约不清",
                fix_hint="在 <head> 或 <style> 前加 <!-- ACTION INTERFACE ==== ... --> 块",
            )
            tpl_actions = set()

        # actions.json 该组件的 keys (过滤 _meta / _comment 等)
        comp_cfg = actions.get(cid)
        if not isinstance(comp_cfg, dict):
            report.add_info(
                ACTIONS_REL,
                "aif:no_component_config",
                f"actions.json 无 {cid} 的 config, skip 该组件超集校验",
            )
            continue

        backend_actions = {k for k in comp_cfg.keys() if not k.startswith("_")}

        # 前端多出的 → info
        for extra in sorted(tpl_actions - backend_actions):
            report.add_info(
                rel_tpl,
                "aif:frontend_only",
                f"actionType `{extra}` 是前端行为, backend 无需处理",
            )

        # backend 有但前端未声明 → fail
        for missing in sorted(backend_actions - tpl_actions):
            report.add_fail(
                rel_tpl,
                "aif:backend_action_not_declared",
                f"actions.json[{cid}].{missing} 存在, 但 template ACTION INTERFACE 未声明",
                fix_hint=f"在 {rel_tpl} 的 ACTION INTERFACE 注释块加 `{missing}:` 段",
            )

        report.add_info(
            rel_tpl,
            "aif:summary",
            f"{cid}: tpl={len(tpl_actions)} backend={len(backend_actions)}",
        )

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
