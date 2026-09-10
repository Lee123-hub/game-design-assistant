// 模块 UI 原型（outputKind = 'html-modules'）的文件命名规则：server 与 web 共用的唯一来源。

/**
 * `<模块名>-v<N>-<YYYYMMDD-HHMMSS>.html`
 * 模块名允许任意非空字符（含中文），版本号 1~3 位数字。
 */
export const MODULE_UI_FILE_RE = /^(.+?)-v(\d{1,3})-(\d{8}-\d{6})\.html$/;

export interface ModuleUiName {
  module: string;
  version: number;
  /** YYYYMMDD-HHMMSS */
  ts: string;
}

/** 解析模块 UI 原型文件名；不符合规范返回 null */
export function parseModuleUiFileName(name: string): ModuleUiName | null {
  const m = MODULE_UI_FILE_RE.exec(name);
  if (!m) return null;
  const version = Number(m[2]);
  if (!Number.isFinite(version) || version < 1) return null;
  return { module: m[1], version, ts: m[3] };
}

/** 组装模块 UI 原型文件名 */
export function moduleUiFileName(module: string, version: number, ts: string): string {
  return `${module}-v${version}-${ts}.html`;
}

/** 交付包用：去掉 `-vN-<时间戳>` → `战斗模块.html`；不符合规范则原样返回 */
export function stripModuleUiVersion(name: string): string {
  const parsed = parseModuleUiFileName(name);
  return parsed ? `${parsed.module}.html` : name;
}

/** 文件名非法字符（Windows/macOS 通用，含全角等价形式），模块名用于文件名前必须清洗 */
const ILLEGAL_FILE_CHARS = /[/\\:*?"<>|／＼：＊？＂＜＞｜]/g;

/** 清洗模块名以便安全用作文件名；清洗后为空则回退「未命名模块」 */
export function sanitizeModuleName(raw: string): string {
  const cleaned = (raw ?? '').replace(ILLEGAL_FILE_CHARS, '').replace(/\s+/g, ' ').trim();
  return cleaned || '未命名模块';
}
