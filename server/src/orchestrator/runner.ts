import type { GuideTurn, Project, StepError, StepRecord, StepState } from '@gda/shared';
import { getBus } from './eventBus.js';
import { updateProject } from '../store/projectStore.js';
import { writeStepArtifact } from '../store/artifactStore.js';
import { relativeArtifactPath, projectDir } from '../store/paths.js';

export const FIELD_SENTINEL = '[[FIELD_COMPLETE]]';

export function stepKeyOf(agentId: string, stepId: string): string {
  return `${agentId}:${stepId}`;
}

export async function setStepState(
  projectId: string,
  stepKey: string,
  state: StepState,
  extra?: Partial<StepRecord>,
): Promise<void> {
  await updateProject(projectId, (p) => {
    const record = p.steps[stepKey];
    if (!record) return;
    record.state = state;
    if (extra) Object.assign(record, extra);
  });
  getBus(projectId).publish({
    type: 'step_state',
    stepKey,
    state,
    runId: extra?.runId ?? undefined,
    error: extra?.error,
  });
}

export function publishStepError(
  projectId: string,
  stepKey: string,
  runId: string,
  code: StepError['code'],
  message: string,
): void {
  getBus(projectId).publish({ type: 'step_error', stepKey, runId, error: { code, message } });
}

/** 把访谈轮次整理成 Markdown 产物 */
export function guideTranscriptToMarkdown(
  title: string,
  turns: GuideTurn[],
  finalSummary: string,
): string {
  const lines: string[] = [`# 概念访谈记录：${title}`, ''];
  let qIndex = 0;
  for (const turn of turns) {
    if (turn.role === 'assistant') {
      qIndex += 1;
      lines.push(`## 第 ${qIndex} 轮`, '', '**制作人间：**', '', turn.text.trim(), '');
    } else {
      lines.push('**开发者答：**', '', turn.text.trim(), '');
    }
  }
  if (finalSummary.trim()) {
    lines.push('---', '', '# 收集小结', '', finalSummary.trim());
  }
  return lines.join('\n');
}

/** 从模型输出中提取纯 HTML：剥代码围栏、定位 <!DOCTYPE html>…</html> */
export function extractHtml(raw: string): string {
  let text = raw.trim();
  // 剥 markdown 围栏
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/);
  if (fence && fence[1].includes('<html')) text = fence[1].trim();

  const start = text.search(/<!DOCTYPE html>/i);
  if (start >= 0) {
    const end = text.lastIndexOf('</html>');
    if (end > start) return text.slice(start, end + '</html>'.length);
  }
  // 兜底：<html> 开头
  const htmlStart = text.search(/<html[\s>]/i);
  if (htmlStart >= 0) {
    const end = text.lastIndexOf('</html>');
    if (end > htmlStart) return text.slice(htmlStart, end + '</html>'.length);
  }
  throw new Error('输出中未找到完整的 HTML 文档（<!DOCTYPE html> … </html>）');
}

export { writeStepArtifact, relativeArtifactPath, projectDir };
