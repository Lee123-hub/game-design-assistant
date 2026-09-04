import type { Settings } from '@gda/shared';

/**
 * 构造 SDK 子进程环境变量。
 * 注意：options.env 会整体替换子进程 env，必须 spread process.env 保住 PATH/HOME。
 */
export function buildEnv(settings: Settings): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ANTHROPIC_BASE_URL: settings.baseUrl,
    ANTHROPIC_AUTH_TOKEN: settings.apiKey,
    // 背景小模型调用（话题检测/压缩等）跟随默认模型，否则会打到未知模型
    ANTHROPIC_DEFAULT_HAIKU_MODEL: settings.defaultModel,
    // DeepSeek 网关不接受的实验性字段 / 非必要外联
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    // deepseek-chat 非标准 claude-* id，显式声明上下文窗口
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: '128000',
  };
}

/** 常见的、对纯文本生成有害的工具：全部禁用 */
export const DISABLED_TOOLS = [
  'WebSearch',
  'WebFetch',
  'Bash',
  'Write',
  'Edit',
  'Read',
  'NotebookEdit',
  'Agent',
  'TodoWrite',
];
