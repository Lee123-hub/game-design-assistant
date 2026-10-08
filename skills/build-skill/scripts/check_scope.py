#!/usr/bin/env python3
"""check_scope.py — 检查 workspace 内所有文件是否命中 SCENE_BUILDER_PATHS 白名单.

规范依据: references/01-scope.md — SCENE_BUILDER_PATHS 白名单; 未命中文件 backend save 时会被过滤.

用法:
  python3 check_scope.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402
from _lib.paths_matcher import matches_any  # noqa: E402


SCENE_BUILDER_PATHS = [
    "CLAUDE.md",
    "skills/scene-skill/**",
]

# 忽略这些 (跟 skill scope 无关, 不需要 warn)
IGNORE_PATTERNS = [
    ".git/**",
    ".git",
    ".DS_Store",
    "**/.DS_Store",
    "**/__pycache__/**",
    "**/*.pyc",
    ".work-records/**",
    ".claude/**",
]


def run(workspace_root: str) -> Report:
    report = Report(check_name="scope")

    if not os.path.isdir(workspace_root):
        report.add_fail(
            workspace_root,
            "scope:workspace_missing",
            f"workspace 目录不存在: {workspace_root}",
        )
        return report

    checked = 0
    for dirpath, dirnames, filenames in os.walk(workspace_root):
        # skip .git 等重目录避免全量扫
        dirnames[:] = [d for d in dirnames if d not in (".git", "__pycache__", ".work-records", ".claude", "node_modules")]

        for fname in filenames:
            abs_path = os.path.join(dirpath, fname)
            rel_path = os.path.relpath(abs_path, workspace_root)
            # 规整为 posix 分隔符供 matcher 使用
            rel_posix = rel_path.replace(os.sep, "/")

            if matches_any(rel_posix, IGNORE_PATTERNS):
                continue

            checked += 1

            if not matches_any(rel_posix, SCENE_BUILDER_PATHS):
                report.add_warn(
                    rel_posix,
                    "scope:out_of_whitelist",
                    "文件超出 SCENE_BUILDER_PATHS 白名单, save 时会被 backend filter 掉",
                    fix_hint="移到 CLAUDE.md 或 skills/scene-skill/ 下",
                )

    report.add_info(
        workspace_root,
        "scope:summary",
        f"共扫描 {checked} 个文件 (已排除 .git/__pycache__/.work-records 等)",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
