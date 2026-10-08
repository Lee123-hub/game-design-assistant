#!/usr/bin/env python3
r"""check_agent_prompt.py — 校验 actions.json 里 agentPrompt 字段 (仅语法).

规范依据: references/03-agent-prompt.md

规则 (纯语法, 不校验具体 TRIGGER NAME 白名单 — 那是 project 自己维护):
  - agentPrompt 空字符串 → OK
  - 非空 → 必须匹配 ^\\s*\\[TRIGGER:([A-Z_]+)([^\\]]*)\\](.*)$
  - `]` 后有内容 (tail) → warn "被 agent 忽略, 建议清理"
  - 缺闭合 `]` → fail
  - 冒号后有空格 [TRIGGER: NAME → warn
  - TRIGGER NAME 必须大写字母 + 下划线 (由正则保证)
"""
import sys
import os
import json
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, parse_args_common  # noqa: E402


ACTIONS_REL = "skills/scene-skill/actions.json"

TRIGGER_STRICT = re.compile(r"^\s*\[TRIGGER:([A-Z_]+)([^\]]*)\](.*)$", re.DOTALL)
TRIGGER_WITH_SPACE = re.compile(r"^\s*\[TRIGGER:\s+", re.DOTALL)
TRIGGER_OPEN_ONLY = re.compile(r"^\s*\[TRIGGER:", re.DOTALL)


def _check_agent_prompt(report: Report, ctx: str, prompt: str):
    if prompt == "":
        return

    stripped = prompt.strip()
    if stripped == "":
        # 只含空白, 等同空
        return

    # 冒号后空格 (warn) — 先探测再拿严格正则匹配
    if TRIGGER_WITH_SPACE.match(prompt):
        report.add_warn(
            ACTIONS_REL, "agent_prompt:colon_space",
            f"{ctx} [TRIGGER: 后含空格, 与规范不符 (应为 [TRIGGER:NAME)",
            fix_hint="删掉冒号后的空格",
        )
        # 继续尝试宽松解析
    # 缺闭合 `]`
    if TRIGGER_OPEN_ONLY.match(prompt) and "]" not in prompt:
        report.add_fail(
            ACTIONS_REL, "agent_prompt:missing_close_bracket",
            f"{ctx} agentPrompt 缺闭合 ]: {prompt!r}",
        )
        return

    m = TRIGGER_STRICT.match(prompt)
    if not m:
        # 非 TRIGGER 形式 (纯自然语言或格式错误)
        if not TRIGGER_OPEN_ONLY.match(prompt.lstrip()):
            report.add_fail(
                ACTIONS_REL, "agent_prompt:not_trigger",
                f"{ctx} agentPrompt 既不是空串也不是 [TRIGGER:...] 形式: {prompt!r}",
                fix_hint='改为 [TRIGGER:NAME k=v ...] 或空串 ""',
            )
        else:
            # 有 [TRIGGER: 前缀但整体不匹配 (可能大小写/字符不合规)
            report.add_fail(
                ACTIONS_REL, "agent_prompt:malformed",
                f"{ctx} agentPrompt 格式非法, TRIGGER NAME 必须大写字母/下划线: {prompt!r}",
            )
        return

    tail = m.group(3).strip()

    if tail:
        report.add_warn(
            ACTIONS_REL, "agent_prompt:tail_ignored",
            f"{ctx} TRIGGER 后段被 agent 忽略, 建议清理: tail={tail!r}",
        )


def run(workspace_root: str) -> Report:
    report = Report(check_name="agent_prompt")

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    if not os.path.isfile(actions_path):
        report.add_warn(
            ACTIONS_REL, "agent_prompt:actions_missing",
            "workspace 未初始化 (actions.json 不存在), skip",
        )
        return report

    try:
        with open(actions_path, "r", encoding="utf-8") as f:
            actions = json.load(f)
    except json.JSONDecodeError as e:
        report.add_fail(
            ACTIONS_REL, "agent_prompt:invalid_json",
            f"actions.json JSON 解析失败: {e}",
        )
        return report
    except OSError as e:
        report.add_fail(ACTIONS_REL, "agent_prompt:read_error", str(e))
        return report

    if not isinstance(actions, dict):
        report.add_fail(
            ACTIONS_REL, "agent_prompt:actions_not_object",
            "actions.json 顶层不是 object",
        )
        return report

    scanned = 0
    for cid, comp_actions in actions.items():
        if cid.startswith("_") or not isinstance(comp_actions, dict):
            continue
        for atype, action in comp_actions.items():
            if atype.startswith("_") or not isinstance(action, dict):
                continue
            prompt = action.get("agentPrompt")
            if prompt is None:
                continue
            if not isinstance(prompt, str):
                report.add_fail(
                    ACTIONS_REL, "agent_prompt:not_string",
                    f"{cid}.{atype}.agentPrompt 必须是字符串, 实为 {type(prompt).__name__}",
                )
                continue
            scanned += 1
            _check_agent_prompt(report, f"{cid}.{atype}", prompt)

    report.add_info(
        ACTIONS_REL, "agent_prompt:summary",
        f"扫描 {scanned} 个 agentPrompt 字段",
    )
    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
