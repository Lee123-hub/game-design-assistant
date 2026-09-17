/** SDK result.modelUsage 的形态（按模型名聚合的累计 token） */
export interface ModelUsageEntry {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type ModelUsage = Record<string, ModelUsageEntry>;

/** 汇总 token 数（用于界面显示「本步消耗」） */
export function sumTokens(usage: ModelUsage): {
  input: number;
  output: number;
  cacheRead: number;
} {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  for (const u of Object.values(usage)) {
    input += u.inputTokens ?? 0;
    output += u.outputTokens ?? 0;
    cacheRead += u.cacheReadInputTokens ?? 0;
  }
  return { input, output, cacheRead };
}
