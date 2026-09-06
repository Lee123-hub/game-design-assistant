import type {
  AgentDef,
  GuideTurn,
  Project,
  StepDef,
  StepError,
} from '@gda/shared';
import { runQuery, QueryRunError } from '../sdk/client.js';
import { InputQueue } from '../sdk/inputQueue.js';
import { appendRunLog } from '../store/runLog.js';
import { appendSession, writeSession } from '../store/sessionStore.js';
import { loadProject } from '../store/projectStore.js';
import { readSession } from '../store/sessionStore.js';
import {
  artifactLocation,
  latestArtifactFile,
  listNewArtifactFiles,
  listStepFiles,
  normalizeArtifactName,
  readArtifactAt,
  writeDeliverable,
  writeStepArtifact,
} from '../store/artifactStore.js';
import path from 'node:path';
import { relativeArtifactPath } from '../store/paths.js';
import { buildRegistry, findStepDef } from '../registry/index.js';
import { loadSettings } from '../store/settingsStore.js';
import { resolveModel, resolveSystemPrompt } from '../store/promptStore.js';
import { runSemaphore } from './semaphore.js';
import { buildContextBlocks, buildSelfBlock, formatContext } from './contextBuilder.js';
import {
  ANSWER_MARK,
  ANSWER_MODE_INSTRUCTION,
  buildWorkspaceBrief,
  looksLikeQuestion,
  projectDir,
  WORKSPACE_PREAMBLE,
  WORKSPACE_PREAMBLE_CONVERSATIONAL,
  workspaceMaxTurns,
  workspaceToolSet,
} from './workspace.js';
import { mergedSkillPluginPaths } from '../store/skillStore.js';
import { getBus } from './eventBus.js';
import {
  FIELD_SENTINEL,
  extractHtml,
  guideTranscriptToMarkdown,
  publishStepError,
  setStepState,
} from './runner.js';

export interface LiveRun {
  runId: string;
  stepKey: string;
  abortController: AbortController;
  startedAt: string;
}

interface GuideLiveRun extends LiveRun {
  queue: InputQueue;
  turns: GuideTurn[];
  sessionId?: string;
}

const runs = new Map<string, LiveRun>(); // key: stepKey
const guideSessions = new Map<string, GuideLiveRun>(); // key: stepKey

export function getLiveRun(stepKey: string): LiveRun | undefined {
  return runs.get(stepKey) ?? guideSessions.get(stepKey);
}

export function getGuideTurns(stepKey: string): GuideTurn[] {
  return guideSessions.get(stepKey)?.turns ?? [];
}

export function isGuideLive(stepKey: string): boolean {
  return guideSessions.has(stepKey);
}

export function liveRunCount(): number {
  return runs.size + guideSessions.size;
}

function newRunId(): string {
  return `r-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function mapError(err: unknown): StepError {
  if (err instanceof QueryRunError) {
    return {
      code: err.code === 'aborted' ? 'aborted' : err.code === 'max_turns' ? 'max_turns' : 'provider',
      message: err.message,
    };
  }
  return { code: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

/** 终止某个 step 的当前运行：已流出的部分内容保留为产物，状态置为 canceled，等待用户「完成」确认 */
export async function abortStep(projectId: string, stepKey: string): Promise<boolean> {
  const live = getLiveRun(stepKey);
  if (!live) return false;
  live.abortController.abort();
  return true;
}

/**
 * 标记某个 step 完成（「完成」按钮）：要求先终止运行。
 * - 访谈步骤：把 session 中的问答落盘为产物
 * - 其余：若已有产物（如终止时落盘的部分产物）则保留，直接置 done
 */
export async function completeStep(projectId: string, stepKey: string): Promise<boolean> {
  if (getLiveRun(stepKey)) return false;
  const project = await loadProject(projectId);
  const record = project?.steps[stepKey];
  if (!project || !record) return false;
  if (record.state === 'done' || record.state === 'running' || record.state === 'waiting_input') {
    return false;
  }

  const registry = buildRegistry(project.personas);
  const [agentId, stepId] = stepKey.split(':');
  const def = findStepDef(registry, agentId, stepId);
  const runId = record.runId ?? '';

  // 访谈步骤：session 里有问答才生成访谈记录产物
  if (def?.mode === 'conversational') {
    const sessionTurns = await readSession(projectId, stepKey);
    if (sessionTurns.some((t) => t.role === 'assistant')) {
      await finishGuideFromTurns(project.id, def.title, stepKey, runId, sessionTurns, record.sessionId ?? '');
      return true;
    }
  }

  await setStepState(project.id, stepKey, 'done', { finishedAt: new Date().toISOString() });
  getBus(project.id).publish({ type: 'step_done', stepKey, runId, artifactPath: stepKey });
  return true;
}

export async function abortAll(): Promise<void> {
  for (const live of [...runs.values(), ...guideSessions.values()]) {
    live.abortController.abort();
  }
}

// ---------------------------------------------------------------------------
// Generative step
// ---------------------------------------------------------------------------

export async function runGenerativeStep(
  project: Project,
  registry: AgentDef[],
  def: StepDef,
  seedAnswers?: string,
): Promise<{ runId: string; queued: boolean }> {
  const stepKey = def.agentId + ':' + def.stepId;
  if (getLiveRun(stepKey)) throw new HttpConflict('该 step 正在运行中');

  const runId = newRunId();
  const queued = runSemaphore.active >= runSemaphore.limit;
  void executeGenerative(project, registry, def, stepKey, runId, seedAnswers);
  return { runId, queued };
}

async function executeGenerative(
  project: Project,
  registry: AgentDef[],
  def: StepDef,
  stepKey: string,
  runId: string,
  seedAnswers?: string,
): Promise<void> {
  const release = await runSemaphore.acquire();
  const abortController = new AbortController();
  const live: LiveRun = { runId, stepKey, abortController, startedAt: new Date().toISOString() };
  runs.set(stepKey, live);
  // 本次发起作为 session 中的一条用户消息
  await appendSession(project.id, stepKey, {
    role: 'user',
    text: seedAnswers?.trim() || '直接生成本步骤产物',
  });
  const bus = getBus(project.id);
  bus.publish({ type: 'step_state', stepKey, state: 'running', runId });

  // 累计流式输出，供「提前完成」时落盘部分产物
  let streamedText = '';

  // 程序侧意图判断：用户消息是提问/咨询时走回答模式（不给写文件工具，不生成产物）
  const questionMode = !!seedAnswers && looksLikeQuestion(seedAnswers);

  // 运行前记录已有版本文件；运行期间轮询目标目录，检测 agent 用 Write 工具写入的新产物文件
  let knownFiles = new Set<string>();
  let agentArtifact: string | null = null;
  let pollTimer: ReturnType<typeof setInterval> | undefined = undefined;
  if (!questionMode) {
    knownFiles = new Set(
      (await listStepFiles(project.id, stepKey, def.outputKind)).map((f) => f.name),
    );
    pollTimer = setInterval(() => {
      void listNewArtifactFiles(project.id, stepKey, def.outputKind, knownFiles).then((fresh) => {
        if (fresh.length > 0) {
          agentArtifact = path.join(
            artifactLocation(project.id, stepKey, def.outputKind).dir,
            fresh[0],
          );
        }
      });
    }, 1500);
  }

  try {
    await setStepState(project.id, stepKey, 'running', { runId, startedAt: live.startedAt, error: undefined });
    const settings = await loadSettings();
    const systemPrompt = await resolveSystemPrompt(settings, stepKey, def.promptFile);
    const model = resolveModel(settings, stepKey);
    const override = settings.agentOverrides[stepKey];
    const blocks = questionMode ? [] : await buildContextBlocks(project, registry, def);
    // 修改/重新生成场景：注入本步骤当前版本产物作为修改基准（与访谈步骤的旧小结注入同理）
    if (!questionMode) {
      const selfBlock = await buildSelfBlock(project, def, stepKey);
      if (selfBlock) blocks.push(selfBlock);
    }
    const brief = questionMode
      ? await buildWorkspaceBrief(project, registry)
      : await buildWorkspaceBrief(project, registry, def);

    let prompt = questionMode
      ? `${systemPrompt}\n\n---\n\n${ANSWER_MODE_INSTRUCTION}\n\n---\n\n${brief}\n\n---\n\n## 用户的问题\n\n${seedAnswers!.trim()}`
      : `${systemPrompt}\n\n---\n\n${WORKSPACE_PREAMBLE}\n\n---\n\n${brief}\n\n---\n\n请现在开始工作。`;
    if (blocks.length > 0) prompt += formatContext(blocks);
    if (seedAnswers && !questionMode) prompt += `\n\n## 用户补充说明\n\n${seedAnswers}`;

    const result = await runQuery({
      settings,
      model,
      systemPrompt,
      prompt,
      abortController,
      maxTurns: questionMode ? 8 : workspaceMaxTurns(def, override),
      allowedTools: questionMode
        ? // 回答模式仍不给 Write/Edit：提问不应改动产物（此前的覆盖 bug）
          ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch']
        : workspaceToolSet(def, override),
      plugins: questionMode ? [] : mergedSkillPluginPaths(settings.agentSkillMounts[def.agentId], override?.skills),
      cwd: projectDir(project.id),
      handlers: {
        onDelta: (text) => {
          streamedText += text;
          bus.publish({ type: 'delta', stepKey, runId, text });
        },
        onThinking: (text) => bus.publish({ type: 'thinking', stepKey, runId, text }),
        onToolUse: (tool) => bus.publish({ type: 'tool_use', stepKey, runId, tool }),
        onRawMessage: (msg) => void appendRunLog(project.id, runId, msg),
      },
    });

    if (questionMode) {
      // 回答模式：回答进 session，状态回 done，产物保持不变
      await appendSession(project.id, stepKey, {
        role: 'assistant',
        text: result.finalText.trim() || '（模型未返回回答）',
      });
      await setStepState(project.id, stepKey, 'done', {
        runId,
        finishedAt: new Date().toISOString(),
        sessionId: result.sessionId,
        ...(project.steps[stepKey]?.artifactPath
          ? { artifactPath: project.steps[stepKey]!.artifactPath }
          : {}),
      });
      bus.publish({ type: 'step_done', stepKey, runId, artifactPath: stepKey });
      return;
    }

    // 后处理产物：优先采用 agent 写入的文件，其次回退到从回复文本提取
    // 收尾前再做一次同步检测，避免轮询间隔内（agent 刚写完即结束）漏检
    const finalFresh = await listNewArtifactFiles(project.id, stepKey, def.outputKind, knownFiles);
    if (finalFresh.length > 0) {
      agentArtifact = path.join(artifactLocation(project.id, stepKey, def.outputKind).dir, finalFresh[0]);
    }
    const finishedAt = new Date().toISOString();
    const finalText = result.finalText.trim();
    const priorArtifactPath = project.steps[stepKey]?.artifactPath;
    const artifactAbs = agentArtifact
      ? await normalizeArtifactName(project.id, stepKey, def.outputKind, agentArtifact)
      : null;
    const markedAnswer = finalText.startsWith(ANSWER_MARK);
    const answerText = markedAnswer ? finalText.slice(ANSWER_MARK.length).trim() : '';
    let html: string | null = null;
    if (def.outputKind === 'html' && !artifactAbs && !markedAnswer) {
      try {
        html = extractHtml(result.finalText);
      } catch {
        html = null;
      }
    }

    if (artifactAbs) {
      // A. agent 已用 Write 写入版本文件：直接采用，聊天回复保留一句说明
      const rel = relativeArtifactPath(artifactAbs, project.id);
      await appendSession(project.id, stepKey, {
        role: 'assistant',
        text:
          finalText && !markedAnswer
            ? finalText
            : `✅ 产物已生成：${rel}（可在右侧产物文件面板中查看）`,
      });
      // assemble 步骤的产物同步进交付包（内容取 agent 写入的文件）
      if (def.deliverableFile) {
        const content = (await readArtifactAt(artifactAbs)) ?? '';
        await writeDeliverable(project.id, def.deliverableFile, content);
      }
      await setStepState(project.id, stepKey, 'done', {
        runId,
        finishedAt,
        artifactPath: rel,
        sessionId: result.sessionId,
      });
    } else if (markedAnswer && answerText) {
      // B. 问答标记：回答进 session，状态回到 done，产物保持不变
      await appendSession(project.id, stepKey, { role: 'assistant', text: answerText });
      await setStepState(project.id, stepKey, 'done', {
        runId,
        finishedAt,
        sessionId: result.sessionId,
        ...(priorArtifactPath ? { artifactPath: priorArtifactPath } : {}),
      });
    } else if (def.outputKind === 'html') {
      // C. html 兜底：从回复文本提取；无完整 HTML 且已有产物 → 当作问答保留
      if (html === null) {
        if (priorArtifactPath && finalText) {
          await appendSession(project.id, stepKey, { role: 'assistant', text: finalText });
          await setStepState(project.id, stepKey, 'done', {
            runId,
            finishedAt,
            artifactPath: priorArtifactPath,
            sessionId: result.sessionId,
          });
        } else {
          throw new Error('输出中未找到完整的 HTML 文档（<!DOCTYPE html> … </html>）');
        }
      } else {
        await appendSession(project.id, stepKey, {
          role: 'assistant',
          text: '✅ HTML 原型已生成，可在右侧产物文件面板中试玩预览。',
        });
        const abs = await writeStepArtifact(project.id, stepKey, html, 'html');
        await setStepState(project.id, stepKey, 'done', {
          runId,
          finishedAt,
          artifactPath: relativeArtifactPath(abs, project.id),
          sessionId: result.sessionId,
        });
      }
    } else if (def.outputKind === 'csv') {
      // D-csv：csv 步骤不允许正文兜底（会把说明文字写进 csv 文件），必须让 agent 写文件
      throw new Error('未在产物目录中找到本次写出的 CSV/说明文件，请按「产物写入要求」用 Write 工具写入后重试');
    } else {
      // D. markdown 兜底：agent 没有写文件（或检测竞态），把回复正文落盘为版本文件
      const text = finalText || '（模型未返回正文内容）';
      const abs = await writeStepArtifact(project.id, stepKey, text, 'markdown');
      await appendSession(project.id, stepKey, {
        role: 'assistant',
        text: finalText || '✅ 产物已生成（可在右侧产物文件面板中查看）',
      });
      // assemble 步骤的产物同步进交付包
      if (def.deliverableFile) {
        await writeDeliverable(project.id, def.deliverableFile, text);
      }
      await setStepState(project.id, stepKey, 'done', {
        runId,
        finishedAt,
        artifactPath: relativeArtifactPath(abs, project.id),
        sessionId: result.sessionId,
      });
    }
    bus.publish({
      type: 'step_done',
      stepKey,
      runId,
      artifactPath: stepKey,
    });
  } catch (err) {
    const error = mapError(err);
    if (error.code === 'aborted') {
      // 终止：已流出的部分内容落盘为产物（版本化），状态置 canceled，等用户「完成」确认
      const finishedAt = new Date().toISOString();
      if (questionMode) {
        // 回答模式没有产物可言，终止只保留对话内容
        if (streamedText.trim()) {
          await appendSession(project.id, stepKey, { role: 'assistant', text: `⛔ 已终止：\n\n${streamedText}` });
        }
        await setStepState(project.id, stepKey, 'canceled', { runId, finishedAt });
      } else if (streamedText.trim()) {
        // html 输出终止时可能还没有完整 HTML（如问答回答/思考被截断），提取失败则只作为对话内容保留
        let partialHtml: string | null = null;
        if (def.outputKind === 'html') {
          try {
            partialHtml = extractHtml(streamedText);
          } catch {
            partialHtml = null;
          }
        }
        await appendSession(project.id, stepKey, {
          role: 'assistant',
          text:
            def.outputKind === 'html' && partialHtml === null
              ? `⛔ 已终止，本次内容未形成完整产物，仅保留如下：\n\n${streamedText}`
              : def.outputKind === 'html'
                ? '⛔ 已终止，本次已生成的部分内容保存为产物文件，可点「完成」确认或重新发起。'
                : streamedText,
        });
        if (def.outputKind === 'html' && partialHtml !== null) {
          const abs = await writeStepArtifact(project.id, stepKey, partialHtml, 'html');
          await setStepState(project.id, stepKey, 'canceled', {
            runId,
            finishedAt,
            artifactPath: relativeArtifactPath(abs, project.id),
          });
        } else if (def.outputKind !== 'html') {
          const abs = await writeStepArtifact(project.id, stepKey, streamedText, 'markdown');
          if (def.deliverableFile) {
            await writeDeliverable(project.id, def.deliverableFile, streamedText);
          }
          await setStepState(project.id, stepKey, 'canceled', {
            runId,
            finishedAt,
            artifactPath: relativeArtifactPath(abs, project.id),
          });
        } else {
          // html 但终止时没有完整 HTML：内容已进 session，产物保持不变
          await setStepState(project.id, stepKey, 'canceled', { runId, finishedAt });
        }
      } else {
        await setStepState(project.id, stepKey, 'canceled', { runId, finishedAt });
      }
    } else {
      // 出错兜底：agent 可能已把产物写入文件（如 max_turns 截断在最后一句说明之前），
      // 检测到新版本文件则直接采纳为完成，否则按错误处理（回答模式无产物，直接按错误处理）
      const fresh = questionMode
        ? []
        : await listNewArtifactFiles(project.id, stepKey, def.outputKind, knownFiles);
      if (fresh.length > 0) {
        const abs = await normalizeArtifactName(
          project.id,
          stepKey,
          def.outputKind,
          path.join(artifactLocation(project.id, stepKey, def.outputKind).dir, fresh[0]),
        );
        const rel = relativeArtifactPath(abs, project.id);
        await appendSession(project.id, stepKey, {
          role: 'assistant',
          text: `✅ 产物已生成：${rel}（可在右侧产物文件面板中查看；本次运行因 ${error.message} 提前结束）`,
        });
        if (def.deliverableFile) {
          const content = (await readArtifactAt(abs)) ?? '';
          await writeDeliverable(project.id, def.deliverableFile, content);
        }
        await setStepState(project.id, stepKey, 'done', {
          runId,
          finishedAt: new Date().toISOString(),
          artifactPath: rel,
        });
      } else {
        await setStepState(project.id, stepKey, 'error', {
          runId,
          finishedAt: new Date().toISOString(),
          error,
        });
        publishStepError(project.id, stepKey, runId, error.code, error.message);
      }
    }
  } finally {
    clearInterval(pollTimer);
    runs.delete(stepKey);
    release();
  }
}

// ---------------------------------------------------------------------------
// Conversational step（guide）
// ---------------------------------------------------------------------------

/** 上下文块截断（与 contextBuilder 单块上限一致） */
function truncateForContext(text: string, limit = 12_000): string {
  return text.length <= limit ? text : text.slice(0, limit) + `\n…（已截断，原文 ${text.length} 字符）`;
}

export async function runConversationalStep(
  project: Project,
  registry: AgentDef[],
  def: StepDef,
  seedAnswers?: string,
): Promise<{ runId: string; queued: boolean }> {
  const stepKey = def.agentId + ':' + def.stepId;
  if (getLiveRun(stepKey)) throw new HttpConflict('该 step 正在运行中');

  const runId = newRunId();
  const queued = runSemaphore.active >= runSemaphore.limit;
  void executeConversational(project, registry, def, stepKey, runId, seedAnswers);
  return { runId, queued };
}

async function executeConversational(
  project: Project,
  registry: AgentDef[],
  def: StepDef,
  stepKey: string,
  runId: string,
  seedAnswers?: string,
): Promise<void> {
  const release = await runSemaphore.acquire();
  const abortController = new AbortController();
  const queue = new InputQueue();
  const live: GuideLiveRun = {
    runId,
    stepKey,
    abortController,
    startedAt: new Date().toISOString(),
    queue,
    turns: [],
  };
  guideSessions.set(stepKey, live);
  // 新一轮访谈：重置该 step 的 session（预填内容作为首条用户消息）
  await writeSession(project.id, stepKey, seedAnswers ? [{ role: 'user', text: seedAnswers }] : []);
  const bus = getBus(project.id);
  bus.publish({ type: 'step_state', stepKey, state: 'running', runId });

  let completed = false;

  try {
    await setStepState(project.id, stepKey, 'running', { runId, startedAt: live.startedAt, error: undefined });
    const settings = await loadSettings();
    const systemPrompt = await resolveSystemPrompt(settings, stepKey, def.promptFile);
    const model = resolveModel(settings, stepKey);
    const override = settings.agentOverrides[stepKey];

    // 首条用户消息：项目想法 + 工作区简报（访谈版约定，不注入产物写入要求）+ 上游产物上下文 + 收集主题 + 用户预填内容
    let firstMessage = `## 项目\n\n- 名称：${project.name}\n- 一句话想法：${project.idea}`;
    const brief = await buildWorkspaceBrief(project, registry);
    firstMessage += `\n\n${WORKSPACE_PREAMBLE_CONVERSATIONAL}\n\n---\n\n${brief}`;
    const contextBlocks = await buildContextBlocks(project, registry, {
      ...def,
      dependsOn: def.contextDeps ?? def.dependsOn,
    });
    // 修改/重开访谈场景：带上本步骤此前的访谈小结，避免已确认信息在重开时丢失
    const prevFile = await latestArtifactFile(project.id, stepKey, def.outputKind);
    if (prevFile) {
      const prev = (await readArtifactAt(prevFile)) ?? '';
      if (prev.trim()) {
        contextBlocks.push({
          label: `本步骤此前的访谈小结（用户本次要求重新访谈/修改，供参考，以本轮对话为准）`,
          content: truncateForContext(prev),
        });
      }
    }
    firstMessage += formatContext(contextBlocks);
    // 主题绑定：明确告知模型只负责本步骤，防止其根据文件清单自行"推进"到下一个未完成步骤
    firstMessage += `\n\n## 本次访谈主题（你唯一的任务）\n\n**${def.title}**（${def.agentId}:${def.stepId}）。\n\n- 本次会话只围绕这个主题提问与收集，**不要替其他步骤执行任务或提问**——即使它们尚未完成、即使用户顺带提及相关内容，也只记录并说明稍后在对应步骤处理。\n- 工作区清单里显示其他步骤「尚未生成」或本步骤「done」，都与你无关：本步骤被重新发起，就只做本主题的事。\n- 用户消息是询问/咨询时按工作区约定的 \`[Q&A]\` 方式回答，不要切换访谈主题。\n\n请开始第一个问题。`;
    if (seedAnswers) firstMessage += `\n\n## 我预先说明\n\n${seedAnswers}`;
    queue.push(firstMessage);

    const result = await runQuery({
      settings,
      model,
      systemPrompt,
      prompt: queue,
      abortController,
      maxTurns: workspaceMaxTurns(def, override),
      allowedTools: workspaceToolSet(def, override),
      plugins: mergedSkillPluginPaths(settings.agentSkillMounts[def.agentId], override?.skills),
      cwd: projectDir(project.id),
      handlers: {
        onDelta: (text) => bus.publish({ type: 'delta', stepKey, runId, text }),
        onThinking: (text) => bus.publish({ type: 'thinking', stepKey, runId, text }),
        onToolUse: (tool) => bus.publish({ type: 'tool_use', stepKey, runId, tool }),
        onAssistantTurn: (turnText, sessionId) => {
          live.turns.push({ role: 'assistant', text: turnText });
          live.sessionId = sessionId;
          void appendSession(project.id, stepKey, { role: 'assistant', text: turnText });
          if (turnText.includes(FIELD_SENTINEL)) {
            // 哨兵出现：本 step 收集完成
            completed = true;
            void finishGuide(project, def, stepKey, runId, live, sessionId);
          } else {
            // 进入等待用户回答
            void setStepState(project.id, stepKey, 'waiting_input', { runId, sessionId }).then(
              () => {
                bus.publish({ type: 'guide_turn', stepKey, runId, question: turnText });
              },
            );
          }
        },
        onRawMessage: (msg) => void appendRunLog(project.id, runId, msg),
      },
    });

    // 队列 end() 后才会到达这里：哨兵流程已由回调完成
    if (!completed) {
      if (live.turns.length > 0) {
        // 会话自然结束但未出现哨兵：把已有轮次落盘
        await finishGuide(project, def, stepKey, runId, live, result.sessionId);
      } else {
        throw new QueryRunError('provider', '对话会话未产生任何回复');
      }
    }
  } catch (err) {
    const error = mapError(err);
    if (error.code === 'aborted') {
      // 终止：状态置 canceled，问答保留在 session 中，等用户「完成」确认
      if (!completed) {
        await setStepState(project.id, stepKey, 'canceled', {
          runId,
          finishedAt: new Date().toISOString(),
          sessionId: live.sessionId,
        });
      }
    } else {
      await setStepState(project.id, stepKey, 'error', {
        runId,
        finishedAt: new Date().toISOString(),
        error,
      });
      publishStepError(project.id, stepKey, runId, error.code, error.message);
    }
  } finally {
    guideSessions.delete(stepKey);
    release();
  }
}

/** 写访谈产物并结束会话 */
async function finishGuide(
  project: Project,
  def: StepDef,
  stepKey: string,
  runId: string,
  live: GuideLiveRun,
  sessionId: string,
): Promise<void> {
  await finishGuideFromTurns(project.id, def.title, stepKey, runId, live.turns, sessionId);
  live.queue.end();
}

/** 把访谈轮次落盘为产物并标记完成（live 会话与 session 持久化轮次共用） */
async function finishGuideFromTurns(
  projectId: string,
  title: string,
  stepKey: string,
  runId: string,
  turns: GuideTurn[],
  sessionId: string,
): Promise<void> {
  const lastTurn = turns[turns.length - 1];
  // 仅当最后一轮出现哨兵（模型给出总结）时才把该轮视为总结；提前完成时最后一轮是提问，整段作为 Q&A 落盘
  const finalSummary =
    lastTurn?.text.includes(FIELD_SENTINEL) === true
      ? lastTurn.text.replace(FIELD_SENTINEL, '').trim()
      : '';
  const qaTurns = finalSummary ? turns.slice(0, -1) : turns;
  const markdown = guideTranscriptToMarkdown(title, qaTurns, finalSummary);
  const abs = await writeStepArtifact(projectId, stepKey, markdown, 'markdown');
  const finishedAt = new Date().toISOString();
  await setStepState(projectId, stepKey, 'done', {
    runId,
    finishedAt,
    artifactPath: relativeArtifactPath(abs, projectId),
    sessionId,
  });
  getBus(projectId).publish({ type: 'step_done', stepKey, runId, artifactPath: stepKey });
}

/** 用户回答：向存活的会话投递消息 */
export async function answerGuide(
  projectId: string,
  stepKey: string,
  text: string,
): Promise<void> {
  const live = guideSessions.get(stepKey);
  if (!live) throw new HttpConflict('该 step 当前没有进行中的对话');
  if (live.abortController.signal.aborted) throw new HttpConflict('会话已中止');
  live.turns.push({ role: 'user', text });
  void appendSession(projectId, stepKey, { role: 'user', text });
  getBus(projectId).publish({ type: 'step_state', stepKey, state: 'running', runId: live.runId });
  await setStepState(projectId, stepKey, 'running', { runId: live.runId });
  live.queue.push(text);
}

export class HttpConflict extends Error {
  constructor(message: string) {
    super(message);
  }
}
