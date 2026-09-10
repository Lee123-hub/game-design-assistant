import {
  PROMPT_FILES,
  DEFAULT_AGENT_TOOLS,
  type AgentDef,
  type AgentId,
  type PlayerPersona,
  type StepDef,
  type StepKey,
} from '@gda/shared';

const GUIDE_PRESET_QUERIES: Record<string, string[]> = {
  concept: ['开始访谈，逐项提问'],
  'competitors-focus': ['开始访谈并联网调研竞品'],
  'target-users': ['开始访谈，逐项提问'],
  'core-loop': ['开始访谈，逐项提问'],
  'business-model': ['开始访谈，逐项提问'],
};

// 访谈步骤的上下文注入：不改变解锁顺序，只把已完成的上游产物带给模型
const GUIDE_CONTEXT_DEPS: Record<string, StepKey[]> = {
  concept: [],
  'competitors-focus': ['guide:concept'],
  'target-users': ['guide:concept', 'guide:competitors-focus'],
  'core-loop': ['guide:concept'],
  'business-model': ['guide:concept', 'guide:core-loop'],
};

const GUIDE_CONVERSATIONAL: StepDef[] = (
  [
    ['concept', '一句话概念与类型平台'],
    // 竞品分析已融合进本节点：访谈关注点 + 联网调研 + 产出分析报告
    ['competitors-focus', '竞品调研与分析'],
    ['target-users', '目标用户画像'],
    ['core-loop', '核心循环草图'],
    ['business-model', '商业模式'],
  ] as const
).map(([stepId, title]) => ({
  agentId: 'guide' as AgentId,
  stepId,
  title,
  mode: 'conversational' as const,
  outputKind: 'markdown' as const,
  dependsOn: [],
  maxTurns: 8,
  promptFile: PROMPT_FILES.guideConversational,
  presetQueries: GUIDE_PRESET_QUERIES[stepId] ?? ['开始访谈，逐项提问'],
  contextDeps: GUIDE_CONTEXT_DEPS[stepId] ?? [],
  // 竞品调研需要现场联网调研：竞品不预设，全部靠搜索和用户提供
  ...(stepId === 'competitors-focus' ? { useWebSearch: true } : {}),
}));

const GUIDE_ONE_PAGER: StepDef = {
  agentId: 'guide',
  stepId: 'one-pager',
  title: '汇总 One-pager 概念案',
  mode: 'generative',
  outputKind: 'markdown',
  dependsOn: [
    'guide:concept',
    'guide:competitors-focus',
    'guide:target-users',
    'guide:core-loop',
    'guide:business-model',
  ],
  maxTurns: 2,
  promptFile: PROMPT_FILES.guideOnePager,
  presetQueries: [
    '汇总以上访谈，生成 One-pager 概念案',
    '更强调策略深度，写硬核一点',
    '更强调易上手，突出单局爽感',
  ],
};

const PROTOTYPE_HTML: StepDef = {
  agentId: 'prototype',
  stepId: 'html',
  title: 'HTML 可玩原型',
  mode: 'generative',
  outputKind: 'html',
  dependsOn: ['guide:one-pager', 'guide:core-loop'],
  maxTurns: 2,
  promptFile: PROMPT_FILES.prototypeHtml,
  presetQueries: [
    '生成 HTML 可玩原型',
    '视觉风格更卡通活泼一些',
    '难度更激进，单局节奏更快',
    '增加更明显的命中与反馈特效',
  ],
};

/** 详细设计·模块设计默认开启 Agent 工具：要求派子 agent 做逻辑闭环与可读性检查 */
const DESIGN_MODULE_TOOLS = [...DEFAULT_AGENT_TOOLS, 'Agent'];

const DESIGN_STEPS: StepDef[] = [
  {
    agentId: 'design',
    stepId: 'module-design',
    title: '模块详细设计',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['guide:one-pager', 'guide:core-loop', 'prototype:html'],
    maxTurns: 4,
    defaultTools: DESIGN_MODULE_TOOLS,
    promptFile: PROMPT_FILES.designModule,
    presetQueries: [
      '生成模块详细设计文档',
      '补充音频/音效与表现层细节',
      '对关键模块做一轮子 agent 逻辑闭环复查',
    ],
  },
  {
    agentId: 'design',
    stepId: 'module-ui',
    title: '模块 UI 原型',
    mode: 'generative',
    outputKind: 'html-modules',
    dependsOn: ['design:module-design'],
    maxTurns: 4,
    // 每个模块一个静态页面，不改玩法逻辑，不需要子 agent 复查
    maxTurnsHint: 10,
    promptFile: PROMPT_FILES.moduleUi,
    // 桌面《AI 游戏 UI 设计约束》逐字内置，作为本步骤的硬性 UI 规范（用户覆盖提示词也依然生效）
    promptExtras: [PROMPT_FILES.uiConstraints],
    presetQueries: [
      '为所有模块生成 UI 原型',
      '整体信息层级更克制，正文文字再减少',
      '信息不要压缩，改用分层/弹层展示',
    ],
  },
  {
    agentId: 'design',
    stepId: 'config-tables',
    title: '属性与数值配置表（CSV）',
    mode: 'generative',
    outputKind: 'csv',
    dependsOn: ['design:module-design'],
    maxTurns: 4,
    promptFile: PROMPT_FILES.designConfigTables,
    presetQueries: [
      '根据详细设计产出 CSV 配置表',
      '增加一张成长/关卡配置表',
      '给现有表格补充一列并更新说明',
    ],
  },
];

const NUMERIC_STEPS: StepDef[] = [
  {
    agentId: 'numeric',
    stepId: 'economy',
    title: '经济系统数值模型',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['guide:one-pager', 'design:module-design', 'design:config-tables'],
    maxTurns: 2,
    promptFile: PROMPT_FILES.numericEconomy,
    presetQueries: [
      '基于详细设计与配置表生成经济数值模型',
      '产出节奏更克制，拉长成长线',
      '前期更宽松，爽感优先',
    ],
  },
  {
    agentId: 'numeric',
    stepId: 'progression',
    title: '养成与成长曲线',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['guide:one-pager', 'numeric:economy'],
    maxTurns: 2,
    promptFile: PROMPT_FILES.numericProgression,
    presetQueries: [
      '生成养成与成长曲线',
      '以单局内成长为主，弱化局外养成',
      '强化局外永久成长的价值感',
    ],
  },
];

const PLAYER_STEP_DEPENDS = ['guide:one-pager', 'prototype:html', 'numeric:economy'];

function playerStep(persona: PlayerPersona): StepDef {
  return {
    agentId: 'player',
    stepId: persona.id,
    title: `玩家评估：${persona.name}`,
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: PLAYER_STEP_DEPENDS,
    maxTurns: 2,
    promptFile: PROMPT_FILES.playerEval,
    presetQueries: [
      '以该画像视角评估当前设计',
      '重点关注上手门槛与前期体验',
      '重点关注付费压力与长线动力',
    ],
  };
}

/** 玩家总结报告：依赖全部玩家画像 step（动态），永远位于流程最后 */
function playerSummaryStep(personas: PlayerPersona[]): StepDef {
  return {
    agentId: 'player',
    stepId: 'summary',
    title: '玩家总结报告',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: personas.map((p) => `player:${p.id}` as StepKey),
    maxTurns: 2,
    promptFile: PROMPT_FILES.playerSummary,
    presetQueries: [
      '汇总全部玩家评估，生成总结报告',
      '按必须修复/建议取舍归并结论',
      '给出对详细设计与数值的修订清单',
    ],
  };
}

const AGENT_META: Record<AgentId, { title: string; description: string }> = {
  guide: {
    title: '引导收集',
    description: '通过一问一答引导你完成概念阶段的信息收集（含竞品调研与分析），并汇总为一页纸概念案。',
  },
  prototype: {
    title: 'HTML 原型',
    description: '生成单文件 HTML 可玩原型，在浏览器内直接试玩，验证核心循环。',
  },
  design: {
    title: '详细设计',
    description:
      '模块详细设计（玩法逻辑/交互/音频音效等，子 agent 交叉检查）+ 逐模块 UI 原型（静态展示 HTML）+ CSV 属性数值配置表。',
  },
  numeric: {
    title: '数值分析',
    description: '基于详细设计与配置表设计经济产出/回收模型与养成曲线，保证数字自洽。',
  },
  player: {
    title: '玩家评估',
    description: '多个模拟玩家画像并行评估当前设计，最后汇总为一份玩家总结报告。',
  },
};

/** 构建完整注册表；player agent 按 persona 动态展开，末尾固定追加总结报告 step */
export function buildRegistry(personas: PlayerPersona[]): AgentDef[] {
  const partials: Array<Pick<AgentDef, 'agentId' | 'steps'>> = [
    { agentId: 'guide', steps: [...GUIDE_CONVERSATIONAL, GUIDE_ONE_PAGER] },
    { agentId: 'prototype', steps: [PROTOTYPE_HTML] },
    { agentId: 'design', steps: DESIGN_STEPS },
    { agentId: 'numeric', steps: NUMERIC_STEPS },
    { agentId: 'player', steps: [...personas.map(playerStep), playerSummaryStep(personas)] },
  ];
  return partials.map((partial) => ({ ...AGENT_META[partial.agentId], ...partial }));
}

export function findStepDef(
  registry: AgentDef[],
  agentId: string,
  stepId: string,
): StepDef | undefined {
  return registry
    .find((a) => a.agentId === agentId)
    ?.steps.find((s) => s.stepId === stepId);
}
