#!/usr/bin/env python3
"""check_script_contract.py — 校验 scripts/*.py 头 docstring + 边界规则.

规范依据: references/07-script-contract.md §三、§四、§五 —
  - 头部 docstring 必须含 契约/原意/沙箱 三段 (缺一 warn)
  - 必须有 `if __name__ == '__main__':` block (缺 fail)
  - 边界规则:
    * import requests/httpx/urllib/pymysql/psycopg → fail (违反沙箱)
    * import openpyxl/xlsxwriter + .save()/.write() → warn (写 xlsx 应在 backend)
    * subprocess/os.system → fail (禁 subprocess)

用法:
  python3 check_script_contract.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


SCRIPTS_REL = "skills/scene-skill/scripts"

# docstring 三段关键字 (大小写不敏感)
_CONTRACT_KEYS = ["契约", "contract", "输入", "输出", "return", "returns"]
_PURPOSE_KEYS = ["原意", "purpose", "对应", "actions.json", "handler"]
_SANDBOX_KEYS = ["沙箱", "sandbox", "0 io", "0 网络", "0 iо", "依赖", "副作用"]

_RE_MAIN = re.compile(r"if\s+__name__\s*==\s*['\"]__main__['\"]\s*:")

# 禁用 import
_RE_IMPORT_NET = re.compile(
    r"^\s*(?:import|from)\s+(requests|httpx|urllib(?:\.|$)|urllib2|pymysql|psycopg2?|MySQLdb|pymongo|redis|aiohttp)\b",
    re.MULTILINE,
)
_RE_IMPORT_XLSX = re.compile(
    r"^\s*(?:import|from)\s+(openpyxl|xlsxwriter|xlwt)\b",
    re.MULTILINE,
)
_RE_XLSX_WRITE = re.compile(r"\.(?:save|write)\s*\(")
_RE_SUBPROCESS = re.compile(
    r"^\s*(?:import\s+subprocess|from\s+subprocess\s+import|import\s+os[^\n]*)",
    re.MULTILINE,
)
_RE_OS_SYSTEM = re.compile(r"\bos\.system\s*\(|\bsubprocess\.(?:run|Popen|call|check_output|check_call)\s*\(")


def _extract_module_docstring(head: str) -> str:
    """从文件前 40 行提取 module docstring 文本 (三重引号包裹).

    找不到返 "".
    """
    # 允许 `#!` shebang + `# -*- coding` 前置
    lines = head.splitlines()
    text = "\n".join(lines)

    # 找 module 起始的三重引号 (跳过 shebang/coding)
    m = re.search(r'^(?:#[^\n]*\n)*\s*(?:r|u|b)?("""|\'\'\')', text, re.MULTILINE)
    if not m:
        return ""
    quote = m.group(1)
    start = m.end()
    end = text.find(quote, start)
    if end == -1:
        return text[start:]
    return text[start:end]


def _check_docstring_sections(doc: str, rel_path: str, report: Report):
    if not doc.strip():
        report.add_warn(
            rel_path, "script:no_docstring",
            "文件头无 module docstring",
            fix_hint='在文件顶端加 """契约: ... 原意: ... 沙箱: ..."""',
        )
        return
    low = doc.lower()

    def _has_any(keys):
        for k in keys:
            if k in doc or k.lower() in low:
                return True
        return False

    if not _has_any(_CONTRACT_KEYS):
        report.add_warn(
            rel_path, "script:doc_missing_contract",
            "docstring 缺 [契约] 段 (I/O JSON schema)",
            fix_hint="加 `契约: args.payload/args.input/return {success, data}`",
        )
    if not _has_any(_PURPOSE_KEYS):
        report.add_warn(
            rel_path, "script:doc_missing_purpose",
            "docstring 缺 [原意] 段 (对应 actions.json 里的 handler)",
            fix_hint="加 `原意: 对应 actions.json: <cid>.<actionType> 的 script handler`",
        )
    if not _has_any(_SANDBOX_KEYS):
        report.add_warn(
            rel_path, "script:doc_missing_sandbox",
            "docstring 缺 [沙箱] 段 (副作用/依赖声明)",
            fix_hint="加 `沙箱: 0 IO / 0 网络 / 0 subprocess, 依赖: pandas numpy`",
        )


def _check_boundaries(text: str, rel_path: str, report: Report):
    # 禁用 net import (fail)
    for m in _RE_IMPORT_NET.finditer(text):
        mod = m.group(1)
        line = text.count("\n", 0, m.start()) + 1
        report.add_fail(
            rel_path, "script:forbidden_net_import",
            f"import {mod} 违反沙箱 (0 网络), 应拆到 backend call handler",
            line=line,
            fix_hint="移到 backend 的 call handler; script 仅做纯计算",
        )

    # openpyxl/xlsxwriter + 写入 (warn)
    has_xlsx_import = bool(_RE_IMPORT_XLSX.search(text))
    has_write = bool(_RE_XLSX_WRITE.search(text))
    if has_xlsx_import and has_write:
        report.add_warn(
            rel_path, "script:xlsx_write",
            "import xlsx 写库 + .save()/.write() 检出, 写 xlsx 应在 backend",
            fix_hint="script 只读, 写落到 backend call handler",
        )

    # subprocess / os.system (fail)
    for m in _RE_OS_SYSTEM.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        report.add_fail(
            rel_path, "script:subprocess_forbidden",
            f"检出 {m.group(0)} — 禁止在 script 里跑 subprocess/os.system",
            line=line,
            fix_hint="移到 backend, script 仅纯计算",
        )
    # 单独抓 `import subprocess`
    for m in re.finditer(r"^\s*(?:import\s+subprocess|from\s+subprocess\s+import)", text, re.MULTILINE):
        line = text.count("\n", 0, m.start()) + 1
        report.add_fail(
            rel_path, "script:subprocess_import_forbidden",
            "import subprocess 违反沙箱",
            line=line,
        )


def _check_script(spath: str, workspace_root: str, report: Report):
    rel_path = os.path.relpath(spath, workspace_root)
    try:
        with open(spath, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        report.add_warn(rel_path, "script:read_error", str(e))
        return

    head = "\n".join(text.splitlines()[:40])
    doc = _extract_module_docstring(head)
    _check_docstring_sections(doc, rel_path, report)

    if not _RE_MAIN.search(text):
        report.add_fail(
            rel_path, "script:no_main_block",
            "缺 if __name__ == '__main__': block (agent stdin 入口)",
            fix_hint="结尾加 `if __name__ == '__main__': args = json.load(sys.stdin); ...`",
        )

    _check_boundaries(text, rel_path, report)


def run(workspace_root: str) -> Report:
    report = Report(check_name="script_contract")

    scripts_dir = os.path.join(workspace_root, SCRIPTS_REL)
    if not os.path.isdir(scripts_dir):
        report.add_warn(SCRIPTS_REL, "script:scripts_dir_missing", "scripts/ 目录不存在, skip")
        return report

    checked = 0
    for root, dirs, files in os.walk(scripts_dir):
        # skip _lib / __pycache__
        dirs[:] = [d for d in dirs if not d.startswith("_") and not d.startswith(".")]
        for f in files:
            if not f.endswith(".py"):
                continue
            if f.startswith("__") and f.endswith("__.py"):
                continue
            if f.startswith("_"):
                continue
            _check_script(os.path.join(root, f), workspace_root, report)
            checked += 1

    if checked == 0:
        report.add_warn(SCRIPTS_REL, "script:no_py_files", "scripts/ 下无 .py 文件")
    else:
        report.add_info(SCRIPTS_REL, "script:summary", f"checked {checked} scripts")

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
