# 项目级说明

本仓库是一个**纯技能集合**（skills collection），不含运行时代码。

## 仓库性质

- `skills/<name>/SKILL.md` 是唯一的定义文件，YAML frontmatter 里的 `name` **必须**与所在目录名一致。
- 每个技能目录是独立的包，拷走即可用，不要跨目录引用（`references/` 内可以互相引用）。
- 详细方法论放 `references/`，SKILL.md 保持精简 —— Agent 按需读取 references，避免全部文档占用常驻上下文。

## 修改技能时的规矩

1. **改 `name` 就要改目录名**，反之亦然。
2. 通用约束（不代答、数字自洽、口径冲突显式指出、不虚构外部事实）已提炼在 `skills/game-design-workflow/SKILL.md` 的「通用铁律」。**阶段技能里不要重复抄写**，需要时引用即可。
3. 阶段划分按**游戏设计模块**，不按 prompt 文件一对一映射。一个模块内相关的内容合并进同一技能的 references。
4. 改动后同步更新 `README.md` 的技能总览表。

## 产物落盘约定

技能执行时把产物写到 `specs/<project-name>/`（已在 .gitignore 中），结构：

```
01-concept/  02-prototype/  03-design/  04-ui/  05-data/  06-review/
```

聊天回复只写一句话完成说明，不要把大段文档或代码贴进对话。

## 禁用 Work Records

**本项目不维护 `.work-records/` 工作记录。** 此规则覆盖全局 CLAUDE.md 中的 Work Records 铁律：

- 每完成 query 后**不要**创建或更新 `.work-records/`
- 不要初始化、注册或提醒 work-records 相关流程
- 相关任务跟踪改为使用本 session 的 Task 工具即可

除上述覆盖外，其余遵循全局 CLAUDE.md。
