#!/usr/bin/env python3
"""check_component_triad.py — 检查组件三件套齐全 + demo/schema/actions 三方一致 (rev25).

规范依据: references/06-component.md §一、§六 — 每个 components/{cid}/ 必须
包含 template.html / schema.json / demo.json 三件套. rev25 起 demo.json 语义
是"该组件全部 actionType 的 mock 拦截规则数组", schema.json 校验的是每条规则的
`response` (接口响应体契约), 不再是"渲染 data 契约". 具体规则见 06-component.md §六.4:

  1. demo.json 每条规则的 match.actionType 必须能在 actions.json 该组件的 keys
     里找到, 或在 template ACTION INTERFACE 里声明为纯前端 actionType
  2. actions.json 该组件的每个 actionType, demo.json 里至少有一条规则覆盖 (mock 全覆盖)
  3. demo.json 每条规则的 response 必须能通过 schema.json 校验
  4. 组件 mount 自拉取用的 actionType (get_init_data) 必须在 demo.json 里有对应规则,
     且 handlerResults 非空

用法:
  python3 check_component_triad.py --workspace <path> [--json]

Exit code:
  0 pass, 1 warn, 2 fail
"""
import sys
import os
import re
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.result import Report, Level, parse_args_common  # noqa: E402

try:
    import jsonschema  # type: ignore
    _HAS_JSONSCHEMA = True
except ImportError:
    _HAS_JSONSCHEMA = False


COMPONENTS_REL = "skills/scene-skill/components"
ACTIONS_REL = "skills/scene-skill/actions.json"
REQUIRED_FILES = ["template.html", "schema.json", "demo.json"]

INIT_ACTION_TYPE = "get_init_data"

# 抓 template 头部 ACTION INTERFACE 注释块, 复用 check_action_interface_super.py 的正则
_BLOCK_RE = re.compile(
    r"<!--\s*.*?ACTION\s+INTERFACE\s*={2,}\s*(.*?)-->",
    re.IGNORECASE | re.DOTALL,
)
_ACTION_LINE_RE = re.compile(r"^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*$")


def _load_json(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f), None
    except json.JSONDecodeError as e:
        return None, f"JSON 解析失败: {e}"
    except OSError as e:
        return None, f"读文件失败: {e}"


def _read_text(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read(), None
    except OSError as e:
        return None, str(e)


def _extract_template_actions(text: str):
    """从 template.html 头部提取 ACTION INTERFACE 声明的 actionType 集合.

    找不到注释块 → None; 找到但空 → 空 set.
    """
    m = _BLOCK_RE.search(text)
    if not m:
        return None
    block = m.group(1)
    actions = set()
    for line in block.splitlines():
        mm = _ACTION_LINE_RE.match(line)
        if mm:
            name = mm.group(1)
            if name.lower() in {"payload", "file", "return", "example", "note", "notes"}:
                continue
            actions.add(name)
    return actions


def _validate_against_schema(instance, schema, report: Report, rel_path: str, rule_desc: str):
    """用 jsonschema 校验 instance, 找不到 jsonschema 库时退化为浅层 required 检查."""
    if _HAS_JSONSCHEMA:
        validator_cls = jsonschema.Draft7Validator if hasattr(jsonschema, "Draft7Validator") else None
        try:
            if validator_cls:
                validator = validator_cls(schema)
                errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
            else:
                jsonschema.validate(instance=instance, schema=schema)
                errors = []
        except Exception as e:
            errors = [e]
        for err in errors:
            path = "/".join(str(p) for p in getattr(err, "path", []))
            msg = getattr(err, "message", str(err))
            report.add_fail(
                rel_path,
                "triad:schema_validate_failed",
                f"{rule_desc} 未通过 schema 校验{' @ ' + path if path else ''}: {msg}",
            )
        return len(errors) == 0
    else:
        # 无 jsonschema 依赖时退化: 只查顶层 + 一层 required
        ok = _shallow_required_check(instance, schema, report, rel_path, rule_desc)
        return ok


def _shallow_required_check(instance, schema, report: Report, rel_path: str, rule_desc: str):
    """无 jsonschema 库时的退化校验: 递归检查 required 字段是否存在."""
    ok = True
    if not isinstance(schema, dict):
        return ok
    if schema.get("type") == "object" and not isinstance(instance, dict):
        report.add_fail(rel_path, "triad:schema_type_mismatch", f"{rule_desc} 应为 object")
        return False
    required = schema.get("required")
    if isinstance(required, list) and isinstance(instance, dict):
        for key in required:
            if key not in instance:
                report.add_fail(
                    rel_path,
                    "triad:schema_required_missing",
                    f"{rule_desc} 缺少必填字段 `{key}`",
                )
                ok = False
    props = schema.get("properties")
    if isinstance(props, dict) and isinstance(instance, dict):
        for key, sub_schema in props.items():
            if key in instance and isinstance(sub_schema, dict):
                sub_ok = _shallow_required_check(
                    instance[key], sub_schema, report, rel_path, f"{rule_desc}.{key}"
                )
                ok = ok and sub_ok
    return ok


def _check_component(cid: str, comp_dir: str, report: Report, backend_actions: set, tpl_actions):
    rel_base = f"{COMPONENTS_REL}/{cid}"

    # 三件套齐全
    for fname in REQUIRED_FILES:
        fpath = os.path.join(comp_dir, fname)
        if not os.path.isfile(fpath):
            report.add_fail(
                f"{rel_base}/{fname}",
                "triad:missing_file",
                f"组件 {cid} 缺 {fname}",
                fix_hint=f"在 {rel_base}/ 下补 {fname}",
            )

    schema_path = os.path.join(comp_dir, "schema.json")
    demo_path = os.path.join(comp_dir, "demo.json")

    schema, demo = None, None

    if os.path.isfile(schema_path):
        schema, schema_err = _load_json(schema_path)
        if schema_err:
            report.add_fail(f"{rel_base}/schema.json", "triad:schema_invalid", schema_err)

    if os.path.isfile(demo_path):
        demo, demo_err = _load_json(demo_path)
        if demo_err:
            report.add_fail(f"{rel_base}/demo.json", "triad:demo_invalid", demo_err)

    if demo is None:
        return  # 缺文件 / 解析失败已报, 后续校验无意义

    if not isinstance(demo, list):
        report.add_fail(
            f"{rel_base}/demo.json",
            "triad:demo_not_array",
            f"demo.json 顶层应为数组 (mock 拦截规则表), 实际 {type(demo).__name__}",
            fix_hint="改成数组, 每项 {url, method, name, match:{actionType}, response}",
        )
        return

    # 允许的 actionType 全集 = actions.json 该组件 keys ∪ template 声明的纯前端 actionType
    allowed_action_types = set(backend_actions)
    if tpl_actions:
        allowed_action_types |= tpl_actions

    demo_action_types = set()
    for idx, rule in enumerate(demo):
        rule_loc = f"{rel_base}/demo.json[{idx}]"
        if not isinstance(rule, dict):
            report.add_fail(rule_loc, "triad:rule_not_object", f"第 {idx} 条规则应为 object")
            continue

        match = rule.get("match")
        action_type = None
        if isinstance(match, dict):
            action_type = match.get("actionType")
        if not action_type:
            report.add_fail(
                rule_loc,
                "triad:rule_missing_action_type",
                "缺 match.actionType, 无法关联到 actions.json 的 action",
            )
        else:
            demo_action_types.add(action_type)
            if allowed_action_types and action_type not in allowed_action_types:
                report.add_fail(
                    rule_loc,
                    "triad:action_type_not_registered",
                    f"match.actionType `{action_type}` 既不在 actions.json[{cid}] 里, "
                    f"也未在 template ACTION INTERFACE 声明为纯前端行为",
                    fix_hint=f"检查 actionType 拼写, 或在 template 头部 ACTION INTERFACE 里补声明",
                )

        response = rule.get("response")
        if not isinstance(response, dict):
            report.add_fail(rule_loc, "triad:rule_missing_response", "缺 response 字段")
            continue

        # response 需通过 schema.json 校验
        if isinstance(schema, dict):
            _validate_against_schema(
                response, schema, report, rule_loc, f"{cid}.{action_type or '?'} 的 response"
            )

        # get_init_data (或组件专属拉取 action) 的 handlerResults 必须非空
        if action_type == INIT_ACTION_TYPE:
            data = response.get("data") if isinstance(response.get("data"), dict) else {}
            handler_results = data.get("handlerResults")
            if not isinstance(handler_results, list) or len(handler_results) == 0:
                report.add_fail(
                    rule_loc,
                    "triad:init_data_empty",
                    f"`{INIT_ACTION_TYPE}` 规则的 response.data.handlerResults 为空, "
                    f"组件预览态会白屏",
                    fix_hint="补齐真实、完整、不含占位符的示例 handlerResults",
                )

    # mock 全覆盖: actions.json 该组件每个 actionType 都要有 demo 规则覆盖
    for missing in sorted(backend_actions - demo_action_types):
        report.add_fail(
            f"{rel_base}/demo.json",
            "triad:action_not_mocked",
            f"actions.json[{cid}].{missing} 存在, 但 demo.json 无 match.actionType == "
            f"`{missing}` 的规则 (mock 覆盖不全, 预览态会真的打空 fetch)",
            fix_hint=f"在 demo.json 补一条 match.actionType=`{missing}` 的规则",
        )

    # get_init_data 必须存在
    if INIT_ACTION_TYPE not in demo_action_types and (
        not backend_actions or INIT_ACTION_TYPE in backend_actions or not allowed_action_types
    ):
        report.add_warn(
            f"{rel_base}/demo.json",
            "triad:init_data_missing",
            f"demo.json 里没有 `{INIT_ACTION_TYPE}` 的 mock 规则, 组件预览态可能无数据可看",
            fix_hint=f"补一条 match.actionType=`{INIT_ACTION_TYPE}` 的规则, handlerResults 给真实示例值",
        )

    report.add_info(
        rel_base,
        "triad:summary",
        f"{cid}: demo_rules={len(demo)} action_types={len(demo_action_types)}",
    )


def run(workspace_root: str) -> Report:
    report = Report(check_name="component_triad")

    components_dir = os.path.join(workspace_root, COMPONENTS_REL)
    if not os.path.isdir(components_dir):
        report.add_warn(
            COMPONENTS_REL,
            "triad:components_dir_missing",
            "components/ 目录不存在, skip",
        )
        return report

    actions_path = os.path.join(workspace_root, ACTIONS_REL)
    actions_cfg = {}
    if os.path.isfile(actions_path):
        actions_cfg, actions_err = _load_json(actions_path)
        if actions_err:
            report.add_warn(ACTIONS_REL, "triad:actions_invalid", actions_err)
            actions_cfg = {}
        elif not isinstance(actions_cfg, dict):
            actions_cfg = {}
    else:
        report.add_warn(ACTIONS_REL, "triad:actions_missing", "actions.json 不存在, 跳过 mock 全覆盖校验")

    if not _HAS_JSONSCHEMA:
        report.add_info(
            COMPONENTS_REL,
            "triad:jsonschema_not_installed",
            "未安装 jsonschema 库, response 校验退化为浅层 required 检查 (建议 pip install jsonschema)",
        )

    subdirs = []
    for entry in os.listdir(components_dir):
        if entry.startswith(".") or entry.startswith("_"):
            continue
        full = os.path.join(components_dir, entry)
        if os.path.isdir(full):
            subdirs.append(entry)

    if not subdirs:
        report.add_warn(
            COMPONENTS_REL,
            "triad:no_components",
            "components/ 下无组件子目录",
        )
        return report

    for cid in sorted(subdirs):
        comp_dir = os.path.join(components_dir, cid)
        comp_cfg = actions_cfg.get(cid) if isinstance(actions_cfg, dict) else None
        backend_actions = set()
        if isinstance(comp_cfg, dict):
            backend_actions = {k for k in comp_cfg.keys() if not k.startswith("_")}

        tpl_actions = set()
        tpl_path = os.path.join(comp_dir, "template.html")
        if os.path.isfile(tpl_path):
            text, err = _read_text(tpl_path)
            if not err:
                extracted = _extract_template_actions(text)
                if extracted:
                    tpl_actions = extracted

        _check_component(cid, comp_dir, report, backend_actions, tpl_actions)

    return report


def main():
    args = parse_args_common()
    report = run(args.workspace)
    report.emit(json_mode=args.json)


if __name__ == "__main__":
    main()
