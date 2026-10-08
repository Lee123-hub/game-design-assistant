#!/usr/bin/env python3
"""check_script_exists.py — 双向检查 actions.json 中 script handler 引用的脚本文件.

规范依据: references/01-scope.md — 每个 handler.type=="script" 的 handler.path 必须存在;
反向: scripts/ 下所有 .py 必须被至少一个 script handler 引用 (孤儿脚本 warn).

用法:
  python3 check_script_exists.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"
SCENE_REL = "skills/scene-skill"
SCRIPTS_REL = "skills/scene-skill/scripts"


def _iter_handlers(node, path_prefix=""):
    """深度遍历 actions.json, yield (json_path, handler_dict) 对.
    handler 判定: dict 且含 "type" 字段.
    """
    if isinstance(node, dict):
        # 判为 handler
        if "type" in node and isinstance(node.get("type"), str):
            yield path_prefix, node
        for k, v in node.items():
            if k.startswith("_"):  # _meta, _comment 等
                continue
            yield from _iter_handlers(v, f"{path_prefix}.{k}" if path_prefix else k)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            yield from _iter_handlers(item, f"{path_prefix}[{i}]")


def run(workspace_root: str) -> Report:
    report = Report(check_name="script_exists")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL,
            "script_exists:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip",
        )
        return report

    try:
        with open(actions_path, "r", encoding="utf-8") as f:
            actions = json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(
            ACTIONS_REL,
            "script_exists:invalid_json",
            f"actions.json JSON 解析失败: {e}",
        )
        return report
    except OSError as e:
        report.add_fail(ACTIONS_REL, "script_exists:read_error", str(e))
        return report

    scene_dir = os.path.join(workspace_root, SCENE_REL)

    # ---- 正向: actions.json 引用的每个 script 必须存在 ----
    referenced = set()
    handler_count = 0
    for json_path, handler in _iter_handlers(actions):
        handler_count += 1
        if handler.get("type") != "script":
            continue
        script_path = handler.get("path")
        if not script_path or not isinstance(script_path, str):
            report.add_fail(
                f"{ACTIONS_REL}:{json_path}",
                "script_exists:missing_path",
                f"script handler 缺 path 字段 (或非字符串): {handler}",
            )
            continue

        # 归一化 (兼容以 / 开头或含 ./)
        norm = script_path.lstrip("./").lstrip("/")
        referenced.add(norm)

        abs_script = os.path.join(scene_dir, norm)
        if not os.path.isfile(abs_script):
            report.add_fail(
                f"{SCENE_REL}/{norm}",
                "script_exists:file_not_found",
                f"actions.json {json_path} 引用的脚本不存在",
                fix_hint=f"创建文件 {SCENE_REL}/{norm} 或改 handler.path",
            )

    # ---- 反向: scripts/ 下所有 .py 必须被引用 ----
    scripts_dir = os.path.join(workspace_root, SCRIPTS_REL)
    if os.path.isdir(scripts_dir):
        for dirpath, _, filenames in os.walk(scripts_dir):
            for fname in filenames:
                if not fname.endswith(".py"):
                    continue
                if fname.startswith("_") or fname == "__init__.py":
                    continue
                abs_path = os.path.join(dirpath, fname)
                rel_to_scene = os.path.relpath(abs_path, scene_dir).replace(os.sep, "/")
                if rel_to_scene not in referenced:
                    report.add_warn(
                        f"{SCENE_REL}/{rel_to_scene}",
                        "script_exists:orphan_script",
                        "scripts/ 下的脚本未被任何 actions.json script handler 引用",
                        fix_hint="删除脚本, 或在 actions.json 加一个 handler 引用它",
                    )

    report.add_info(
        ACTIONS_REL,
        "script_exists:summary",
        f"扫描 {handler_count} 个 handler, 其中 {len(referenced)} 个 script 引用",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
