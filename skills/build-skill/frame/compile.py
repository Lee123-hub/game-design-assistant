#!/usr/bin/env python3
"""scene-skill component compiler (rev25 — UI 骨架编译器, 不再合并业务 data).

跨 project 通用的组件编译器. 每个 project 在自己的 skills/scene-skill/ 下部署这份文件,
配合本目录下的 flow.json + components/{cid}/ 三件套 + frame/ 公共资源工作.

不含任何业务 (project-specific) 硬编码 — 组件白名单从 flow.json 动态读.

============================== rev25 核心思路变更 ==============================
组件 = 自包含 UI 骨架 + 固定配置, 动态业务数据一律走接口自拉取 (组件 mount 时自己
`SceneFrame.callAction('get_init_data', {})` 向 backend 要), 不再由 compile.py 静态
注入. 因此本文件职责收窄为**只编译 UI 骨架**:
  - 展开 template.html 里的 `<!-- @include _shared/xxx.html -->`
  - 注入 frame/scene-tokens.css + frame/scene-frame.js
  - 注入极少量渲染态 meta 信息 (componentId / stepLabel / sealed / projectId)
**不再**读 components/{cid}/demo.json 把"渲染数据骨架"拼进 `__COMPONENT_DATA__`,
也**不再**用 components/{cid}/schema.json 校验渲染 data —— demo.json 现在的语义是
"该组件全部 actionType 的 mock 拦截规则表" (供平台请求拦截层在预览态用), schema.json
校验的对象也变成 demo.json 里每条规则的 response.data (接口响应体契约), 不是这里的
渲染 data. 详见 references/06-component.md §六/§八.
================================================================================

Usage:
    # 推荐: 骨架编译 (唯一常规用法), 组件业务数据由组件自己 mount 后 callAction 拉取
    python compile.py --component <cid> --id <artifact-id> [--output-dir <dir>]
    python compile.py --component <cid> --output <path.html>

    # Batch: 组件 id 列表 → html 骨架列表 (打包发布场景)
    python compile.py --batch --batch-output <path.json>              # 编译全部注册组件
    python compile.py --input <ids.json> --batch --batch-output <p>   # 编译 ids.json 里指定的组件子集

Output (single):
    stdout = {"artifact_path": "...", "kind": "scene_component", "id": "...", "size_bytes": N}

Exit:
    0 ok, 2 input error (LLM-fixable), 3 infra error (file not found etc.)

============================== 废弃参数 (rev25 起) ==============================
以下参数属于老思路 (compile.py 把业务 data 合并进组件), 新架构下不再需要, 传入会被
忽略并在 stderr 打印 deprecation 提示, **不报错**方便旧调用方平滑过渡:
  --data          (老 quick-build 覆盖字段, 业务数据现由组件自己 callAction 拉取)
  --auto-inject   (老 state-mirror 自动注入, 同上)
--input 仍支持 (兼容旧调用方传 `{"kind","componentId","data":{...}}` 整块 payload),
但其中的 `data` 字段会被**忽略**, 只取 `componentId` 决定编译哪个组件骨架.
================================================================================
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import NoReturn

SKILL_DIR      = Path(__file__).parent
COMPONENTS_DIR = SKILL_DIR / "components"
FRAME_DIR      = SKILL_DIR / "frame"
OUTPUT_SIZE_LIMIT_BYTES = 800 * 1024

ARTIFACT_ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")

_VALID_KINDS = {"scene_component", "spend_alloc_component", "chat_component"}


def _load_flow() -> dict:
    p = SKILL_DIR / "flow.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _kebab_to_camel(cid: str) -> str:
    return "".join(part.capitalize() for part in cid.split("-"))


def _camel_to_kebab(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower()


def _discover_components_from_dir() -> set:
    """扫 components/ 子目录名作为兜底组件白名单."""
    if not COMPONENTS_DIR.is_dir():
        return set()
    return {
        p.name for p in COMPONENTS_DIR.iterdir()
        if p.is_dir() and not p.name.startswith(("_", "."))
    }


def _build_component_registry(flow: dict):
    """从 flow.json 构建组件注册表. flow 缺失时从 components/ 目录扫作为兜底.

    返回:
      VALID_COMPONENT_IDS  — set[str] 合法 componentId
      COMPONENT_NAME_MAP   — dict[CamelCase, kebab-id]
      STEP_LABEL_MAP       — dict[kebab-id, stepLabel]
    """
    valid_ids: set = set()
    name_map: dict = {}
    label_map: dict = {}

    for stage in flow.get("stages", []):
        stage_label = stage.get("label", "")
        for cid in stage.get("componentIds", []):
            valid_ids.add(cid)
            name_map[_kebab_to_camel(cid)] = cid
            comp_meta = flow.get("componentMeta", {}).get(cid, {})
            label_map[cid] = stage_label or comp_meta.get("label") or cid

    if not valid_ids:
        for cid in _discover_components_from_dir():
            valid_ids.add(cid)
            name_map[_kebab_to_camel(cid)] = cid
            label_map[cid] = cid

    return valid_ids, name_map, label_map


_FLOW = _load_flow()
VALID_COMPONENT_IDS, COMPONENT_NAME_MAP, _STEP_LABEL_MAP = _build_component_registry(_FLOW)


def die(code: str, msg: str, exit_code: int = 2) -> NoReturn:
    print(f"[{code}] {msg}", file=sys.stderr)
    sys.exit(exit_code)


def _warn_deprecated(flag: str, reason: str) -> None:
    print(f"[deprecated] {flag} 已废弃, 忽略: {reason}", file=sys.stderr)


def resolve_component_id(payload_or_cid) -> str:
    """从 --component 值或 --input payload 里取出真实 componentId, 并校验合法性."""
    if isinstance(payload_or_cid, dict):
        cid = payload_or_cid.get("componentId")
    else:
        cid = payload_or_cid

    if not cid:
        die("missing-field", "'componentId' is required (--component <cid> 或 --input payload.componentId)")
    if VALID_COMPONENT_IDS and cid not in VALID_COMPONENT_IDS:
        die("unknown-component",
            f"Unknown componentId: {cid!r}. Must be one of: {sorted(VALID_COMPONENT_IDS)}")
    return cid


def read_file(path: Path, label: str) -> str:
    if not path.exists():
        die("missing-template", f"{label} not found at {path}", exit_code=3)
    return path.read_text(encoding="utf-8")


def _load_frame_css() -> str:
    p = FRAME_DIR / "scene-tokens.css"
    if not p.exists():
        print("[frame] frame/scene-tokens.css 不存在, 跳过 CSS Token 注入", file=sys.stderr)
        return ""
    return p.read_text(encoding="utf-8")


def _load_frame_js() -> str:
    p = FRAME_DIR / "scene-frame.js"
    if not p.exists():
        print("[frame] frame/scene-frame.js 不存在, 跳过运行时注入", file=sys.stderr)
        return ""
    return p.read_text(encoding="utf-8")


def _process_includes(html: str) -> str:
    """展开 <!-- @include _shared/xxx.html --> 到 frame/_shared/ 下的对应文件."""
    pattern = re.compile(r'<!--\s*@include\s+([\w./_-]+)\s*-->')

    def _replacer(m):
        rel_path = m.group(1).strip()
        abs_path = FRAME_DIR / rel_path
        if not abs_path.exists():
            print(f"[frame] @include 目标不存在: {abs_path}, 保留原注释", file=sys.stderr)
            return m.group(0)
        content = abs_path.read_text(encoding="utf-8")
        content = re.sub(r'<!--\s*@shared[\s\S]*?-->', '', content, count=1).strip()
        return content

    return pattern.sub(_replacer, html)


def _build_meta_block(cid: str, raw_meta: dict) -> dict:
    raw_meta = raw_meta or {}
    step_label = raw_meta.get("stepLabel") or _STEP_LABEL_MAP.get(cid, cid)
    return {
        "componentId": cid,
        "stepLabel": step_label,
        "sealed": bool(raw_meta.get("sealed", False)),
        "projectId": raw_meta.get("projectId", ""),
    }


def compile_html(cid: str, raw_meta: dict = None, history: list = None) -> str:
    """编译单组件 UI 骨架.

    只做: @include 展开 + frame CSS/JS 注入 + meta 信息注入 (window.__COMPONENT_DATA__
    只含 {meta, history}, 不含业务 data —— 组件 mount 后自己 callAction('get_init_data', ...)
    向 backend / mock 拦截层要业务数据, 见模块顶部说明).
    """
    tpl_dir = COMPONENTS_DIR / cid
    tpl_html = read_file(tpl_dir / "template.html", f"components/{cid}/template.html")

    tpl_html = _process_includes(tpl_html)

    frame_css = _load_frame_css()
    if frame_css:
        if '<style>' in tpl_html:
            tpl_html = tpl_html.replace(
                '<style>',
                f'<style>\n/* == scene-tokens (auto-injected) == */\n{frame_css}\n/* == end scene-tokens == */\n',
                1,
            )
        else:
            css_block = f'<style>\n/* == scene-tokens (auto-injected) == */\n{frame_css}\n/* == end scene-tokens == */\n</style>'
            tpl_html = tpl_html.replace('</head>', css_block + '\n</head>', 1)

    meta = _build_meta_block(cid, raw_meta)
    cd_obj = {"meta": meta, "history": history or []}
    payload_json = _safe_script_json(cd_obj)
    data_script = f"\n<script>window.__COMPONENT_DATA__ = {payload_json};</script>"
    tpl_html = tpl_html.replace("</head>", data_script + "\n</head>", 1)

    frame_js = _load_frame_js()
    if frame_js:
        js_block = f'<script>\n/* == scene-frame.js (auto-injected) == */\n{frame_js}\n/* == end scene-frame.js == */\n</script>'
        tpl_html = tpl_html.replace("</head>", js_block + "\n</head>", 1)

    return tpl_html


def _safe_script_json(obj) -> str:
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return (s.replace("<", "\\u003c")
             .replace(">", "\\u003e")
             .replace("&", "\\u0026")
             .replace(" ", "\\u2028")
             .replace(" ", "\\u2029"))


def msg_to_cid(msg, idx: int) -> str:
    """批量模式: 把单条 message 解析成 componentId.

    支持三种输入:
      1. 纯字符串 componentId: "component-x"
      2. 已经是老 payload 形状: {"kind": "...", "componentId": "...", "data": {...}} (data 被忽略)
      3. message 格式: {"component": "<CamelName>", ...} (props/intro 等业务字段被忽略)
    """
    if isinstance(msg, str):
        return resolve_component_id(msg)

    if not isinstance(msg, dict):
        die("invalid-json", f"messages[{idx}] 必须是 componentId 字符串或 object")

    if "componentId" in msg:
        return resolve_component_id(msg["componentId"])

    component_name = msg.get("component")
    if not component_name:
        die("missing-field",
            f"messages[{idx}] 无 'componentId' / 'component' 字段")

    cid = COMPONENT_NAME_MAP.get(component_name)
    if not cid:
        kebab = _camel_to_kebab(component_name)
        if kebab in VALID_COMPONENT_IDS or not VALID_COMPONENT_IDS:
            cid = kebab
        else:
            die("unknown-component",
                f"messages[{idx}].component {component_name!r} 未注册. "
                f"已知: {sorted(COMPONENT_NAME_MAP.keys())}")
    return cid


def run_batch(messages, batch_output: str) -> None:
    """批量编译骨架. messages 缺省时编译 flow.json 注册的全部组件."""
    if not messages:
        messages = sorted(VALID_COMPONENT_IDS)
    if not isinstance(messages, list) or len(messages) == 0:
        die("empty-data", "Batch input must be a non-empty array (componentId 列表, 或省略走全量)")

    out_path = Path(batch_output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    html_list = []
    for idx, msg in enumerate(messages):
        cid = msg_to_cid(msg, idx)
        raw_meta = msg.get("_meta") if isinstance(msg, dict) else None
        html = compile_html(cid, raw_meta=raw_meta)
        html_bytes = html.encode("utf-8")
        if len(html_bytes) > OUTPUT_SIZE_LIMIT_BYTES:
            die("oversize-output",
                f"messages[{idx}] ({cid}) output is {len(html_bytes):,} bytes, "
                f"exceeds {OUTPUT_SIZE_LIMIT_BYTES:,} byte limit.")
        entry: dict = {"type": "html", "content": html, "component": cid}
        if isinstance(msg, dict):
            for _field in ("id", "role", "status", "timestamp", "stage", "intro"):
                if _field in msg:
                    entry[_field] = msg[_field]
        html_list.append(entry)
        print(f"  [{idx + 1}/{len(messages)}] {cid} — {len(html_bytes):,} bytes",
              file=sys.stderr)

    out_json = json.dumps(html_list, ensure_ascii=False, indent=2)
    out_path.write_text(out_json, encoding="utf-8")

    result = {
        "artifact_path": str(out_path),
        "kind": "scene_html_list",
        "count": len(html_list),
        "size_bytes": len(out_json.encode("utf-8")),
    }
    print(json.dumps(result, ensure_ascii=False))


def main() -> None:
    import tempfile
    parser = argparse.ArgumentParser(description="scene-skill component compiler (UI 骨架编译, rev25)")
    parser.add_argument("--component", default=None, dest="component_id",
                        help="要编译的 componentId, 只编译 UI 骨架 (推荐用法)")
    parser.add_argument("--input", default=None,
                        help="兼容老调用方: path to input JSON, 或 '-' 读 stdin. "
                             "payload.componentId 会被采用, payload.data 会被忽略 (见模块顶部说明)")
    parser.add_argument("--id", dest="artifact_id", default=None,
                        help="artifact id, must match [A-Za-z0-9_-]+")
    parser.add_argument("--output-dir", default=None,
                        help="output directory (default: system temp dir)")
    parser.add_argument("--output", default=None,
                        help="explicit output path (skips stdout JSON)")
    parser.add_argument("--data", default=None, dest="data_override",
                        help="[废弃] 老 quick-build 覆盖字段, 忽略不生效 (组件业务数据现由组件自己 callAction 拉取)")
    parser.add_argument("--auto-inject", action="store_true",
                        help="[废弃] 老 state-mirror 自动注入, 忽略不生效")
    parser.add_argument("--batch", action="store_true",
                        help="batch mode: 编译多个组件骨架, output 是 html-list JSON")
    parser.add_argument("--batch-output", default=None,
                        help="batch 模式必填, 输出 JSON 路径")
    args = parser.parse_args()

    if args.data_override is not None:
        _warn_deprecated("--data", "组件业务数据现由组件 mount 后 callAction('get_init_data', ...) 自己拉取")
    if args.auto_inject:
        _warn_deprecated("--auto-inject", "state-mirror 数据现由组件自己 callAction 拉取, 不再由 compile.py 代注入")

    # ---- batch 模式 ----
    if args.batch:
        if not args.batch_output:
            die("missing-field", "--batch-output is required in batch mode")
        messages = None
        if args.input:
            try:
                if args.input == "-":
                    raw = sys.stdin.read()
                else:
                    input_path = Path(args.input)
                    if not input_path.exists():
                        die("missing-input", f"Input file not found: {input_path}", exit_code=3)
                    raw = input_path.read_text(encoding="utf-8")
                messages = json.loads(raw)
            except json.JSONDecodeError as e:
                die("invalid-json", f"Cannot parse input JSON: {e}")
        run_batch(messages, args.batch_output)
        return

    # ---- 单组件骨架编译 ----
    raw_meta = None
    if args.component_id:
        cid = resolve_component_id(args.component_id)
    elif args.input:
        try:
            if args.input == "-":
                raw = sys.stdin.read()
            else:
                input_path = Path(args.input)
                if not input_path.exists():
                    die("missing-input", f"Input file not found: {input_path}", exit_code=3)
                raw = input_path.read_text(encoding="utf-8")
            payload = json.loads(raw)
        except json.JSONDecodeError as e:
            die("invalid-json", f"Cannot parse input JSON: {e}")
        if not isinstance(payload, dict):
            die("invalid-json", "Input must be a JSON object")
        if "data" in payload:
            print("[deprecated] --input payload.data 已忽略: 组件业务数据现由组件自己 callAction 拉取", file=sys.stderr)
        cid = resolve_component_id(payload)
        raw_meta = payload.get("_meta")
    else:
        die("missing-field", "必须指定 --component <cid> (推荐) 或 --input <payload.json>")

    if args.output is None:
        if not args.artifact_id:
            die("missing-field", "--id is required when --output is not specified")
        if not ARTIFACT_ID_RE.match(args.artifact_id):
            die("invalid-value",
                f"--id must match [A-Za-z0-9_-]+, got: {args.artifact_id!r}")

    html = compile_html(cid, raw_meta=raw_meta)

    html_bytes = html.encode("utf-8")
    if len(html_bytes) > OUTPUT_SIZE_LIMIT_BYTES:
        die("oversize-output",
            f"Output HTML is {len(html_bytes):,} bytes, exceeds {OUTPUT_SIZE_LIMIT_BYTES:,} byte limit.")

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html, encoding="utf-8")
        return

    if args.output_dir:
        out_dir = Path(args.output_dir)
    else:
        out_dir = Path(tempfile.gettempdir()) / "scene-component"
    out_dir.mkdir(parents=True, exist_ok=True)
    # 命名规则 (前端联动铁律): artifacts/{componentId}_{artifact_id}.html —— componentId
    # 与 _ 之间必须是这个分隔符, 前端 sceneBuilderTrigger.js 的
    # extractComponentIdFromArtifactPath 靠 `^([a-z][a-z0-9-]*)_` 精确切出 componentId,
    # 用来把测试对话产出的 html-component 联动到中间预览正确的 stage/组件 tab。
    # 不要改成其他分隔符 (如 `-`), 会导致前端解析歧义 (componentId 本身含 `-`)。
    artifact_path = out_dir / f"{cid}_{args.artifact_id}.html"
    artifact_path.write_text(html, encoding="utf-8")

    result = {
        "artifact_path": str(artifact_path),
        "kind": "scene_component",
        "id": args.artifact_id,
        "size_bytes": len(html_bytes),
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
