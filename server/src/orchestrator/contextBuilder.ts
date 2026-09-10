import type { AgentDef, Project, StepDef } from '@gda/shared';
import {
  latestArtifactFile,
  latestVersionGroup,
  listModuleUiEntries,
  readArtifactAt,
  artifactUpdatedAt,
} from '../store/artifactStore.js';
import { fileExists } from '../util/fs.js';

const PER_BLOCK_LIMIT = 12_000;
const TOTAL_BUDGET = 60_000;

export interface ContextBlock {
  label: string;
  content: string;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n…（已截断，原文 ${text.length} 字符）`;
}

/**
 * 解析 step 的上游依赖产物为上下文块。
 * 上游产物未生成时跳过（由调用方决定是否视为前置不足）。
 */
export async function buildContextBlocks(
  project: Project,
  registry: AgentDef[],
  step: StepDef,
): Promise<ContextBlock[]> {
  const blocks: ContextBlock[] = [];

  // player step：注入画像
  if (step.agentId === 'player') {
    const persona = project.personas.find((p) => p.id === step.stepId);
    if (persona) {
      blocks.push({
        label: '你的玩家画像',
        content: `名字：${persona.name}\n${persona.description}`,
      });
    }
  }

  for (const depKey of step.dependsOn) {
    const [depAgentId, depStepId] = depKey.split(':');
    const def = registry
      .find((a) => a.agentId === depAgentId)
      ?.steps.find((s) => s.stepId === depStepId);
    if (!def) continue;

    // 多文件步骤：csv 是一组表 + 说明 md；html-modules 是每个模块一个展示页
    if (def.outputKind === 'csv' || def.outputKind === 'html-modules') {
      const group = await latestVersionGroup(project.id, depKey, def.outputKind);
      if (group.length === 0) continue;
      const isModuleUi = def.outputKind === 'html-modules';
      const parts: string[] = [];
      for (const file of group) {
        const name = file.split('/').pop() ?? file;
        const raw = (await readArtifactAt(file)) ?? '';
        // html-modules 只注入标题+头部说明，绝不把整页代码塞进上下文
        parts.push(
          isModuleUi
            ? `#### ${name}\n\n${summarizeHtml(raw)}`
            : `#### ${name}\n\n${truncate(raw, PER_BLOCK_LIMIT)}`,
        );
      }
      blocks.push({
        label: `${def.title}（${depKey}，共 ${group.length} 个文件）`,
        content: parts.join('\n\n'),
      });
      continue;
    }

    // 下游参考上游产物的「当前版本」= 最新一个版本文件
    const file = await latestArtifactFile(project.id, depKey, def.outputKind);
    if (!file) continue;

    const raw = (await readArtifactAt(file)) ?? '';
    // html 原型注入时只保留头部注释与玩法概述，避免塞入整份代码
    const content =
      def.outputKind === 'html' ? summarizeHtml(raw) : truncate(raw, PER_BLOCK_LIMIT);

    blocks.push({
      label: `${def.title}（${depKey}）`,
      content,
    });
  }

  // 总预算裁剪：优先保留靠前的块，超出预算的块截断
  let used = 0;
  const result: ContextBlock[] = [];
  for (const block of blocks) {
    const remaining = TOTAL_BUDGET - used;
    if (remaining <= 500) break;
    result.push({ label: block.label, content: truncate(block.content, remaining) });
    used += Math.min(block.content.length, remaining);
  }
  return result;
}

function summarizeHtml(html: string): string {
  const commentMatch = html.match(/<!--([\s\S]*?)-->/);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
  const body = `原型页面标题：${title}\n原型说明：${commentMatch?.[1]?.trim() ?? '（无）'}\n（完整代码已生成并可在页面内试玩，此处不重复展示）`;
  return body;
}

export function formatContext(blocks: ContextBlock[]): string {
  if (blocks.length === 0) return '';
  return (
    '\n\n## 上下文\n\n' +
    blocks.map((b) => `### ${b.label}\n\n${b.content}`).join('\n\n')
  );
}

/**
 * 本步骤当前版本的产物上下文：重新生成/修改时注入，作为修改基准（避免重生成丢失已确认内容）。
 * csv 步骤注入整组文件；html 只注入头部摘要；首次生成（无产物）时返回 null。
 */
export async function buildSelfBlock(
  project: Project,
  def: StepDef,
  stepKey: string,
): Promise<ContextBlock | null> {
  const label = '本步骤当前版本的产物（用户要求修改/重新生成，作为修改基准）';
  if (def.outputKind === 'html-modules') {
    // 模块 UI 原型：只注入「模块 → 当前版本文件」清单。页面源码一旦注入，
    // 多模块项目会瞬间撑爆上下文预算，且模型能直接从工作区 Read 到需要改的那个文件。
    const files = await listModuleUiEntries(project.id);
    if (files.length === 0) return null;
    const lines = files.map(
      (f) =>
        `- 模块「${f.module || '未命名'}」v${f.version || '?'} → \`prototypes/ui/${f.name}\`（${f.updatedAt}）`,
    );
    return {
      label,
      content: [
        '各模块当前版本文件：',
        ...lines,
        '',
        '若用户只点名了其中某个模块，只改该模块（写该模块的下一个版本文件），其余模块保持现状。',
      ].join('\n'),
    };
  }
  if (def.outputKind === 'csv') {
    const group = await latestVersionGroup(project.id, stepKey, def.outputKind);
    if (group.length === 0) return null;
    const parts: string[] = [];
    for (const file of group) {
      const name = file.split('/').pop() ?? file;
      const raw = (await readArtifactAt(file)) ?? '';
      parts.push(`#### ${name}\n\n${truncate(raw, PER_BLOCK_LIMIT)}`);
    }
    return { label, content: parts.join('\n\n') };
  }
  const file = await latestArtifactFile(project.id, stepKey, def.outputKind);
  if (!file) return null;
  const raw = (await readArtifactAt(file)) ?? '';
  if (!raw.trim()) return null;
  const content = def.outputKind === 'html' ? summarizeHtml(raw) : truncate(raw, PER_BLOCK_LIMIT);
  return { label, content };
}

export { artifactUpdatedAt };
