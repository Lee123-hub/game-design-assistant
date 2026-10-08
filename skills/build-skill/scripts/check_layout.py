#!/usr/bin/env python3
"""check_layout.py — 检查 workspace 目录布局约束.

规范依据: references/01-scope.md — workspace 允许布局:
  - 根: CLAUDE.md + skills/ 子目录 (其他 warn)
  - skills/ 下只允许 scene-skill/ (其他 warn, 白名单不覆盖)
  - skills/scene-skill/ 下允许目录: components/, scripts/, references/, frame/, _shared/
  - skills/scene-skill/components/<name>/ 必须有 template.html + schema.json + demo.json 三件套 (缺失 fail)
  - workspace 根若有 rules/ / agents/ / test-case/ / templates/ / memory/ 等 rev7 残留 → warn

用法:
  python3 check_layout.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


ROOT_ALLOWED_FILES = {"CLAUDE.md"}
ROOT_ALLOWED_DIRS = {"skills"}

# 老 rev7 常见残留 (明确 warn)
ROOT_REV7_LEGACY = {"rules", "agents", "test-case", "templates", "memory"}

SKILLS_ALLOWED_DIRS = {"scene-skill"}

SCENE_ALLOWED_DIRS = {"components", "scripts", "references", "frame", "_shared"}

# 忽略的杂项 (不报 warn)
IGNORE_ROOT_ENTRIES = {".git", ".DS_Store", ".gitignore", ".work-records", ".claude", "node_modules", "__pycache__"}

TRIPLET_FILES = {"template.html", "schema.json", "demo.json"}


def run(workspace_root: str) -> Report:
    report = Report(check_name="layout")

    if not os.path.isdir(workspace_root):
        report.add_fail(
            workspace_root,
            "layout:workspace_missing",
            f"workspace 目录不存在: {workspace_root}",
        )
        return report

    # ---- 1. root 层 ----
    try:
        root_entries = os.listdir(workspace_root)
    except OSError as e:
        report.add_fail(workspace_root, "layout:root_read_error", str(e))
        return report

    for entry in root_entries:
        if entry in IGNORE_ROOT_ENTRIES:
            continue
        full = os.path.join(workspace_root, entry)
        is_dir = os.path.isdir(full)

        if is_dir:
            if entry in ROOT_REV7_LEGACY:
                report.add_warn(
                    entry + "/",
                    "layout:rev7_legacy_dir",
                    f"根目录 {entry}/ 是 rev7 残留, save 时会被 backend filter",
                    fix_hint="迁到 skills/scene-skill/ 下或删除",
                )
            elif entry not in ROOT_ALLOWED_DIRS:
                report.add_warn(
                    entry + "/",
                    "layout:root_dir_not_allowed",
                    f"根目录 {entry}/ 不在白名单 (仅允许 skills/), save 会被 filter",
                    fix_hint="移到 skills/scene-skill/ 下",
                )
        else:
            if entry not in ROOT_ALLOWED_FILES:
                report.add_warn(
                    entry,
                    "layout:root_file_not_allowed",
                    f"根目录文件 {entry} 不在白名单 (仅允许 CLAUDE.md), save 会被 filter",
                    fix_hint="移到 skills/scene-skill/ 下或删除",
                )

    # ---- 2. skills/ 层 ----
    skills_dir = os.path.join(workspace_root, "skills")
    if not os.path.isdir(skills_dir):
        report.add_warn(
            "skills/",
            "layout:skills_missing",
            "workspace 未初始化 skills/ 目录",
        )
        return report

    for entry in os.listdir(skills_dir):
        if entry in IGNORE_ROOT_ENTRIES:
            continue
        full = os.path.join(skills_dir, entry)
        if os.path.isdir(full):
            if entry not in SKILLS_ALLOWED_DIRS:
                report.add_warn(
                    f"skills/{entry}/",
                    "layout:skills_dir_not_allowed",
                    f"skills/{entry}/ 不是 scene-skill, save 会被 filter (SCENE_BUILDER_PATHS 只覆盖 skills/scene-skill/**)",
                    fix_hint="删除或改名为 scene-skill",
                )
        else:
            report.add_warn(
                f"skills/{entry}",
                "layout:skills_stray_file",
                f"skills/ 下不应有游离文件 {entry}",
            )

    # ---- 3. skills/scene-skill/ ----
    scene_dir = os.path.join(skills_dir, "scene-skill")
    if not os.path.isdir(scene_dir):
        report.add_warn(
            "skills/scene-skill/",
            "layout:scene_skill_missing",
            "workspace 未初始化 skills/scene-skill/",
        )
        return report

    for entry in os.listdir(scene_dir):
        if entry in IGNORE_ROOT_ENTRIES:
            continue
        full = os.path.join(scene_dir, entry)
        if os.path.isdir(full):
            if entry not in SCENE_ALLOWED_DIRS:
                report.add_warn(
                    f"skills/scene-skill/{entry}/",
                    "layout:scene_dir_unknown",
                    f"scene-skill/ 下未知目录 {entry}/, 允许列表: {sorted(SCENE_ALLOWED_DIRS)}",
                )
        # 顶层文件不做强制约束 (SKILL.md/actions.json/flow.json/compile.py/README.md 都合法)

    # ---- 4. components/ 下三件套 ----
    components_dir = os.path.join(scene_dir, "components")
    if os.path.isdir(components_dir):
        for comp_name in os.listdir(components_dir):
            if comp_name in IGNORE_ROOT_ENTRIES:
                continue
            comp_path = os.path.join(components_dir, comp_name)
            if not os.path.isdir(comp_path):
                report.add_warn(
                    f"skills/scene-skill/components/{comp_name}",
                    "layout:component_not_dir",
                    "components/ 下应只有子目录 (三件套), 不应有游离文件",
                )
                continue

            existing = set(os.listdir(comp_path))
            missing = TRIPLET_FILES - existing
            if missing:
                report.add_fail(
                    f"skills/scene-skill/components/{comp_name}/",
                    "layout:triplet_incomplete",
                    f"组件目录缺三件套: {sorted(missing)}",
                    fix_hint=f"补齐: {', '.join(sorted(missing))}",
                )

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
