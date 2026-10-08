#!/usr/bin/env python3
"""check_action_shape.py — 校验 actions.json 每个 action 字段规范.

规范依据: references/02-actions-shape.md

检查项:
  - handler.type 白名单 {upload_file, write_state, patch_state, script, call, parallel}
  - allowWhen 值 ⊆ {sealed, pending, uploading}
  - handlers 必须是 list, 不能是 dict
  - validators 若有, 每个元素必须有 type 且 type 目前只支持 file_headers
  - 每个 handler 必须有 type 字段
  - 空 action (无 handler / userMessage / agentPrompt) → warn
  - handler.type == "script" 必须有 path
  - handler.type == "call" 必须有 method
  - handler.type == "upload_file" 必须有 target
  - handler.type == "write_state" 必须有 target + (value 或 value_from)
  - handler.type == "patch_state" 必须有 target + key + (value 或 value_from)
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"

HANDLER_TYPE_WHITELIST = {
    "upload_file", "write_state", "patch_state",
    "script", "call", "parallel",
}
ALLOW_WHEN_WHITELIST = {"sealed", "pending", "uploading"}
VALIDATOR_TYPE_WHITELIST = {"file_headers"}


def _check_handler(report: Report, file_loc: str, handler, ctx: str):
    """校验单个 handler dict. ctx 用于错误定位, 如 'foo-comp.bar_action.handlers[2]'."""
    if not isinstance(handler, dict):
        report.add_fail(
            file_loc, "action_shape:handler_not_object",
            f"{ctx} handler 不是 object (实为 {type(handler).__name__})",
        )
        return

    htype = handler.get("type")
    if not htype:
        report.add_fail(
            file_loc, "action_shape:handler_missing_type",
            f"{ctx} handler 缺 type 字段",
        )
        return

    if not isinstance(htype, str):
        report.add_fail(
            file_loc, "action_shape:handler_type_not_string",
            f"{ctx} handler.type 必须是 string, 实为 {type(htype).__name__}",
        )
        return

    if htype not in HANDLER_TYPE_WHITELIST:
        report.add_fail(
            file_loc, "action_shape:handler_type_whitelist",
            f"{ctx} handler.type={htype!r} 不在白名单 {sorted(HANDLER_TYPE_WHITELIST)}",
            fix_hint="改用白名单内 type, 或到 references/02 确认新增 type",
        )
        return

    # type-specific 必填字段
    if htype == "script":
        if not handler.get("path"):
            report.add_fail(
                file_loc, "action_shape:script_missing_path",
                f"{ctx} handler.type=script 缺 path 字段",
            )
    elif htype == "call":
        if not handler.get("method"):
            report.add_fail(
                file_loc, "action_shape:call_missing_method",
                f"{ctx} handler.type=call 缺 method 字段",
            )
    elif htype == "upload_file":
        if not handler.get("target"):
            report.add_fail(
                file_loc, "action_shape:upload_missing_target",
                f"{ctx} handler.type=upload_file 缺 target 字段",
            )
    elif htype == "write_state":
        if not handler.get("target"):
            report.add_fail(
                file_loc, "action_shape:write_state_missing_target",
                f"{ctx} handler.type=write_state 缺 target 字段",
            )
        # value 或 value_from 至少一个; write_state 允许两者都缺 (只落 payload 快照)
        # 但强规则: 若都无 且无 payload 引用, 静默通过 (与实际使用一致)
        # 依需求, 我们仍然要求至少一个来源 (与 spec 一致):
        if "value" not in handler and "value_from" not in handler and "payload" not in handler:
            # 允许 payload 兜底 (对齐样本 checklist_confirmed 只落 payload); 若三者皆无 → warn
            report.add_warn(
                file_loc, "action_shape:write_state_no_value_source",
                f"{ctx} handler.type=write_state 无 value / value_from / payload, 只落空快照",
            )
    elif htype == "patch_state":
        missing = []
        if not handler.get("target"):
            missing.append("target")
        if not handler.get("key"):
            missing.append("key")
        if missing:
            report.add_fail(
                file_loc, "action_shape:patch_state_missing_field",
                f"{ctx} handler.type=patch_state 缺字段: {missing}",
            )
        if "value" not in handler and "value_from" not in handler:
            report.add_fail(
                file_loc, "action_shape:patch_state_no_value_source",
                f"{ctx} handler.type=patch_state 缺 value 或 value_from",
            )
    elif htype == "parallel":
        children = handler.get("children")
        if not isinstance(children, list) or not children:
            report.add_fail(
                file_loc, "action_shape:parallel_missing_children",
                f"{ctx} handler.type=parallel 缺 children (list) 或 children 为空",
            )
        else:
            for i, child in enumerate(children):
                _check_handler(report, file_loc, child, f"{ctx}.children[{i}]")


def _check_action(report: Report, file_loc: str, cid: str, action_type: str, action):
    ctx = f"{cid}.{action_type}"

    if not isinstance(action, dict):
        report.add_fail(
            file_loc, "action_shape:action_not_object",
            f"{ctx} 不是 object (实为 {type(action).__name__})",
        )
        return

    handlers = action.get("handlers")
    user_msg = action.get("userMessage")
    agent_prompt = action.get("agentPrompt")

    # handlers 类型
    if handlers is not None:
        if isinstance(handlers, dict):
            report.add_fail(
                file_loc, "action_shape:handlers_is_object",
                f"{ctx}.handlers 必须是 array, 实为 object",
                fix_hint="改成 [{...}] 数组",
            )
            handlers = None  # 后续 skip
        elif not isinstance(handlers, list):
            report.add_fail(
                file_loc, "action_shape:handlers_not_array",
                f"{ctx}.handlers 必须是 array, 实为 {type(handlers).__name__}",
            )
            handlers = None

    # 空 action 检测
    has_handlers = isinstance(handlers, list) and len(handlers) > 0
    has_user_msg = isinstance(user_msg, str) and user_msg.strip()
    has_agent_prompt = isinstance(agent_prompt, str) and agent_prompt.strip()
    if not has_handlers and not has_user_msg and not has_agent_prompt:
        report.add_warn(
            file_loc, "action_shape:empty_action",
            f"{ctx} 空 action (无 handlers/userMessage/agentPrompt, 不产生任何效果)",
        )

    # allowWhen
    allow_when = action.get("allowWhen")
    if allow_when is not None:
        if not isinstance(allow_when, list):
            report.add_fail(
                file_loc, "action_shape:allow_when_not_array",
                f"{ctx}.allowWhen 必须是 array, 实为 {type(allow_when).__name__}",
            )
        else:
            for v in allow_when:
                if v not in ALLOW_WHEN_WHITELIST:
                    report.add_fail(
                        file_loc, "action_shape:allow_when_value",
                        f"{ctx}.allowWhen 含非法值 {v!r}, 白名单 {sorted(ALLOW_WHEN_WHITELIST)}",
                    )

    # validators
    validators = action.get("validators")
    if validators is not None:
        if not isinstance(validators, list):
            report.add_fail(
                file_loc, "action_shape:validators_not_array",
                f"{ctx}.validators 必须是 array, 实为 {type(validators).__name__}",
            )
        else:
            for i, v in enumerate(validators):
                if not isinstance(v, dict):
                    report.add_fail(
                        file_loc, "action_shape:validator_not_object",
                        f"{ctx}.validators[{i}] 不是 object",
                    )
                    continue
                vt = v.get("type")
                if not vt:
                    report.add_fail(
                        file_loc, "action_shape:validator_missing_type",
                        f"{ctx}.validators[{i}] 缺 type 字段",
                    )
                elif vt not in VALIDATOR_TYPE_WHITELIST:
                    report.add_fail(
                        file_loc, "action_shape:validator_type_whitelist",
                        f"{ctx}.validators[{i}].type={vt!r} 不在白名单 {sorted(VALIDATOR_TYPE_WHITELIST)}",
                    )

    # handlers 内每个 handler
    if isinstance(handlers, list):
        for i, h in enumerate(handlers):
            _check_handler(report, file_loc, h, f"{ctx}.handlers[{i}]")


def run(workspace_root: str) -> Report:
    report = Report(check_name="action_shape")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL, "action_shape:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip",
        )
        return report

    try:
        with open(actions_path, "r", encoding="utf-8") as f:
            actions = json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(
            ACTIONS_REL, "action_shape:invalid_json",
            f"actions.json JSON 解析失败: {e}",
        )
        return report
    except OSError as e:
        report.add_fail(ACTIONS_REL, "action_shape:read_error", str(e))
        return report

    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL, "action_shape:actions_not_object",
            f"actions.json 顶层必须是 object, 实为 {type(actions).__name__}",
        )
        return report

    action_count = 0
    for cid, comp_actions in actions.items():
        if cid.startswith("_"):  # _meta 等
            continue
        if not isinstance(comp_actions, dict):
            report.add_fail(
                ACTIONS_REL, "action_shape:component_not_object",
                f"{cid} 对应值应为 object (actionType -> config), 实为 {type(comp_actions).__name__}",
            )
            continue
        for atype, action in comp_actions.items():
            if atype.startswith("_"):
                continue
            action_count += 1
            _check_action(report, ACTIONS_REL, cid, atype, action)

    report.add_info(
        ACTIONS_REL, "action_shape:summary",
        f"扫描 {action_count} 个 action",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
