# 03-agent-prompt.md — agentPrompt 语法规范

## 一、语义

**agentPrompt** 是 backend → agent **单向**的协议指令 (不是自由文本, 不是展示文案):

1. 用户点 button, 前端发 `component-action` 给 backend
2. backend handler 处理完 state / Excel 后返回 `{userMessage, agentPrompt}`
3. 前端**把 `agentPrompt` 当作 user message** 塞给 agent (让 agent 机读)
4. agent 看到 `[TRIGGER:NAME ...]` → 按 project 自己维护的触发词章节, 决定下一步动作 (通常是重渲组件, 输出 conclusion 契约)
5. 前端渲新 HTML

因此 agentPrompt 只能是两种形式:
- `""` 空字符串 — 无 agent 介入的 action, 显式声明 (不能省略字段)
- `[TRIGGER:NAME k=v ...]` — 严格 TRIGGER 语法

agent **不能反向自创 TRIGGER** (方向为 backend → agent 单向).

## 二、语法 (build-skill 只校验这里)

严格形式:

```
[TRIGGER:NAME k1=v1 k2=v2 ...]
```

- `[` `TRIGGER` `:` `NAME` … `]` **必须完整闭合**
- **NAME**: 大写字母 + 下划线 (`^[A-Z_]+$`), 例 `DO_SOMETHING` / `REFRESH_X` / `GO_BACK`
- **冒号后**紧跟 NAME, **不能有空格** (`[TRIGGER: NAME` 是错)
- **参数**全部在 `]` 内, `k=v` 空格分隔, 无引号
- **单行**, 不允许换行符
- `]` 后**不能再有内容** (中文说明 / shell / 任何 tail) — agent runtime 会忽略, 但视为**脏配置**, warn 提示清理

## 三、建议 (project 自己维护)

**具体 TRIGGER 集合 (哪些 NAME 合法 / 各自语义 / 参数) 由每个 project 自己维护**, build-skill 不假设也不判黑白:

- project 的 `CLAUDE.md` 应有"触发词"章节, 列出本 project 支持的全部 TRIGGER + 语义 + 参数表
- project 的 agent 按该章节解析
- 新增 TRIGGER 时改 project CLAUDE.md + backend handler + agent 认知, build-skill 无需改动

## 四、build-skill 校验规则

由 `scripts/check_agent_prompt.py` 自动化, 只做**语法层**:

- agentPrompt 字段是 `""` 或**纯 TRIGGER 语法** → OK
- 缺闭合 `]` → **fail**
- 冒号后有空格 → **warn**
- `]` 后有 tail (中文 / shell / 任何字符) → **warn** "被 agent 忽略, 建议清理"
- 既不是空串也不是 `[TRIGGER:...]` 形式 → **fail**
- 前缀是 `[TRIGGER:` 但整体不匹配严格正则 (NAME 含小写 / 数字 / 其他字符) → **fail**

**不做**的校验 (以下**不属于** build-skill 责任):
- TRIGGER NAME 是否在某个"合法集合"里 → 由 project 自己知道
- 参数 `k=v` 的 key / value 是否合法 → 由 project handler / agent 判
- 与 backend Lion config / agent CLAUDE.md 的语义一致性 → 跨仓契约, project 自查

## 五、反例 (抽象命名, 只演示语法问题)

| 反例 agentPrompt | 问题 | 校验结果 |
|---|---|---|
| `"[TRIGGER:DO_SOMETHING to=stage-a] 请渲染下一步"` | TRIGGER 后跟中文说明, tail 混排 | **warn** (删掉中文尾巴) |
| `"[TRIGGER:DO_SOMETHING to=stage-a] python3 xxx.py"` | TRIGGER 后跟 shell, tail 混排 | **warn** (删掉 shell) |
| `"[TRIGGER: DO_SOMETHING to=stage-a]"` | 冒号后有空格 | **warn** (去空格) |
| `"[TRIGGER:DO_SOMETHING to=stage-a"` | 缺闭合 `]` | **fail** (补 `]`) |
| `"[TRIGGER:do_something]"` | NAME 含小写 | **fail** (NAME 必须大写) |
| `"渲染下一步"` | 纯自然语言, 无 TRIGGER | **fail** (改 `[TRIGGER:...]` 或 `""`) |
| `"[TRIGGER:REFRESH_X]\n继续"` | 含换行 | **fail** (单行) |

## 六、正例 (抽象命名)

```json
{
  "agentPrompt": ""
}
```

```json
{
  "agentPrompt": "[TRIGGER:DO_SOMETHING to=stage-a]"
}
```

```json
{
  "agentPrompt": "[TRIGGER:REFRESH_X component=some-card]"
}
```

```json
{
  "agentPrompt": "[TRIGGER:GO_BACK to=stage-a]"
}
```

具体 project 里用哪些 NAME (是 `RENDER_NEXT_STAGE` 还是 `GOTO_STAGE`?), 参数叫 `to` 还是 `stage`, 全部由 project 自己定. build-skill 不看这些, 只看语法.
