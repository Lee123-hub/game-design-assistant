#!/usr/bin/env python3
"""run_all.py — 跑全套 check 并聚合 (rev17 CI 入口).

用法:
  python3 run_all.py --workspace <path> [--json] [--fail-on warn|fail]

Exit code:
  0 = 全通过
  1 = 至少 1 个 warn (无 fail)
  2 = 至少 1 个 fail
     或 --fail-on warn 时 warn 也返 2 (发布场景)

--fail-on warn: 遇 warn 也返 2 (发布场景)
--fail-on fail (默认): 只 fail 才返 2 (保存场景)
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed


# 17 个 check.
# check_frame_assets 拦 project 侧 compile.py / frame/*.{css,js} / _shared/*.html 与标杆漂移.
CHECKS = [
    # A 类结构 (8)
    "check_scope",
    "check_layout",
    "check_meta",
    "check_project_claude",
    "check_script_exists",
    "check_component_registered",
    "check_placeholders",
    "check_frame_assets",
    # B 类内容 (5)
    "check_action_shape",
    "check_agent_prompt",
    "check_pipeline_refs",
    "check_flow_transition",
    "check_state_ui_fanout",
    # C 类组件/脚本 (4)
    "check_component_triad",
    "check_action_interface_super",
    "check_no_forbidden_ui",
    "check_script_contract",
]


def _run_one(script_path: str, workspace: str):
    """跑单个 check --json, 抓 stdout 解析, 返 (status, findings_count, parsed, raw).

    subprocess 失败或非 JSON → status="error".
    """
    try:
        proc = subprocess.run(
            [sys.executable, script_path, "--workspace", workspace, "--json"],
            capture_output=True, text=True, timeout=120,
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "timeout after 120s", "findings": []}
    except OSError as e:
        return {"status": "error", "error": f"launch failed: {e}", "findings": []}

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    if not stdout:
        return {
            "status": "error",
            "error": f"no stdout (rc={proc.returncode}); stderr={stderr[:200]}",
            "findings": [],
        }

    # 取最后一行 (脚本可能前面有 warning; --json 输出单行)
    last_line = stdout.splitlines()[-1]
    try:
        parsed = json.loads(last_line)
    except json.JSONDecodeError as e:
        return {
            "status": "error",
            "error": f"json parse failed: {e}; last_line={last_line[:200]}",
            "findings": [],
        }

    return parsed


def _format_text(all_results: dict) -> str:
    lines = []
    lines.append("=" * 60)
    lines.append("run_all 聚合报告")
    lines.append("=" * 60)
    total_info = total_warn = total_fail = 0
    for name, res in all_results.items():
        status = res.get("status", "?")
        summary = res.get("summary", {}) or {}
        info_n = summary.get("info", 0)
        warn_n = summary.get("warn", 0)
        fail_n = summary.get("fail", 0)
        total_info += info_n
        total_warn += warn_n
        total_fail += fail_n
        badge = {"pass": "OK  ", "warn": "WARN", "fail": "FAIL", "ok": "OK  ",
                 "error": "ERR ", "info": "OK  "}.get(str(status), "?   ")
        lines.append(f"  [{badge}] {name:35s}  info={info_n} warn={warn_n} fail={fail_n}")
        if status == "error":
            lines.append(f"           ⚠ error: {res.get('error', '')}")
        # 打印 warn/fail 明细
        for f in res.get("findings", []):
            lvl = f.get("level", "")
            if lvl in ("warn", "fail"):
                loc = f.get("file", "")
                if f.get("line"):
                    loc += f":{f['line']}"
                lines.append(f"           [{lvl.upper()}] {loc} — {f.get('rule', '')}: {f.get('message', '')}")
    lines.append("-" * 60)
    lines.append(f"总计: info={total_info} warn={total_warn} fail={total_fail}")
    lines.append("=" * 60)
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--workspace", required=True, help="Workspace root path")
    p.add_argument("--json", action="store_true", help="Emit aggregated JSON to stdout")
    p.add_argument(
        "--fail-on", choices=["warn", "fail"], default="fail",
        help="Exit code strictness: 'fail' (default) 只 fail 返 2; 'warn' 遇 warn 也返 2",
    )
    args = p.parse_args()

    scripts_dir = os.path.dirname(os.path.abspath(__file__))

    # 各 check 并发跑 (I/O bound). 串行 python 冷启动 ~40ms × 17 ≈ 700ms overhead,
    # 并发压到 200ms 左右.
    all_results = {}
    pending = {}
    for name in CHECKS:
        spath = os.path.join(scripts_dir, f"{name}.py")
        if not os.path.isfile(spath):
            all_results[name] = {"status": "error", "error": f"{spath} not found", "findings": []}
            continue
        pending[name] = spath

    if pending:
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = {
                executor.submit(_run_one, spath, args.workspace): name
                for name, spath in pending.items()
            }
            for future in as_completed(futures):
                name = futures[future]
                try:
                    all_results[name] = future.result()
                except Exception as e:
                    all_results[name] = {"status": "error", "error": f"executor: {e}", "findings": []}

    # 按 CHECKS 顺序重排 (as_completed 会乱序, 保证输出稳定)
    all_results = {name: all_results[name] for name in CHECKS if name in all_results}

    total_warn = 0
    total_fail = 0
    for res in all_results.values():
        summary = res.get("summary", {}) or {}
        total_warn += summary.get("warn", 0)
        total_fail += summary.get("fail", 0)
        # error 状态视作 fail
        if res.get("status") == "error":
            total_fail += 1

    # exit code
    if total_fail > 0:
        exit_code = 2
    elif total_warn > 0:
        exit_code = 2 if args.fail_on == "warn" else 1
    else:
        exit_code = 0

    if args.json:
        aggregate_status = "fail" if total_fail else ("warn" if total_warn else "pass")
        out = {
            "check": "run_all",
            "status": aggregate_status,
            "summary": {
                "checks": len(CHECKS),
                "warn": total_warn,
                "fail": total_fail,
            },
            "fail_on": args.fail_on,
            "checks": all_results,
        }
        print(json.dumps(out, ensure_ascii=False))
    else:
        print(_format_text(all_results))
        print(f"\nexit code: {exit_code}  (fail-on={args.fail_on})")

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
