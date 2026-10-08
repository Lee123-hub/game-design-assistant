#!/usr/bin/env python3
"""check_component_registered.py — 三方对齐检查组件注册一致性.

规范依据: references/01-scope.md — actions.json / flow.json / components/ 三者组件一致性.

  - actions_components: actions.json 顶层 keys (过滤 _ 开头)
  - flow_components:    flow.json.stages[].componentIds 合并
  - dir_components:     skills/scene-skill/components/ 下子目录名

规则:
  - actions - flow  → warn: 组件未挂到任何 stage
  - flow - actions  → fail: flow 挂了但 actions.json 未定义
  - actions - dir   → fail: actions.json 有 config 但 components/ 无三件套
  - dir - actions   → warn: components/ 有目录但 actions.json 无 (孤儿)

用法:
  python3 check_component_registered.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"
FLOW_REL = "skills/scene-skill/flow.json"
COMPONENTS_REL = "skills/scene-skill/components"


def _load_json(path: str, report: Report, rel: str, code: str):
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(rel, code, f"JSON 解析失败: {e}")
        return None
    except OSError as e:
        report.add_fail(rel, code, f"读文件失败: {e}")
        return None


def run(workspace_root: str) -> Report:
    report = Report(check_name="component_registered")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    flow_path = os.path.join(workspace_root, FLOW_REL)
    components_dir = os.path.join(workspace_root, COMPONENTS_REL)

    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL,
            "component_registered:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip",
        )
        return report

    actions = _load_json(actions_path, report, ACTIONS_REL, "component_registered:actions_invalid")
    if actions is None:
        return report
    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL,
            "component_registered:actions_not_object",
            f"actions.json 顶层应为 object, 实际 {type(actions).__name__}",
        )
        return report

    # ---- actions_components ----
    actions_components = {
        k for k in actions.keys() if not k.startswith("_")
    }

    # ---- flow_components ----
    flow_components = set()
    if os.path.isfile(flow_path):
        flow = _load_json(flow_path, report, FLOW_REL, "component_registered:flow_invalid")
        if flow is not None:
            if not isinstance(flow, dict):
                report.add_fail(
                    FLOW_REL,
                    "component_registered:flow_not_object",
                    f"flow.json 顶层应为 object, 实际 {type(flow).__name__}",
                )
            else:
                stages = flow.get("stages", [])
                if not isinstance(stages, list):
                    report.add_fail(
                        FLOW_REL,
                        "component_registered:stages_not_list",
                        f"flow.stages 应为 list, 实际 {type(stages).__name__}",
                    )
                else:
                    for i, stage in enumerate(stages):
                        if not isinstance(stage, dict):
                            report.add_warn(
                                FLOW_REL,
                                "component_registered:stage_not_object",
                                f"stages[{i}] 不是 object, skip",
                            )
                            continue
                        comp_ids = stage.get("componentIds", [])
                        if not isinstance(comp_ids, list):
                            report.add_warn(
                                FLOW_REL,
                                "component_registered:component_ids_not_list",
                                f"stages[{i}].componentIds 不是 list",
                            )
                            continue
                        for cid in comp_ids:
                            if isinstance(cid, str):
                                flow_components.add(cid)
    else:
        report.add_warn(
            FLOW_REL,
            "component_registered:flow_missing",
            "flow.json 不存在, 跳过 flow 侧比对",
        )

    # ---- dir_components ----
    dir_components = set()
    if os.path.isdir(components_dir):
        for entry in os.listdir(components_dir):
            if entry.startswith(".") or entry.startswith("_"):
                continue
            full = os.path.join(components_dir, entry)
            if os.path.isdir(full):
                dir_components.add(entry)
    else:
        report.add_warn(
            COMPONENTS_REL,
            "component_registered:components_dir_missing",
            "components/ 目录不存在, 跳过目录侧比对",
        )

    # ---- diff 1: actions - flow (warn: 组件未挂 stage) ----
    if os.path.isfile(flow_path):
        for comp in sorted(actions_components - flow_components):
            report.add_warn(
                ACTIONS_REL,
                "component_registered:not_in_flow",
                f"组件 {comp} 在 actions.json 有 config 但未挂到 flow.json 任何 stage",
                fix_hint=f"在 flow.json 某个 stage.componentIds 加 {comp}",
            )

    # ---- diff 2: flow - actions (fail: flow 有但 actions 无) ----
    for comp in sorted(flow_components - actions_components):
        report.add_fail(
            FLOW_REL,
            "component_registered:not_in_actions",
            f"组件 {comp} 在 flow.json 被引用但 actions.json 未定义",
            fix_hint=f"在 actions.json 加 {comp} 的 config, 或从 flow.json 移除",
        )

    # ---- diff 3: actions - dir (fail: 缺三件套目录) ----
    if os.path.isdir(components_dir):
        for comp in sorted(actions_components - dir_components):
            report.add_fail(
                COMPONENTS_REL,
                "component_registered:dir_missing",
                f"组件 {comp} 在 actions.json 有 config 但 components/{comp}/ 目录缺失",
                fix_hint=f"在 {COMPONENTS_REL}/{comp}/ 下补三件套 template.html + schema.json + demo.json",
            )

    # ---- diff 4: dir - actions (warn: 孤儿组件目录) ----
    if os.path.isdir(components_dir):
        for comp in sorted(dir_components - actions_components):
            report.add_warn(
                f"{COMPONENTS_REL}/{comp}/",
                "component_registered:orphan_component",
                f"components/{comp}/ 目录存在但 actions.json 未定义该组件",
                fix_hint=f"在 actions.json 加 {comp} 的 config, 或删除该目录",
            )

    report.add_info(
        ACTIONS_REL,
        "component_registered:summary",
        f"actions={len(actions_components)} flow={len(flow_components)} dir={len(dir_components)}",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
