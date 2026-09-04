import type { StepKey, StepRecord } from './step.js';

export interface PlayerPersona {
  id: string; // 'core' | 'casual' | 'payer' | 'custom-<uuid>'
  name: string;
  description: string;
  preset: boolean;
}

export const PRESET_PERSONAS: PlayerPersona[] = [
  {
    id: 'core',
    name: '核心玩家',
    description:
      '有多年游戏经验，每周游戏时间 10 小时以上，追求深度与挑战，对机制复杂度容忍度高，反感无意义的重复劳动和氪金压力。',
    preset: true,
  },
  {
    id: 'casual',
    name: '休闲玩家',
    description:
      '碎片时间游玩，单次 5-15 分钟，上手门槛敏感，不喜欢复杂教程和深层系统，重视轻松有趣的即时反馈。',
    preset: true,
  },
  {
    id: 'payer',
    name: '付费玩家',
    description:
      '愿意为体验付费，关注付费点是否公平、性价比感知、付费与体验的平衡，对逼氪和 pay-to-win 高度敏感。',
    preset: true,
  },
];

export interface Project {
  id: string;
  name: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  steps: Record<StepKey, StepRecord>;
  personas: PlayerPersona[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  idea: string;
  createdAt: string;
  updatedAt: string;
  progress: { done: number; total: number };
}
