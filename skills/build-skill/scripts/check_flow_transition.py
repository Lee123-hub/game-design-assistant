#!/usr/bin/env python3
"""check_flow_transition.py — 校验 flow.json 结构.

规范依据: references/05-flow.md

规则:
  - 存在必需字段: stages (list) + transition (dict)
  - 每个 stage: id (str, snake_case) + label (str) + idx (int) + componentIds (list)
  - stages 里 id 唯一 + idx 递增 (可跳跃, 但严格递增)
  - transition.kind == "trigger"
  - transition.actionTypeMap key (actionType) 必须存在于 actions.json 至少一个组件的某个 action
  - transition.actionTypeMap value (stageId) 必须在 stages[].id
  - fileMeta 若有, 每个 role ⊆ {state, input, output, upload}
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, parse_args_common  # noqa: E402


FLOW_REL = "skills/scene-skill/flow.json"
ACTIONS_REL = "skills/scene-skill/actions.json"

SNAKE_CASE_RE = re.compile(r"^[a-z][a-z0-9_]*$")
FILE_ROLE_WHITELIST = {"state", "input", "output", "upload"}


def _load_json(path, rel, report, rule_prefix):
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(rel, f"{rule_prefix}:invalid_json", f"{rel} JSON 解析失败: {e}")
        return None
    except OSError as e:
        report.add_fail(rel, f"{rule_prefix}:read_error", str(e))
        return None


def run(workspace_root: str) -> Report:
    report = Report(check_name="flow_transition")

    flow_path = os.path.join(workspace_root, FLOW_REL)
    if not os.path.isfile(flow_path):
        report.add_warn(
            FLOW_REL, "flow_transition:flow_missing",
            "workspace 未初始化 (flow.json 不存在), skip",
        )
        return report

    flow = _load_json(flow_path, FLOW_REL, report, "flow_transition")
    if flow is None:
        return report

    if not isinstance(flow, dict):
        report.add_fail(FLOW_REL, "flow_transition:not_object",
                        f"flow.json 顶层必须是 object, 实为 {type(flow).__name__}")
        return report

    # stages 校验
    stages = flow.get("stages")
    stage_ids = set()
    if not isinstance(stages, list):
        report.add_fail(FLOW_REL, "flow_transition:stages_not_array",
                        "stages 必须是 array")
    else:
        prev_idx = None
        for i, s in enumerate(stages):
            if not isinstance(s, dict):
                report.add_fail(FLOW_REL, "flow_transition:stage_not_object",
                                f"stages[{i}] 不是 object")
                continue
            sid = s.get("id")
            label = s.get("label")
            idx = s.get("idx")
            cids = s.get("componentIds")

            if not isinstance(sid, str) or not sid:
                report.add_fail(FLOW_REL, "flow_transition:stage_id_invalid",
                                f"stages[{i}].id 必须是非空 string")
            else:
                if not SNAKE_CASE_RE.match(sid):
                    report.add_warn(FLOW_REL, "flow_transition:stage_id_not_snake",
                                    f"stages[{i}].id={sid!r} 不符合 snake_case")
                if sid in stage_ids:
                    report.add_fail(FLOW_REL, "flow_transition:stage_id_duplicate",
                                    f"stages[{i}].id={sid!r} 重复")
                else:
                    stage_ids.add(sid)

            if not isinstance(label, str) or not label:
                report.add_fail(FLOW_REL, "flow_transition:stage_label_invalid",
                                f"stages[{i}].label 必须是非空 string")

            if not isinstance(idx, int) or isinstance(idx, bool):
                report.add_fail(FLOW_REL, "flow_transition:stage_idx_not_int",
                                f"stages[{i}].idx 必须是 int, 实为 {type(idx).__name__}")
            else:
                if prev_idx is not None and idx <= prev_idx:
                    report.add_fail(FLOW_REL, "flow_transition:stage_idx_not_ascending",
                                    f"stages[{i}].idx={idx} 未严格大于前一个 {prev_idx}")
                prev_idx = idx

            if not isinstance(cids, list):
                report.add_fail(FLOW_REL, "flow_transition:stage_componentIds_not_array",
                                f"stages[{i}].componentIds 必须是 array")

    # transition 校验
    transition = flow.get("transition")
    if not isinstance(transition, dict):
        report.add_fail(FLOW_REL, "flow_transition:transition_not_object",
                        "transition 必须是 object")
    else:
        kind = transition.get("kind")
        if kind != "trigger":
            report.add_fail(FLOW_REL, "flow_transition:transition_kind",
                            f"transition.kind 必须为 'trigger', 实为 {kind!r}")

        action_type_map = transition.get("actionTypeMap")
        if action_type_map is None:
            report.add_fail(FLOW_REL, "flow_transition:missing_actionTypeMap",
                            "transition 缺 actionTypeMap")
        elif not isinstance(action_type_map, dict):
            report.add_fail(FLOW_REL, "flow_transition:actionTypeMap_not_object",
                            "transition.actionTypeMap 必须是 object")
        else:
            # 需要 actions.json 里所有 actionType 集合
            actions = _load_json(
                os.path.join(workspace_root, ACTIONS_REL),
                ACTIONS_REL, report, "flow_transition_actions",
            )
            all_action_types = set()
            if isinstance(actions, dict):
                for cid, comp in actions.items():
                    if cid.startswith("_") or not isinstance(comp, dict):
                        continue
                    for atype in comp.keys():
                        if not atype.startswith("_"):
                            all_action_types.add(atype)

            for atype, target_stage in action_type_map.items():
                if actions is not None and atype not in all_action_types:
                    report.add_fail(
                        FLOW_REL, "flow_transition:actionType_not_in_actions",
                        f"transition.actionTypeMap.{atype} 在 actions.json 中找不到任何组件的对应 action",
                    )
                if not isinstance(target_stage, str):
                    report.add_fail(
                        FLOW_REL, "flow_transition:target_stage_not_string",
                        f"transition.actionTypeMap.{atype} value 必须是 string",
                    )
                elif stage_ids and target_stage not in stage_ids:
                    report.add_fail(
                        FLOW_REL, "flow_transition:target_stage_unknown",
                        f"transition.actionTypeMap.{atype}={target_stage!r} 不在 stages[].id 里",
                    )

    # fileMeta 校验
    file_meta = flow.get("fileMeta")
    if file_meta is not None:
        if not isinstance(file_meta, dict):
            report.add_warn(FLOW_REL, "flow_transition:fileMeta_not_object",
                            "fileMeta 应为 object")
        else:
            for fpath, meta in file_meta.items():
                if not isinstance(meta, dict):
                    report.add_warn(FLOW_REL, "flow_transition:fileMeta_entry_not_object",
                                    f"fileMeta[{fpath!r}] 不是 object")
                    continue
                role = meta.get("role")
                if role is not None and role not in FILE_ROLE_WHITELIST:
                    report.add_warn(
                        FLOW_REL, "flow_transition:fileMeta_role_whitelist",
                        f"fileMeta[{fpath!r}].role={role!r} 不在白名单 {sorted(FILE_ROLE_WHITELIST)}",
                    )

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
