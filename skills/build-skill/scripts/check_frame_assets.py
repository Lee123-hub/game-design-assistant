#!/usr/bin/env python3
"""check_frame_assets.py — 校验 project 里的 frame 公共资源与 build-skill 标杆是否一致.

规范依据: SKILL.md §S2 骨架 — compile.py + frame/scene-tokens.css + frame/scene-frame.js
+ frame/_shared/*.html 是跨 project 共享的运行时公共资源, build-skill/frame/ 是标杆.

管辖资源 (workspace 相对路径):
  - skills/scene-skill/compile.py                    ← 组件编译器 (通用版本, 不含业务硬编码)
  - skills/scene-skill/frame/scene-tokens.css        ← CSS 变量
  - skills/scene-skill/frame/scene-frame.js          ← runtime 支持
  - skills/scene-skill/frame/_shared/topbar.html     ← 公共 HTML 片段
  - skills/scene-skill/frame/_shared/footer-nav.html ← 公共 HTML 片段

用法:
  python3 check_frame_assets.py --workspace <path> [--json] [--auto-fix]

--auto-fix: 缺失 / 老版 / 有 diff 时直接从标杆覆盖 project 侧文件.

Exit code:
  0 pass, 1 warn (有 diff 但未 auto-fix), 2 fail (缺失或老版 compile.py 且未 auto-fix)
"""
import argparse
import hashlib
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, parse_args_common  # noqa: E402


SCENE_REL = "skills/scene-skill"

# (workspace 相对路径, 标杆文件名 in build-skill/frame/, 是否 critical)
# critical=True → 缺失 / 老版本时 fail; False → warn
_ASSETS = [
    ("skills/scene-skill/compile.py",                    "compile.py",              True),
    ("skills/scene-skill/frame/scene-tokens.css",        "scene-tokens.css",        False),
    ("skills/scene-skill/frame/scene-frame.js",          "scene-frame.js",          False),
    ("skills/scene-skill/frame/_shared/topbar.html",     "_shared/topbar.html",     False),
    ("skills/scene-skill/frame/_shared/footer-nav.html", "_shared/footer-nav.html", False),
]

# 老版 compile.py 特征: 缺 --input/--output argparse. 通用版必有 --input.
_NEW_COMPILE_MARKER = re.compile(r'add_argument\(\s*[\'"]--input[\'"]')
_HAS_COMPONENT_ARG = re.compile(r'add_argument\(\s*[\'"]--component[\'"]')


def _canon_frame_dir() -> str:
    """标杆 frame/ 目录 = 本脚本所在 scripts/ 的兄弟 frame/."""
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frame"))


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_old_compile(content: str) -> bool:
    """判定 compile.py 是不是老版 (缺 --input argparse).

    通用版 compile.py 一定含 --input; 老版只有 --component/--data/--id/--output-dir,
    与 backend `_run_compile` 的 --input/--output 契约不符, 会 exit 2.
    """
    return bool(_HAS_COMPONENT_ARG.search(content)) and not _NEW_COMPILE_MARKER.search(content)


def _auto_fix(canon_path: str, project_path: str) -> None:
    os.makedirs(os.path.dirname(project_path), exist_ok=True)
    shutil.copyfile(canon_path, project_path)


def run(workspace_root: str, auto_fix: bool = False) -> Report:
    report = Report(check_name="frame_assets")

    canon_frame = _canon_frame_dir()
    if not os.path.isdir(canon_frame):
        # 标杆缺失 = build-skill 自己坏了, 让 agent 感知
        report.add_fail(
            "<build-skill/frame>",
            "frame_assets:canon_missing",
            f"标杆目录不存在: {canon_frame}. build-skill 部署损坏, 无法校验/修复.",
        )
        return report

    scene_dir = os.path.join(workspace_root, SCENE_REL)
    if not os.path.isdir(scene_dir):
        # project 未初始化 → skip (让 create-skeleton / 引导创建流程去建)
        report.add_info(
            SCENE_REL,
            "frame_assets:not_initialized",
            "scene-skill 目录不存在, workspace 未初始化, skip",
        )
        return report

    for rel, canon_name, critical in _ASSETS:
        canon_path = os.path.join(canon_frame, canon_name)
        project_path = os.path.join(workspace_root, rel)

        if not os.path.isfile(canon_path):
            report.add_fail(
                f"<build-skill/frame>/{canon_name}",
                "frame_assets:canon_asset_missing",
                f"标杆资源缺失: {canon_path}",
            )
            continue

        # 1) project 侧缺失
        if not os.path.isfile(project_path):
            if auto_fix:
                _auto_fix(canon_path, project_path)
                report.add_info(
                    rel,
                    "frame_assets:missing_auto_fixed",
                    f"缺失 → 已从标杆 {canon_name} 拷入",
                )
            elif critical:
                report.add_fail(
                    rel,
                    "frame_assets:missing",
                    f"必需 frame 资源缺失",
                    fix_hint=f"cp .claude/skills/build-skill/frame/{canon_name} {rel}  或跑 --auto-fix",
                )
            else:
                report.add_warn(
                    rel,
                    "frame_assets:missing",
                    f"frame 资源缺失",
                    fix_hint=f"cp .claude/skills/build-skill/frame/{canon_name} {rel}  或跑 --auto-fix",
                )
            continue

        # 2) compile.py 特化: 老版本检测 (严于 hash diff)
        if canon_name == "compile.py":
            try:
                content = open(project_path, "r", encoding="utf-8", errors="replace").read()
            except OSError as e:
                report.add_fail(rel, "frame_assets:read_error", str(e))
                continue

            if _is_old_compile(content):
                if auto_fix:
                    _auto_fix(canon_path, project_path)
                    report.add_info(
                        rel,
                        "frame_assets:old_compile_auto_fixed",
                        "老版 compile.py → 已用通用标杆覆盖",
                    )
                else:
                    report.add_fail(
                        rel,
                        "frame_assets:old_compile_signature",
                        "compile.py 是老版 argparse (缺 --input), "
                        "与 backend _run_compile 契约不符, 组件预览会 exit 2",
                        fix_hint="跑 --auto-fix, 或 cp .claude/skills/build-skill/frame/compile.py 覆盖",
                    )
                continue

        # 3) hash diff
        canon_hash = _sha256(canon_path)
        project_hash = _sha256(project_path)
        if canon_hash == project_hash:
            continue  # pass, 无 finding

        # 不一致 → warn (用户可能有本地魔改)
        if auto_fix:
            _auto_fix(canon_path, project_path)
            report.add_info(
                rel,
                "frame_assets:diff_auto_fixed",
                f"与标杆 {canon_name} 有 diff → 已用标杆覆盖",
            )
        else:
            report.add_warn(
                rel,
                "frame_assets:hash_diff",
                f"与标杆 {canon_name} 内容不同 (project={project_hash[:12]}, canon={canon_hash[:12]})",
                fix_hint="确认是否是本地魔改; 若无, 跑 --auto-fix 或手动 cp 标杆覆盖",
            )

    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--workspace", required=True, help="Workspace root path")
    p.add_argument("--json", action="store_true", help="Emit JSON to stdout")
    p.add_argument("--auto-fix", action="store_true",
                   help="缺失 / 老版 / diff 时直接从标杆覆盖 project 文件")
    args = p.parse_args()
    report = run(args.workspace, auto_fix=args.auto_fix)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
