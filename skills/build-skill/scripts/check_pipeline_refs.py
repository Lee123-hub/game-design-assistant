#!/usr/bin/env python3
"""check_pipeline_refs.py — 校验 pipeline 内 handler.id 引用.

规范依据: references/04-pipeline.md

规则:
  - 遍历每个 action.handlers
  - 收集所有 handler.id
  - handler.value_from / target / input / params / value 等 (含嵌套) 里的 `results.<id>.`
    引用的 id 必须在同 action **前面** 某个 handler 声明过 (前向依赖)
  - 同 action 内 id 唯一
  - parallel.children 里的 id 属于外层作用域 (同一 pipeline 可见)
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"

RESULTS_REF = re.compile(r"results\.([A-Za-z_][A-Za-z0-9_]*)")


def _collect_strings(node):
    """深度遍历 dict/list, yield 所有字符串值."""
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from _collect_strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _collect_strings(v)


def _extract_refs(handler):
    """从一个 handler dict 里抽出所有 results.<id> 引用的 id set.
    忽略 handler.id 自身 (自我声明, 不算引用).
    """
    refs = set()
    for k, v in handler.items():
        if k == "id":
            continue
        for s in _collect_strings(v):
            for m in RESULTS_REF.findall(s):
                refs.add(m)
    return refs


def _walk_handlers(handlers):
    """线性 yield handler 序列 (按声明顺序).
    parallel.children 展开到外层 (children 里的 id 属于外层作用域, 顺序放在 parallel 本身之后).
    """
    for h in handlers:
        if not isinstance(h, dict):
            yield h
            continue
        yield h
        if h.get("type") == "parallel" and isinstance(h.get("children"), list):
            for child in h["children"]:
                yield child


def _check_action(report: Report, cid: str, atype: str, action):
    if not isinstance(action, dict):
        return
    handlers = action.get("handlers")
    if not isinstance(handlers, list):
        return

    ctx_prefix = f"{cid}.{atype}"
    declared_ids = []  # 有序声明 (前向依赖判定)
    seen_ids = set()

    for idx, h in enumerate(_walk_handlers(handlers)):
        if not isinstance(h, dict):
            continue
        hid = h.get("id")
        # 引用检查 (先看引用, 后声明本 handler id, 保证前向依赖)
        refs = _extract_refs(h)
        for ref in refs:
            if ref not in seen_ids:
                report.add_fail(
                    ACTIONS_REL, "pipeline_refs:forward_or_missing",
                    f"{ctx_prefix}.handlers[{idx}] 引用 results.{ref}, 但 id={ref!r} 未在前面 handler 声明",
                    fix_hint=f"确认 id={ref!r} 拼写, 或调整 handler 顺序",
                )

        if hid is not None:
            if not isinstance(hid, str):
                report.add_fail(
                    ACTIONS_REL, "pipeline_refs:id_not_string",
                    f"{ctx_prefix}.handlers[{idx}] handler.id 必须是字符串, 实为 {type(hid).__name__}",
                )
            elif hid in seen_ids:
                report.add_warn(
                    ACTIONS_REL, "pipeline_refs:duplicate_id",
                    f"{ctx_prefix}.handlers[{idx}] handler.id={hid!r} 重复 (同 action 内已存在), 后覆盖前",
                )
            else:
                seen_ids.add(hid)
                declared_ids.append(hid)


def run(workspace_root: str) -> Report:
    report = Report(check_name="pipeline_refs")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL, "pipeline_refs:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip",
        )
        return report

    try:
        with open(actions_path, "r", encoding="utf-8") as f:
            actions = json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(
            ACTIONS_REL, "pipeline_refs:invalid_json",
            f"actions.json JSON 解析失败: {e}",
        )
        return report
    except OSError as e:
        report.add_fail(ACTIONS_REL, "pipeline_refs:read_error", str(e))
        return report

    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL, "pipeline_refs:actions_not_object",
            "actions.json 顶层不是 object",
        )
        return report

    action_count = 0
    for cid, comp_actions in actions.items():
        if cid.startswith("_") or not isinstance(comp_actions, dict):
            continue
        for atype, action in comp_actions.items():
            if atype.startswith("_"):
                continue
            action_count += 1
            _check_action(report, cid, atype, action)

    report.add_info(
        ACTIONS_REL, "pipeline_refs:summary",
        f"扫描 {action_count} 个 action 的 pipeline 引用",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
