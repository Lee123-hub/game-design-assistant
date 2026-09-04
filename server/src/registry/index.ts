import {
  PROMPT_FILES,
  type AgentDef,
  type AgentId,
  type PlayerPersona,
  type StepDef,
  type StepKey,
} from '@gda/shared';

const GUIDE_PRESET_QUERIES: Record<string, string[]> = {
  concept: ['开始访谈，逐项提问', '我补充一些背景：……（发送前修改）'],
  'competitors-focus': ['开始访谈，逐项提问', '我最想对标的竞品：……（发送前修改）'],
  'target-users': ['开始访谈，逐项提问', '我的目标用户是：……（发送前修改）'],
  'core-loop': ['开始访谈，逐项提问', '我心目中的核心循环：……（发送前修改）'],
  'business-model': ['开始访谈，逐项提问', '商业化初步考虑：……（发送前修改）'],
};

// 访谈步骤的上下文注入：不改变解锁顺序，只把已完成的上游产物带给模型
const GUIDE_CONTEXT_DEPS: Record<string, StepKey[]> = {
  concept: [],
  'competitors-focus': ['guide:concept'],
  'target-users': ['guide:concept'],
  'core-loop': ['guide:concept'],
  'business-model': ['guide:concept', 'guide:core-loop'],
};

const GUIDE_CONVERSATIONAL: StepDef[] = (
  [
    ['concept', '一句话概念与类型平台'],
    ['competitors-focus', '竞品关注点'],
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
  // 竞品访谈需要现场联网调研：竞品不预设，全部靠搜索和用户提供
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

const COMPETITOR_ANALYSIS: StepDef = {
  agentId: 'competitor',
  stepId: 'analysis',
  title: '竞品分析报告',
  mode: 'generative',
  outputKind: 'markdown',
  dependsOn: ['guide:competitors-focus'],
  useWebSearch: true,
  maxTurns: 6,
  promptFile: PROMPT_FILES.competitorAnalysis,
  presetQueries: [
    '联网调研竞品并生成分析报告',
    '重点分析机制差异与我们的差异化机会',
    '重点分析商业化设计差异与定价参考',
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

const NUMERIC_STEPS: StepDef[] = [
  {
    agentId: 'numeric',
    stepId: 'economy',
    title: '经济系统数值模型',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['guide:one-pager'],
    maxTurns: 2,
    promptFile: PROMPT_FILES.numericEconomy,
    presetQueries: [
      '生成经济系统数值模型',
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

const TECH_STEPS: StepDef[] = [
  {
    agentId: 'tech',
    stepId: 'stack',
    title: '技术选型报告',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['guide:one-pager'],
    maxTurns: 2,
    promptFile: PROMPT_FILES.techStack,
    presetQueries: [
      '生成技术选型报告',
      '倾向 Web/H5 技术栈，快速验证',
      '倾向成熟跨端引擎，考虑长期发展',
    ],
  },
  {
    agentId: 'tech',
    stepId: 'risks',
    title: '技术原型报告（架构与风险）',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['guide:one-pager', 'tech:stack'],
    maxTurns: 2,
    promptFile: PROMPT_FILES.techRisks,
    presetQueries: [
      '生成架构草案与风险报告',
      '重点评估性能与包体风险',
      '重点评估数值策划可配置化的工具链',
    ],
  },
];

const PLAYER_STEP_DEPENDS = [
  'guide:one-pager',
  'competitor:analysis',
  'prototype:html',
  'numeric:economy',
];

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

const ASSEMBLE_STEPS: StepDef[] = [
  {
    agentId: 'assemble',
    stepId: 'consistency',
    title: '交叉一致性检查',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: [
      'guide:one-pager',
      'competitor:analysis',
      'numeric:economy',
      'numeric:progression',
      'tech:stack',
      'tech:risks',
    ],
    maxTurns: 2,
    promptFile: PROMPT_FILES.assembleConsistency,
    deliverableFile: '一致性检查报告.md',
    presetQueries: [
      '执行交叉一致性检查',
      '重点关注数值自洽性',
      '重点关注玩法循环与商业模式的矛盾',
    ],
  },
  {
    agentId: 'assemble',
    stepId: 'gdd',
    title: 'GDD 主文档',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: [
      'guide:one-pager',
      'guide:core-loop',
      'competitor:analysis',
      'numeric:economy',
      'numeric:progression',
      'tech:stack',
      'tech:risks',
      'assemble:consistency',
    ],
    maxTurns: 3,
    promptFile: PROMPT_FILES.assembleGdd,
    deliverableFile: 'GDD.md',
    presetQueries: [
      '整合全部产物，生成 GDD 主文档',
      'GDD 更精炼，只保留开发必读信息',
      'GDD 更详尽，包含系统细节与附录',
    ],
  },
  {
    agentId: 'assemble',
    stepId: 'index',
    title: '交付包索引 README',
    mode: 'generative',
    outputKind: 'markdown',
    dependsOn: ['assemble:gdd'],
    maxTurns: 2,
    promptFile: PROMPT_FILES.assembleIndex,
    deliverableFile: 'README.md',
    presetQueries: [
      '生成交付包索引 README',
      '面向外部合作者写一份更友好的导读',
    ],
  },
];

const AGENT_META: Record<AgentId, { title: string; description: string }> = {
  guide: {
    title: '引导收集（阶段1 · 概念）',
    description: '通过一问一答引导你完成概念阶段的信息收集，并汇总为一页纸概念案。',
  },
  competitor: {
    title: '竞品分析',
    description: '联网调研竞品（WebSearch），撰写竞品分析报告与差异化机会。',
  },
  prototype: {
    title: 'HTML 原型',
    description: '生成单文件 HTML 可玩原型，在浏览器内直接试玩，验证核心循环。',
  },
  numeric: {
    title: '数值分析',
    description: '设计经济产出/回收模型与养成曲线，保证数字自洽。',
  },
  tech: {
    title: '技术原型',
    description: '技术选型建议 + 架构草案与必须先验证的技术风险。',
  },
  player: {
    title: '玩家评估',
    description: '多个模拟玩家画像，以玩家视角评估当前设计（每个画像一份报告）。',
  },
  assemble: {
    title: '交付整合',
    description: '交叉一致性检查，整合全部产物为 GDD 与交付文档包。',
  },
};

/** 构建完整注册表；player agent 按 persona 动态展开 */
export function buildRegistry(personas: PlayerPersona[]): AgentDef[] {
  const partials: Array<Pick<AgentDef, 'agentId' | 'steps'>> = [
    { agentId: 'guide', steps: [...GUIDE_CONVERSATIONAL, GUIDE_ONE_PAGER] },
    { agentId: 'competitor', steps: [COMPETITOR_ANALYSIS] },
    { agentId: 'prototype', steps: [PROTOTYPE_HTML] },
    { agentId: 'numeric', steps: NUMERIC_STEPS },
    { agentId: 'tech', steps: TECH_STEPS },
    { agentId: 'player', steps: personas.map(playerStep) },
    { agentId: 'assemble', steps: ASSEMBLE_STEPS },
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
