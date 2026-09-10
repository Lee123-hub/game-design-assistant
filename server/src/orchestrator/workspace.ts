import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentDef, Project, StepDef } from '@gda/shared';
import {
  artifactLocation,
  listDeliverables,
  listModuleUiEntries,
  listStepFiles,
  latestModuleUiVersions,
} from '../store/artifactStore.js';
import { versionStamp } from '../store/artifactStore.js';
import { projectDir } from '../store/paths.js';

export { projectDir };

/** 所有 agent 共用的 cwd = 项目数据目录；CLAUDE.md 放在其根下 */
export const CLAUDE_MD_NAME = 'CLAUDE.md';

/**
 * 程序侧意图判断：用户消息更像「提问/咨询」还是「生成/修改指令」。
 * generative 步骤中判断为提问时走回答模式（不给写文件工具），
 * 避免模型把问题误当成生成指令（提示词框架偏生成，模型侧 [Q&A] 判断不可靠）。
 */
const QUESTION_PATTERNS = /[？?]|什么|哪些|哪个|怎么|怎样|为什么|如何|能不能|可不可以|有没有|是不是|看看|看一下|查看|列出|介绍|说明一下/;
const TASK_PATTERNS = /重新生成|重写|重新做|修改|调整|优化|加上|添加|加入|删掉|删除|去掉|改成|换成|扩写|简化|做一版|生成|制作/;

export function looksLikeQuestion(text: string): boolean {
  const s = (text ?? '').trim();
  if (!s || s.length > 300) return false;
  if (TASK_PATTERNS.test(s)) return false;
  return QUESTION_PATTERNS.test(s);
}

/** 问答模式标记：回复以此开头表示本次只是回答用户提问，不产出/不覆盖产物 */
export const ANSWER_MARK = '[Q&A]';

export function claudeMdPath(projectId: string): string {
  return path.join(projectDir(projectId), CLAUDE_MD_NAME);
}

/** 回答模式指令：提问场景下不给写文件工具，模型只做解答 */
export const ANSWER_MODE_INSTRUCTION = `## 回答模式（本次运行）

用户在本步骤对话中提出的是**问题/咨询**，不是生成任务。本次你只需要：

1. 直接、简明地回答用户的问题；需要时可先用 Read/Glob 查看工作区文件核实现状，再依据看到的内容回答。
2. **禁止**生成本步骤的产物，**禁止**输出任何完整文档或代码全文。
3. 你的回复就是给用户看的答案本身。`;

/** CLAUDE.md 引导模板：结构说明固定，文件清单由各 agent 每次运行校对维护 */
const CLAUDE_MD_TEMPLATE = `# 项目文档说明

> 本文件由所有 agent 共同维护：各 agent 以程序提供的扫描基线为准，发现文件清单过时（缺失/新增/变更）时更新本文件。

## 目录结构（固定）

- \`project.json\` — 项目元数据：名称、一句话想法、各 step 状态、玩家画像（personas）、竞品资料（competitorNotes）。由程序管理，不要修改。
- \`steps/<agentId>/<stepId>.<YYYYMMDD-HHMMSS-iii>.md\` — 各步骤产物版本文件，命名 = 名称+时间戳；**按创建时间倒序，最新一个即当前版本**，下游 step 的参考依据。
- \`steps/<agentId>/<stepId>.md\` — 早期遗留的无时间戳版本（存在时同样参与按时间排序）。
- \`prototypes/<stepId>.<YYYYMMDD-HHMMSS-iii>.html\` — HTML 可玩原型版本文件，命名规则同上。
- \`prototypes/ui/<模块名>-v<N>-<YYYYMMDD-HHMMSS>.html\` — 模块 UI 原型（每个模块一个静态展示页面，同模块 v1/v2 递增，最新一个即当前版本）。由「模块 UI 原型」步骤生成，其他步骤不要读写。
- \`deliverables/\` — 历史遗留交付文档（旧版本流程产出；现交付包为程序直接打包下载）。
- \`runs/<runId>.jsonl\` — 每次运行的原始日志，由程序管理，禁止读写。
- \`sessions/<agentId>__<stepId>.json\` — 每个步骤的访谈会话记录，由程序管理，禁止读写。
- \`CLAUDE.md\` — 本文件。

## 当前文件清单

（由 agent 扫描后维护：逐个列出实际存在的文件及其含义；下方「程序扫描基线」可用于校对。）

（待补充）
`;

export async function ensureClaudeMd(projectId: string): Promise<void> {
  const file = claudeMdPath(projectId);
  try {
    await fs.access(file);
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, CLAUDE_MD_TEMPLATE, 'utf8');
  }
}

/** 全量工具集：所有 agent 一律放开（用户配置），不再按 step 的 useWebSearch 门控 */
export const WORKSPACE_ALL_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'WebSearch',
  'WebFetch',
  'NotebookEdit',
  'TodoWrite',
  'Agent',
  'Bash',
];

/** 默认工具集：全量去掉 Agent 工具（用户要求：默认不可使用 agent 工具） */
export const DEFAULT_AGENT_TOOLS = WORKSPACE_ALL_TOOLS.filter((t) => t !== 'Agent');

/**
 * 项目内允许 step 使用的工具集，优先级：
 * step 覆盖配置（settings.agentOverrides[stepKey].allowedTools）>
 * step 内置默认（def.defaultTools，如模块详细设计开启 Agent 工具）> 全局默认（不含 Agent）
 */
export function workspaceToolSet(def: StepDef, override?: { allowedTools?: string[] }): string[] {
  const custom = override?.allowedTools;
  if (custom && custom.length > 0) {
    const known = new Set<string>(WORKSPACE_ALL_TOOLS);
    const filtered = custom.filter((t) => known.has(t));
    if (filtered.length > 0) return filtered;
  }
  if (def.defaultTools && def.defaultTools.length > 0) {
    const known = new Set<string>(WORKSPACE_ALL_TOOLS);
    const filtered = def.defaultTools.filter((t) => known.has(t));
    if (filtered.length > 0) return filtered;
  }
  return DEFAULT_AGENT_TOOLS;
}

/**
 * 本轮运行的轮数上限：
 * - agent 覆盖配置的 maxTurns 优先（用户在设置里配置）
 * - 默认 99（用户要求：默认轮数 99，等于基本不限制工具轮数）
 */
export function workspaceMaxTurns(def: StepDef, override?: { maxTurns?: number }): number {
  const custom = override?.maxTurns;
  if (custom && Number.isFinite(custom) && custom >= 1) return Math.floor(custom);
  return def.maxTurnsHint ?? 99;
}

/** 工作区约定公共部分（第 1~3 条，generative 与 conversational 共用） */
const WORKSPACE_BASE = `## 工作区约定

本次运行的工作目录（cwd）是本项目唯一的文档目录，所有 agent 共用。程序已在下方提供「程序扫描基线」文件清单，遵循：

1. **以程序基线为准**：基线里列出的主文件路径即各步骤的**最新版本**，无需自行 Glob 全量扫描；文件名中带时间戳后缀的是历史版本归档，不要读取。project.json 可读（取 personas / competitorNotes / step 状态），但禁止修改。
2. **按需抽读**：只 Read 与当前任务直接相关的主文件（上游产物等），不必通读全部文档；runs/ 与 sessions/ 由程序管理，禁止读写。
3. **CLAUDE.md 轻量维护**：仅当发现基线与实际不符（文件缺失、新增、已过时）时，用 Edit 更新 CLAUDE.md 的「当前文件清单」；一致则不要动。只允许写入本工作区内（cwd）的文件，工作区外的路径一律禁止。`;

/** generative 步骤的工作区约定：模型自己用 Write 写产物 */
export const WORKSPACE_PREAMBLE = `${WORKSPACE_BASE}
4. **区分产出与问答**：
   - 执行步骤任务（生成/修改产物）→ 按「产物写入要求」用 Write 工具把产物全文写入指定路径的版本文件，聊天回复只写一句完成说明，不要在回复中重复产物全文。
   - 用户消息是**询问/咨询**（如"你能看到哪些文档""上一步产出了什么"）→ 不写产物文件，直接在回复中简明回答，并在回复开头加 \`[Q&A]\`（程序会把它作为对话消息保存，不影响产物）。`;

/** conversational（访谈）步骤的工作区约定：不写产物，产出统一由程序落盘，避免与服务端访谈记录重复 */
export const WORKSPACE_PREAMBLE_CONVERSATIONAL = `${WORKSPACE_BASE}
4. **不要写产物文件**：访谈类步骤的产物（访谈记录 + 小结）由程序在会话结束时统一落盘，包括最终小结在内的所有内容直接写在对话回复里即可，**不要调用 Write 写任何产物文件**。
   - 用户消息是**询问/咨询**（如"你能看到哪些文档""上一步产出了什么"）→ 直接在回复中简明回答，并在回复开头加 \`[Q&A]\`（程序会把它作为对话消息保存，不影响产物）。`;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 程序侧扫描生成的文档清单（含每个文件含义与最新版时间），
 * 作为 agent 自行扫描/更新 CLAUDE.md 的基线注入本次运行上下文。
 */
export async function buildDocManifest(
  project: Project,
  registry: AgentDef[],
): Promise<string> {
  const lines: string[] = [];
  for (const agent of registry) {
    for (const def of agent.steps) {
      const stepKey = `${agent.agentId}:${def.stepId}`;
      const record = project.steps[stepKey];
      const state = record?.state ?? 'pending';
      if (def.outputKind === 'html-modules') {
        const files = await listModuleUiEntries(project.id);
        if (files.length === 0) {
          lines.push(`- \`prototypes/ui/<模块名>-v<N>-<时间戳>.html\` — ${def.title}｜状态 ${state}｜尚未生成`);
        } else {
          for (const f of files) {
            lines.push(
              `- \`prototypes/ui/${f.name}\` — ${def.title}｜模块「${f.module || '未命名'}」v${f.version || '?'}｜状态 ${state}｜${formatTs(f.updatedAt)}`,
            );
          }
        }
        continue;
      }
      const loc = artifactLocation(project.id, stepKey, def.outputKind);
      const rel =
        def.outputKind === 'html'
          ? `prototypes/${def.stepId}.<时间戳>.html`
          : def.outputKind === 'csv'
            ? `steps/${agent.agentId}/${def.stepId}[-说明].<时间戳>.csv|.md`
            : `steps/${agent.agentId}/${def.stepId}.<时间戳>.md`;
      const files = await listStepFiles(project.id, stepKey, def.outputKind);
      if (files.length > 0) {
        const latest = files[0];
        const archives = files.length - 1;
        lines.push(
          `- \`${path.join(path.basename(loc.dir), latest.name)}\` — ${def.title}｜状态 ${state}｜最新版 ${formatTs(latest.updatedAt)}${
            archives > 0 ? `｜历史版本 ${archives} 个（\`${path.basename(loc.dir)}/${def.stepId}*.*\`）` : ''
          }`,
        );
      } else {
        lines.push(`- \`${rel}\` — ${def.title}｜状态 ${state}｜尚未生成`);
      }
    }
  }
  const dels = await listDeliverables(project.id);
  if (dels.length > 0) {
    lines.push(
      ...dels.map((d) => `- \`deliverables/${d}\` — 最终交付文档`),
    );
  }
  const notes = (project as unknown as { competitorNotes?: unknown[] }).competitorNotes?.length ?? 0;
  const personas = project.personas?.length ?? 0;
  if (notes > 0) lines.push(`- \`project.json#competitorNotes\` — 竞品资料 ${notes} 条（存在 project.json 内）`);
  if (personas > 0) lines.push(`- \`project.json#personas\` — 玩家画像 ${personas} 个（存在 project.json 内）`);
  return lines.join('\n');
}

/** generative 步骤的产物写入要求：用 Write 工具把产物写到指定目录，文件名=名称+时间戳 */
export function artifactWriteInstruction(
  def: StepDef,
  moduleUiVersions: Record<string, number> = {},
): string {
  const now = versionStamp();
  if (def.outputKind === 'html-modules') {
    // 模块 UI 原型的文件名时间戳精确到秒（不带毫秒），直接给模型一个可照抄的值
    const seconds = now.replace(/-\d{3}$/, '');
    const existing = Object.entries(moduleUiVersions)
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
      .map(([name, v]) => `\`${name}\` 当前最新 v${v} → 本次写 v${v + 1}`)
      .join('\n');
    return [
      '## 产物写入要求（必须执行）',
      '',
      '本步骤的最终产物是**每个模块各一个**静态展示 HTML 原型，必须用 Write 工具逐个写入：',
      '',
      '- 目录：`prototypes/ui/`（项目工作区内；不存在时直接写该路径，Write 会自动建目录）',
      '- 文件名规范：`<模块名>-v<版本号>-<YYYYMMDD-HHMMSS>.html`',
      '  - `<模块名>` **逐字取自模块设计文档**中「各模块详设」一节的模块标题文字（去掉 `#` 号，不要改写、不要翻译、不要加序号）',
      '  - 标题里若有 `/ \\ : * ? " < > |` 这些文件名非法字符，替换成 `·`；**文件名里绝不能出现 `/`**',
      '  - `<版本号>` = 该模块已有版本则递增（v1 → v2 → v3 …），首次为 v1',
      '  - `<YYYYMMDD-HHMMSS>` = 本次写入时刻，**同一次运行写出的全部文件共用同一个时间戳**',
      `- 当前时间参考：\`${seconds}\``,
      '',
      existing
        ? `已有模块版本（据此决定本次版本号）：\n${existing}`
        : '已有模块版本：暂无（本次全部为 v1）',
      '',
      '**范围约束（重要）**：',
      '- 用户没有点名模块 → 为模块设计文档里的**每一个**模块写一个文件。',
      '- 用户点名了某个模块 → **只写该模块的那一个文件**，其他模块的现有文件一个字都不要动（不要重写、不要删除、不要改文件名）。',
      '- 每个文件都是完整的独立页面（`<!DOCTYPE html>` … `</html>`），页面之间不要互相引用。',
      '',
      '聊天回复里只写一句完成说明（写了哪些模块、各自版本号），不要把 HTML 代码贴进回复，也不要贴进其他文件。',
    ].join('\n');
  }
  if (def.outputKind === 'csv') {
    return [
      '## 产物写入要求（必须执行）',
      '',
      '本步骤的最终产物是一组 CSV 配置表 + 一份表格说明文档，必须用 Write 工具写入：',
      '',
      `- 目录：\`steps/${def.agentId}/\`（项目工作区内）`,
      '- CSV 表：1 张到多张，文件名规范 `config-tables[-表名后缀].<YYYYMMDD-HHMMSS-iii>.csv`（后缀用小写英文/数字/连字符，见名知意，如 `config-tables-hero.csv`；同名同一轮的表共用同一个时间戳）',
      `- 表格说明：恰好 1 份，文件名 \`config-tables-说明.<YYYYMMDD-HHMMSS-iii>.md\`，与本次全部 CSV 共用同一个时间戳，本次建议时间戳 \`${now}\`（以实际写入时刻为准）`,
      '',
      'CSV 格式要求：',
      '- 第一行为表头（列名）；枚举型列（状态/类型/品质等有限可选值）必须在说明文档中列出该列的**全部可选值集合**，且表内只使用这些值',
      '- 数字型列填纯数字（不加单位、不加千分位、不加引号）；文本列如含逗号需用双引号包裹',
      '- 编码 UTF-8（无 BOM），逗号分隔；程序会把表格渲染为应用内可编辑表格（枚举列下拉选择可选集合、数字列直接填写）',
      '',
      '聊天回复里只写一句完成说明（写了几张表、各覆盖什么模块），不要把 CSV 内容贴进回复。',
    ].join('\n');
  }
  if (def.outputKind === 'html') {
    return [
      '## 产物写入要求（必须执行）',
      '',
      `本步骤的最终产物是 HTML 可玩原型，必须用 Write 工具写入：`,
      '',
      `- 目录：\`prototypes/\`（项目工作区内）`,
      `- 文件名规范：\`${def.stepId}.<YYYYMMDD-HHMMSS-iii>.html\`（名称+写入时刻的时间戳；程序按创建时间倒序取最新一个为当前版本）`,
      `- 当前本地时间供参考：\`${now}\` → 本次文件名建议 \`${def.stepId}.${now}.html\`（以实际写入时刻为准）`,
      '',
      '要求：完整的 `<!DOCTYPE html> … </html>` 单文件页面；产物全文写进文件，聊天回复里只写一句完成说明（不要重复产物代码）。',
    ].join('\n');
  }
  return [
    '## 产物写入要求（必须执行）',
    '',
    '本步骤的最终产物必须用 Write 工具写入：',
    '',
    `- 目录：\`steps/${def.agentId}/\`（项目工作区内）`,
    `- 文件名规范：\`${def.stepId}.<YYYYMMDD-HHMMSS-iii>.md\`（名称+写入时刻的时间戳；程序按创建时间倒序取最新一个为当前版本）`,
    `- 当前本地时间供参考：\`${now}\` → 本次文件名建议 \`${def.stepId}.${now}.md\`（以实际写入时刻为准）`,
    '',
    '要求：产物全文写进文件，聊天回复里只写一句完成说明（不要重复产物全文）。',
  ].join('\n');
}

/**
 * 组装本次运行的工作区简报：cwd 说明 + 程序扫描基线 + CLAUDE.md 当前内容 +（generative）产物写入要求。
 * 注入到 prompt（generative）或首条消息（conversational）中。
 */
export async function buildWorkspaceBrief(
  project: Project,
  registry: AgentDef[],
  def?: StepDef,
): Promise<string> {
  await ensureClaudeMd(project.id);
  const manifest = await buildDocManifest(project, registry);
  let claudeMd = '';
  try {
    claudeMd = await fs.readFile(claudeMdPath(project.id), 'utf8');
  } catch {
    // ensureClaudeMd 刚写过，理论上不会走到
  }
  const cwd = projectDir(project.id);
  const sections = [
    '## 工作区（cwd）',
    '',
    `本次运行工作目录（cwd）：\`${cwd}\`，所有 agent 共用。`,
    '',
    '### 程序扫描基线（当前文件清单，供校对 CLAUDE.md 用）',
    '',
    manifest || '（目录下暂无产物文件）',
    '',
    '### CLAUDE.md 当前内容',
    '',
    '```markdown',
    claudeMd,
    '```',
  ];
  if (def && def.mode === 'generative') {
    const versions =
      def.outputKind === 'html-modules' ? await latestModuleUiVersions(project.id) : {};
    sections.push('---', '', artifactWriteInstruction(def, versions));
  }
  return sections.join('\n');
}
