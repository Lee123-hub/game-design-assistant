"""从 backend/src/utils/paths_matcher.py 保持同步.

语义: rev8 SCENE_BUILDER_PATHS 白名单匹配, 用于校验脚本判断 workspace 文件是否合规.

三档规则:
  1. 精确匹配:     "CLAUDE.md"                    → path == pattern
  2. 递归子树:     "skills/scene-skill/**"         → path 以 prefix + "/" 开头 或 == prefix
  3. 单层扩展名:   "skills/*.md"                   → dir 相同 且 basename 后缀匹配 (只匹配一级)

Semantics:
  - pattern 用 **workspace-root 相对** 路径, 不带 ".claude/" 前缀
  - path 也同样 workspace-root 相对
  - 空 pattern 列表 = 不 filter (视为全通过), 跟 agent 侧行为对齐
"""
from __future__ import annotations


def _match_one(path: str, pattern: str) -> bool:
    if not path or not pattern:
        return False
    if pattern == path:
        return True
    if pattern.endswith("/**"):
        prefix = pattern[:-3]  # 去掉 "/**"
        if not prefix:
            return True  # "**" 匹配所有
        return path == prefix or path.startswith(prefix + "/")
    if "/*." in pattern and pattern.count("*") == 1:
        # e.g. "skills/*.md"
        slash_idx = pattern.rfind("/")
        if slash_idx < 0:
            return False
        pat_dir = pattern[:slash_idx]
        pat_ext = pattern[slash_idx + 2:]  # 剥 "/*"
        p_slash = path.rfind("/")
        if p_slash < 0:
            return pat_dir == "" and path.endswith(pat_ext)
        return path[:p_slash] == pat_dir and path.endswith(pat_ext)
    return False


def matches_any(path: str, patterns: list[str]) -> bool:
    """path 是否命中任一 pattern. 空 patterns 视为全通过."""
    if not patterns:
        return True
    return any(_match_one(path, p) for p in patterns)


def filter_by_paths(paths: list[str], whitelist: list[str]) -> list[str]:
    """返 paths 中命中 whitelist 的子集. 空 whitelist 直接返 paths."""
    if not whitelist:
        return list(paths)
    return [p for p in paths if matches_any(p, whitelist)]
