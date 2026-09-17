/**
 * 用户意图判断：一条消息更像「提问/咨询」还是「生成/修改指令」。
 *
 * 放在 shared 包是为了前后端共用同一套判定：
 * - 服务端：generative 步骤判定为提问时走回答模式（不给写文件工具，避免误覆盖产物）
 * - 前端：判定为「生成/修改」且本步已有产物时，先弹确认再重跑（防止误触重跑）
 */

const QUESTION_PATTERNS =
  /[？?]|什么|哪些|哪个|怎么|怎样|为什么|如何|能不能|可不可以|有没有|是不是|看看|看一下|查看|列出|介绍|说明一下/;
const TASK_PATTERNS =
  /重新生成|重写|重新做|修改|调整|优化|加上|添加|加入|删掉|删除|去掉|改成|换成|扩写|简化|做一版|生成|制作/;

export function looksLikeQuestion(text: string): boolean {
  const s = (text ?? '').trim();
  if (!s || s.length > 300) return false;
  if (TASK_PATTERNS.test(s)) return false;
  return QUESTION_PATTERNS.test(s);
}
