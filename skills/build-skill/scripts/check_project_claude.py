#!/usr/bin/env python3
"""check_project_claude.py — 校验 project CLAUDE.md 结构.

规范依据: build-skill/SKILL.md §S6 CLAUDE.md 模板
运行时消费者: 主对话 agent (读工作副本根 `CLAUDE.md` 作人设 / 工作指令)

检查项:
  1. 长度约束: < 100 行 → info "内容较少 (empty template 起步合法)"; > 1000 行 → warn "可拆分到 references/"
  2. 必需段 (启发式关键词命中, 缺 → warn):
     - 铁律段 ("铁律" / "CRITICAL" / "必读" / "禁止")
     - step 状态机段 ("stages" / "step" 状态机 / "组件列表" / componentId 表格)
     - 触发词段 (`[TRIGGER:` 字面量)
     - 输出决策段 ("conclusion" / "三选一" / "html-component")
  3. 推荐段 (缺 → info):
     - callAction 段
     - 组件×actionType 名单
     - 业务知识段 (metric / tier / 特殊规则)
  4. componentId 提及交叉验证 (跟 actions.json 顶层 keys 对齐, info 不 warn)
  5. compile.py 老版调用示例 (命中老签名 → warn):
     - `compile.py --component ...` / `--output-dir ...` 老 argparse 会误导主对话 agent,
       backend _run_compile 只接受 --input/--output

注: 不再校验 TRIGGER NAME 白名单. 具体 TRIGGER 集合由每个 project 自己维护;
build-skill 只保证语法合法 (语法校验在 check_agent_prompt.py).

用法:
  python3 check_project_claude.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import re
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402


CLAUDE_MD_REL = "CLAUDE.md"                        # workspace-root 相对
ACTIONS_JSON_REL = "skills/scene-skill/actions.json"


def _read_file(root: str, rel: str) -> str | None:
    """Read utf-8 file. None if missing."""
    path = os.path.join(root, rel)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def _read_json(root: str, rel: str):
    """Read + parse JSON. (data, error_str_or_None)."""
    path = os.path.join(root, rel)
    if not os.path.isfile(path):
        return None, f"{rel} not found"
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except (OSError, json.JSONDecodeError) as e:
        return None, str(e)


# ---------- 段检查 ----------

def _has_any(content: str, keywords: list[str]) -> bool:
    """content 里含任一 keyword (大小写敏感对英文; 中文原样)."""
    return any(kw in content for kw in keywords)


REQUIRED_SECTIONS = [
    # (name, keywords, warn_message)
    (
        "ironclad",
        ["铁律", "CRITICAL", "必读", "禁止", "NEVER"],
        "缺铁律段 (未检出 '铁律' / 'CRITICAL' / 'NEVER' 等关键词), agent 不知道能做/不能做啥",
    ),
    (
        "step_state_machine",
        ["step 状态机", "Step 状态机", "step1", "step2", "stages", "状态机", "组件列表", "componentId 白名单"],
        "缺 step 状态机段 (未检出 stage / step 描述), agent 不知道有哪些组件与流转",
    ),
    (
        "triggers",
        ["[TRIGGER:", "触发词"],
        "缺触发词段 (未检出 '[TRIGGER:' 或 '触发词' 关键词), agent 收到 backend 触发词消息无解析规则",
    ),
    (
        "output_decision",
        ["conclusion", "三选一", "html-component", "输出决策"],
        "缺输出决策段 (未检出 'conclusion' / '三选一' / 'html-component'), agent 不知道最终 conclusion 格式",
    ),
]

RECOMMENDED_SECTIONS = [
    (
        "call_action",
        ["callAction", "call_action", "call-action", "组件内点按钮"],
        "建议补 callAction 闭环说明 (组件按钮 → backend → agent 触发词的回路)",
    ),
    (
        "component_action_matrix",
        ["actionType", "action_type", "action 名单", "组件×", "组件x"],
        "建议补组件×actionType 速查表 (跟 actions.json 对齐, 减少 agent 猜)",
    ),
    (
        "business_knowledge",
        ["metric", "tier", "特殊规则", "业务", "指标"],
        "建议补业务知识段 (metric / tier / 场景特殊规则)",
    ),
]


def _check_required_sections(content: str, report: Report):
    for name, kws, msg in REQUIRED_SECTIONS:
        if not _has_any(content, kws):
            report.add_warn(
                CLAUDE_MD_REL,
                f"project_claude:missing_section:{name}",
                msg,
                fix_hint=f"补一段含关键词之一: {kws[:3]}",
            )


def _check_recommended_sections(content: str, report: Report):
    for name, kws, msg in RECOMMENDED_SECTIONS:
        if not _has_any(content, kws):
            report.add_info(
                CLAUDE_MD_REL,
                f"project_claude:missing_recommended:{name}",
                msg,
            )


# ---------- 长度约束 ----------

def _check_length(content: str, report: Report):
    lines = content.count("\n") + 1
    if lines < 100:
        # 降级 info: empty template 起步时 CLAUDE.md 常常是空壳 (合法起点),
        # 不该 warn. 段完整性由 _check_required_sections 独立把关.
        report.add_info(
            CLAUDE_MD_REL,
            "project_claude:short",
            f"CLAUDE.md 仅 {lines} 行 (empty template 起步合法, 迭代过程逐步补齐即可)",
        )
    elif lines > 1000:
        report.add_warn(
            CLAUDE_MD_REL,
            "project_claude:too_long",
            f"CLAUDE.md {lines} 行, 建议拆分到 references/ (预期 <1000)",
            fix_hint="把细节文档挪去 references/*.md, CLAUDE.md 只留主线",
        )


# ---------- componentId 交叉验证 (info) ----------

_ID_LIKE_RE = re.compile(r'`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`')


def _check_components(content: str, workspace_root: str, report: Report):
    """检查 CLAUDE.md 提到但 actions.json 没的 componentId 提及 (info 级别)."""
    actions, err = _read_json(workspace_root, ACTIONS_JSON_REL)
    if err or actions is None or not isinstance(actions, dict):
        return  # actions.json 无法读或非法, 跳过 (其他 check 会报)

    action_components = {k for k in actions.keys() if not k.startswith("_")}
    if not action_components:
        return

    # 从 CLAUDE.md markdown code span 抽像 componentId 的 identifier
    mentioned = set(_ID_LIKE_RE.findall(content))
    # 过滤明显不是 componentId 的 (含 / 或 . 或太短)
    mentioned = {
        m for m in mentioned
        if "/" not in m and "." not in m and len(m) > 3
    }

    orphans = mentioned - action_components
    # 只保留看着像业务 componentId 的 (含 hyphen 已在正则保证; 再去掉常见非 componentId
    # 词条: python3, e.g., etc; 保留全小写含 hyphen)
    # 因 false positive 多, 只 info 级别报 top 5
    if orphans:
        sample = sorted(orphans)[:5]
        report.add_info(
            CLAUDE_MD_REL,
            "project_claude:mentioned_not_in_actions",
            f"CLAUDE.md 提到但 actions.json 没的可疑 componentId (top5): {sample}",
        )

    # 反向: actions.json 有的但 CLAUDE.md 没提到 → info (可能新加 component 忘了写文档)
    unmentioned = action_components - mentioned
    if unmentioned:
        report.add_info(
            CLAUDE_MD_REL,
            "project_claude:action_component_not_documented",
            f"actions.json 有但 CLAUDE.md 未提到的 componentId: {sorted(unmentioned)}",
        )


# ---------- compile.py 老版调用示例扫 ----------

# 命中判据: "compile.py" + 老 argparse 长选项 (`--component` / `--output-dir`)
# 之所以不用 `_OLD_COMPILE_MARKER` 那个 add_argument 正则 (那是校验 python 源码的),
# 这里扫的是 markdown 里的 bash shell 示例, 命中 CLI 参数字面就够了.
_OLD_COMPILE_CALL_RE = re.compile(
    r'compile\.py[^\n]{0,200}(--component|--output-dir)',
    re.MULTILINE,
)


def _check_old_compile_call(content: str, report: Report):
    """扫 CLAUDE.md 里给主对话 agent 看的 compile.py 老版调用示例."""
    for m in _OLD_COMPILE_CALL_RE.finditer(content):
        # 定位行号 (approximate, 1-based)
        line = content.count("\n", 0, m.start()) + 1
        report.add_warn(
            CLAUDE_MD_REL,
            "project_claude:old_compile_call",
            f"CLAUDE.md 出现老版 compile.py 调用示例 (含 {m.group(1)}), 会误导主对话 agent; "
            "backend _run_compile 契约是 --input/--output",
            line=line,
            fix_hint='改成 `python3 compile.py --input <payload.json> --output <artifact.html>`',
        )


# ---------- 主入口 ----------

def run(workspace_root: str) -> Report:
    report = Report(check_name="project_claude")

    content = _read_file(workspace_root, CLAUDE_MD_REL)
    if content is None:
        report.add_warn(
            CLAUDE_MD_REL,
            "project_claude:missing",
            "workspace 缺 CLAUDE.md, 主对话 agent 无人设/工作指令 (SKILL.md §S6)",
            fix_hint="按模板补一份 CLAUDE.md (含铁律 / step 状态机 / 触发词 / conclusion 4 段)",
        )
        return report

    _check_length(content, report)
    _check_required_sections(content, report)
    _check_recommended_sections(content, report)
    _check_components(content, workspace_root, report)
    _check_old_compile_call(content, report)

    report.add_info(
        CLAUDE_MD_REL,
        "project_claude:summary",
        f"CLAUDE.md {content.count(chr(10)) + 1} 行, {len(content)} 字符",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
