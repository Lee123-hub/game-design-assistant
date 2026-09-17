/**
 * 文本清洗工具。
 *
 * 背景：访谈类步骤中，模型偶尔会「顺手」把用户的回答也写出来
 * （如「开发者答：选 A」），等于替用户做了决定，污染需求口径。
 * 提示词与 system prompt 已加约束，这里是最后一道兜底。
 */

/**
 * 只匹配「明确指向用户角色」的代答行：
 * 「开发者答：」「用户回复：」「你可能想说：」……
 * 刻意不匹配单独的「答：」「回答：」——那通常是模型自己的正常表述，误删会毁掉回复。
 */
const SELF_ANSWER_LINE =
  /^[ \t>*\-]*[【（(]?\s*(?:开发者|用户|玩家|你)\s*[】)）]?\s*(?:的)?\s*(?:回答|答复|回复|答|可能想说|大概是想说|可能会说)\s*[:：].*$/gim;

/** 匹配引用块形式的用户侧文本，如 `> 开发者：选 A` */
const SELF_ANSWER_QUOTE = /^[ \t]*>[ \t]*(?:开发者|用户)[:：].*$/gim;

/** 去掉模型代用户作答的段落 */
export function stripSelfAnswer(text: string): string {
  if (!text) return text;
  return text
    .replace(SELF_ANSWER_QUOTE, '')
    .replace(SELF_ANSWER_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
