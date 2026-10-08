#!/usr/bin/env python3
"""check_meta.py — 检查 actions.json._meta 字段是否规范.

规范依据: references/01-scope.md — actions.json 必须带 _meta 段用于溯源.
  - _meta 存在
  - _meta.projectId 是字符串 (来源标记, 允许跟当前 workspace pid 不同)
  - 建议 _meta.template_from 存在 (若跟 projectId 不同说明是 clone 案例) — 无 → info, 不 warn

用法:
  python3 check_meta.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"


def run(workspace_root: str) -> Report:
    report = Report(check_name="meta")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL,
            "meta:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip meta 检查",
        )
        return report

    try:
        with open(actions_path, "r", encoding="utf-8") as f:
            actions = json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(
            ACTIONS_REL,
            "meta:actions_invalid_json",
            f"actions.json JSON 解析失败: {e}",
        )
        return report
    except OSError as e:
        report.add_fail(ACTIONS_REL, "meta:actions_read_error", str(e))
        return report

    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL,
            "meta:actions_not_object",
            f"actions.json 顶层必须是 object, 实际为 {type(actions).__name__}",
        )
        return report

    meta = actions.get("_meta")
    if meta is None:
        report.add_warn(
            ACTIONS_REL,
            "meta:missing",
            "缺 _meta 段, 无法追溯该 skill 的来源项目",
            fix_hint='在 actions.json 加 "_meta": {"projectId": "<来源 pid>"}',
        )
        return report

    if not isinstance(meta, dict):
        report.add_fail(
            ACTIONS_REL,
            "meta:not_object",
            f"_meta 必须是 object, 实际为 {type(meta).__name__}",
        )
        return report

    project_id = meta.get("projectId")
    if project_id is None:
        report.add_warn(
            ACTIONS_REL,
            "meta:missing_project_id",
            "_meta.projectId 缺失 (来源标记, 允许跟 workspace pid 不同, 但要有字段)",
            fix_hint='加 "projectId": "<来源 pid>"',
        )
    elif not isinstance(project_id, str):
        report.add_fail(
            ACTIONS_REL,
            "meta:project_id_type",
            f"_meta.projectId 必须是字符串, 实际为 {type(project_id).__name__}",
        )
    elif not project_id.strip():
        report.add_warn(
            ACTIONS_REL,
            "meta:project_id_empty",
            "_meta.projectId 为空串",
        )
    else:
        report.add_info(
            ACTIONS_REL,
            "meta:project_id_ok",
            f"_meta.projectId = {project_id}",
        )

    template_from = meta.get("template_from")
    if template_from is None:
        report.add_info(
            ACTIONS_REL,
            "meta:no_template_from",
            "_meta 无 template_from 字段 (若此 skill 是 clone 自其他项目, 建议补上以便追溯 template 源)",
        )
    else:
        if not isinstance(template_from, str):
            report.add_warn(
                ACTIONS_REL,
                "meta:template_from_type",
                f"_meta.template_from 应为字符串, 实际为 {type(template_from).__name__}",
            )
        elif project_id and template_from == project_id:
            report.add_info(
                ACTIONS_REL,
                "meta:template_from_same",
                "_meta.template_from 与 projectId 相同 (非 clone 案例)",
            )
        else:
            report.add_info(
                ACTIONS_REL,
                "meta:template_from_ok",
                f"_meta.template_from = {template_from} (clone 案例, 与 projectId={project_id} 不同)",
            )

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
