#!/usr/bin/env python3
"""check_placeholders.py — 扫未替换的 {占位符} 残留 (Hard Rule 7).

规范依据: build-skill/SKILL.md Hard Rule 7 "模板变量用 {占位符} 标注".
Agent 交付前应替换所有占位符, 否则编译期才炸.

判定:
  - 匹配 `\\{([一-龥A-Za-z_][^}]*?)\\}` 内容
  - 白名单 skip: context.* / payload.* / results.* 前缀 (actions.json 模板插值)
  - Python f-string 整行 skip (简化: 含 f" 或 f' 的行)
  - JSON `"$ref": "#/..."` 整行 skip
  - .css 文件整体 skip (CSS 语法有 {})
  - 单字符 loop var i/j/k/n/x/y/z 在 py/js 里 skip
  - 空 {} skip
"""
import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _lib.result import Report, parse_args_common


# 匹配占位符 (中文或 identifier 起头, 允许内部有空格/汉字/符号但不含 })
PLACEHOLDER_RE = re.compile(r'\{([一-龥A-Za-z_][^}]*?)\}')

# 合法用法太多 ({name} 可以是 .format 模板 / dict 字面量 / JSX 表达式 / shape
# 描述). 只有以下形式是"真占位符":
#   1) 含至少一个 CJK 字符 (agent 里默认用中文占位)
#   2) 不含 shape 分隔符 , : ( ) [ ] { — 排除 `{战区主站: org_id}` 之类描述
# 例:  {业务名称} ✓  {示例 URL} ✓  {此处填 xxx} ✓
#      {战区主站: org_id} ✗ (含 :)  {stationRows, ruleResults} ✗ (无 CJK)
CJK_CHAR_RE = re.compile(r'[一-龥]')
SHAPE_SEPARATORS = set(",:()[]{}\"'\\`")

# 合法模板变量前缀 (不算占位符)
LEGIT_ROOTS = {"context", "payload", "results"}

# 单字符 loop var 白名单 (py/js)
SHORT_LOOP_VARS = {"i", "j", "k", "n", "x", "y", "z"}

# 扫描扩展名
SCAN_EXTS = {".json", ".md", ".html", ".py", ".js", ".yaml", ".yml", ".txt"}

# 忽略目录
SKIP_DIRS = {".git", "__pycache__", ".claude", "node_modules", ".work-records", "_lib"}


def is_legit(inner: str, ext: str) -> bool:
    """判断 {inner} 是不是合法模板变量, 不算占位符."""
    text = inner.strip()
    if not text:
        return True
    # loop var (仅 py/js)
    if ext in (".py", ".js") and text in SHORT_LOOP_VARS:
        return True
    # context/payload/results 前缀
    root = text.split(".", 1)[0].split("[", 1)[0].strip()
    if root in LEGIT_ROOTS:
        return True
    return False


def scan_file(rel_path: str, full_path: str, report: Report) -> int:
    """扫单个文件, 找占位符残留. 返 finding 数."""
    ext = os.path.splitext(full_path)[1]
    if ext == ".css":
        return 0  # CSS 语法有 {}, 跳过整个文件

    try:
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        return 0

    found = 0

    for line_num, line in enumerate(content.splitlines(), start=1):
        # f-string 整行 skip (仅 py)
        if ext == ".py" and ('f"' in line or "f'" in line):
            continue
        # JSON $ref 整行 skip
        if '"$ref"' in line and '#/' in line:
            continue

        seen_in_line = set()  # 避免同行同占位符重复报
        for m in PLACEHOLDER_RE.finditer(line):
            inner = m.group(1)
            if is_legit(inner, ext):
                continue
            key = inner.strip()
            # 真占位符规则: 必须含 CJK + 不含 shape 分隔符
            if not CJK_CHAR_RE.search(key):
                continue
            if any(c in SHAPE_SEPARATORS for c in key):
                continue
            if key in seen_in_line:
                continue
            seen_in_line.add(key)
            report.add_warn(
                rel_path,
                "placeholders:unreplaced",
                f"未替换占位符 `{{{inner}}}` (Hard Rule 7)",
                line=line_num,
                fix_hint="改成真实值, 或删除该字段",
            )
            found += 1
    return found


def run(workspace_root: str) -> Report:
    report = Report(check_name="placeholders")
    if not os.path.isdir(workspace_root):
        report.add_fail(workspace_root, "placeholders:workspace_missing", "workspace 目录不存在")
        return report

    scanned = 0
    hit_files = 0
    for root, dirs, files in os.walk(workspace_root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            ext = os.path.splitext(fname)[1]
            if ext not in SCAN_EXTS:
                continue
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, workspace_root)
            n = scan_file(rel_path, full_path, report)
            scanned += 1
            if n > 0:
                hit_files += 1

    report.add_info(
        workspace_root,
        "placeholders:summary",
        f"共扫描 {scanned} 个文件, {hit_files} 个含未替换占位符",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
