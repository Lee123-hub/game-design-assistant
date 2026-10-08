"""校验脚本统一结果输出 (rev17).

Exit code 契约:
  0 = pass (无 warning 无 error)
  1 = warn (仅 warning, 不 fail 但用户应关注)
  2 = fail (至少一个 error, 阻止提交)

输出格式:
  文本 (默认): stdout 人类可读的 report
  --json: stdout 单行 JSON, 结构 {status: "pass|warn|fail", checks: [...], summary: {...}}
"""

import json
import sys
from dataclasses import dataclass, field, asdict
from enum import Enum


class Level(str, Enum):
    OK = "ok"
    INFO = "info"    # 建议性提示, 不影响 exit code (仍算 pass)
    WARN = "warn"
    FAIL = "fail"


@dataclass
class Finding:
    level: Level
    file: str          # workspace-root 相对路径
    rule: str          # 如 "action_shape:handler_type_whitelist"
    message: str       # 一句话描述
    line: int | None = None      # 可选, JSON 里 approximate
    fix_hint: str | None = None  # 可选, "改成 xxx"

    def to_dict(self):
        return {k: v for k, v in asdict(self).items() if v is not None and v != ''}


@dataclass
class Report:
    check_name: str
    findings: list[Finding] = field(default_factory=list)

    def add(self, level: Level, file: str, rule: str, message: str, **kw):
        self.findings.append(Finding(level=level, file=file, rule=rule, message=message, **kw))

    def add_info(self, file: str, rule: str, message: str, **kw):
        self.add(Level.INFO, file, rule, message, **kw)

    def add_warn(self, file: str, rule: str, message: str, **kw):
        self.add(Level.WARN, file, rule, message, **kw)

    def add_fail(self, file: str, rule: str, message: str, **kw):
        self.add(Level.FAIL, file, rule, message, **kw)

    @property
    def status(self) -> Level:
        if any(f.level == Level.FAIL for f in self.findings):
            return Level.FAIL
        if any(f.level == Level.WARN for f in self.findings):
            return Level.WARN
        return Level.OK

    def exit_code(self) -> int:
        # INFO 不影响 exit, 走 OK 分支
        return {Level.OK: 0, Level.INFO: 0, Level.WARN: 1, Level.FAIL: 2}[self.status]

    def emit(self, json_mode: bool = False):
        """输出 report 到 stdout 并 sys.exit."""
        if json_mode:
            out = {
                "check": self.check_name,
                "status": self.status.value,
                "findings": [f.to_dict() for f in self.findings],
                "summary": {
                    "total": len(self.findings),
                    "info": sum(1 for f in self.findings if f.level == Level.INFO),
                    "warn": sum(1 for f in self.findings if f.level == Level.WARN),
                    "fail": sum(1 for f in self.findings if f.level == Level.FAIL),
                },
            }
            print(json.dumps(out, ensure_ascii=False))
        else:
            print(f"[{self.check_name}] status={self.status.value}, findings={len(self.findings)}")
            for f in self.findings:
                loc = f"{f.file}:{f.line}" if f.line else f.file
                print(f"  [{f.level.value.upper()}] {loc} — {f.rule}: {f.message}")
                if f.fix_hint:
                    print(f"      💡 {f.fix_hint}")
        sys.exit(self.exit_code())


def parse_args_common():
    """所有 check 脚本通用的 CLI 参数解析.

    支持:
      --workspace <path>  工作副本根 (必填, 一般传 . = 当前 CWD)
      --json              JSON 输出 (默认人类可读文本)
    """
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--workspace", required=True, help="Workspace root path (工作副本根, 含 CLAUDE.md + skills/scene-skill)")
    p.add_argument("--json", action="store_true", help="Emit JSON to stdout")
    return p.parse_args()
