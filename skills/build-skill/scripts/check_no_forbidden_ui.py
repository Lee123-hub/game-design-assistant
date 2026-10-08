#!/usr/bin/env python3
"""check_no_forbidden_ui.py — 校验 template.html 无禁用 API / 硬编码.

规范依据: references/06-component.md §三、§四 —
  - iframe sandbox 会拦 alert/confirm/prompt, 应用自定义 modal
  - 硬编码色值 / URL 都应走 CSS token 或 callAction
  - 直接 fetch('<backend>/component-action') 应替换为 SceneFrame.callAction

用法:
  python3 check_no_forbidden_ui.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


COMPONENTS_REL = "skills/scene-skill/components"

_RE_ALERT = re.compile(r"\balert\s*\(")
_RE_CONFIRM = re.compile(r"\bconfirm\s*\(")
_RE_PROMPT = re.compile(r"\bprompt\s*\(")
_RE_HEX_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b")
_RE_RGB = re.compile(r"\brgba?\s*\(\s*\d")
_RE_URL = re.compile(r"https?://[^\s\"'<>)]+")
_RE_FETCH_ACTION = re.compile(r"fetch\s*\(\s*['\"][^'\"]*/component-action")


def _strip_comments_and_strings(text: str) -> str:
    """粗略剥离 /* ... */ 和 // 注释以及 <!-- ... --> 和字符串常量, 减少误报.

    做法: 保留位置 (用空格替换) 以便 line 计算稳定.
    """
    def _sub_multiline_c(m):
        return " " * len(m.group(0))

    def _sub_html(m):
        return " " * len(m.group(0))

    def _sub_string(m):
        return " " * len(m.group(0))

    # <!-- ... -->
    text = re.sub(r"<!--.*?-->", _sub_html, text, flags=re.DOTALL)
    # /* ... */
    text = re.sub(r"/\*.*?\*/", _sub_multiline_c, text, flags=re.DOTALL)
    # // line comments (行末) — 保守: 仅当前面是空白/行首/分号/花括号时视作注释, 避免 URL 里的 //
    text = re.sub(r"(^|[\s;{}()])//[^\n]*", lambda m: m.group(1) + " " * (len(m.group(0)) - len(m.group(1))), text, flags=re.MULTILINE)
    # 字符串常量 (URL / 十六进制经常在字符串里也要检查, 所以只剥掉后再单独抓 URL/color 不太准)
    # → 不剥字符串, URL/color 通常就写在字符串里
    return text


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def _find_all(pattern: re.Pattern, text: str):
    return [(m.group(0), _line_of(text, m.start())) for m in pattern.finditer(text)]


def _check_template(cid: str, tpl_path: str, report: Report):
    rel_tpl = f"{COMPONENTS_REL}/{cid}/template.html"
    try:
        with open(tpl_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except OSError as e:
        report.add_warn(rel_tpl, "ui:read_error", str(e))
        return

    stripped = _strip_comments_and_strings(raw)

    # ---- alert / confirm / prompt ----
    for token, line in _find_all(_RE_ALERT, stripped):
        report.add_warn(
            rel_tpl, "ui:alert_forbidden",
            "调用 alert() — iframe sandbox 会拦, 用自定义 modal",
            line=line,
            fix_hint="替换为组件内 modal (fixed 定位 + 自绘按钮)",
        )
    for token, line in _find_all(_RE_CONFIRM, stripped):
        report.add_warn(
            rel_tpl, "ui:confirm_forbidden",
            "调用 confirm() — iframe sandbox 会拦, 用自定义 modal",
            line=line,
        )
    for token, line in _find_all(_RE_PROMPT, stripped):
        report.add_warn(
            rel_tpl, "ui:prompt_forbidden",
            "调用 prompt() — iframe sandbox 会拦, 用自定义 modal",
            line=line,
        )

    # ---- 硬编码色值 ----
    hex_count = 0
    for token, line in _find_all(_RE_HEX_COLOR, stripped):
        # 允许在 --sc- 变量定义所在行 (token 定义本身)
        # 简单判断: 该行是否含 "--sc-" 或 ":root"
        line_text = raw.splitlines()[line - 1] if line - 1 < len(raw.splitlines()) else ""
        if "--sc-" in line_text or ":root" in line_text:
            continue
        hex_count += 1
        if hex_count <= 20:  # 避免暴刷
            report.add_info(
                rel_tpl, "ui:hardcoded_color_hex",
                f"硬编码色值 {token}, 建议 var(--sc-color-*)",
                line=line,
                fix_hint="用 frame/scene-tokens.css 里的 --sc-color-* 变量",
            )
    if hex_count > 20:
        report.add_info(
            rel_tpl, "ui:hardcoded_color_hex_more",
            f"另有 {hex_count - 20} 处硬编码 hex 色值 (已省略), 建议整体换 token",
        )

    for token, line in _find_all(_RE_RGB, stripped):
        line_text = raw.splitlines()[line - 1] if line - 1 < len(raw.splitlines()) else ""
        if "--sc-" in line_text:
            continue
        report.add_info(
            rel_tpl, "ui:hardcoded_color_rgb",
            f"硬编码 rgb() 色值, 建议 var(--sc-color-*)",
            line=line,
        )

    # ---- 硬编码 URL (注释已剥, 若还剩在字符串里 → 报) ----
    for token, line in _find_all(_RE_URL, stripped):
        report.add_warn(
            rel_tpl, "ui:hardcoded_url",
            f"硬编码 URL `{token[:60]}` — 应走 callAction 或注入配置",
            line=line,
            fix_hint="用 window.SceneFrame.callAction(type, payload) 让 backend 决定 URL",
        )

    # ---- 直接 fetch /component-action ----
    for token, line in _find_all(_RE_FETCH_ACTION, stripped):
        report.add_warn(
            rel_tpl, "ui:direct_fetch_action",
            "直接 fetch /component-action, 应用 window.SceneFrame.callAction()",
            line=line,
            fix_hint="用 SceneFrame.callAction(type, payload, file?) — 已封装 auth/dialogueId/postMessage",
        )


def run(workspace_root: str) -> Report:
    report = Report(check_name="no_forbidden_ui")

    components_dir = os.path.join(workspace_root, COMPONENTS_REL)
    if not os.path.isdir(components_dir):
        report.add_warn(
            COMPONENTS_REL, "ui:components_dir_missing",
            "components/ 目录不存在, skip",
        )
        return report

    for cid in sorted(os.listdir(components_dir)):
        if cid.startswith(".") or cid.startswith("_"):
            continue
        comp_dir = os.path.join(components_dir, cid)
        if not os.path.isdir(comp_dir):
            continue
        tpl_path = os.path.join(comp_dir, "template.html")
        if not os.path.isfile(tpl_path):
            continue
        _check_template(cid, tpl_path, report)

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
