# 经典 Roguelike / Roguelite 架构研究与肉鸽设计方法论

> 版本：2026-09-07
> 研究对象：Hades、Dead Cells、Vampire Survivors、Vampire Crawlers、Dicey Dungeons、Balatro、Slay the Spire、Spelunky 2、Risk of Rain 2、Enter the Gungeon
> 研究目的：不是总结“这些游戏有什么”，而是回答——**我作为设计师，构思一个点之后，这个点应该满足什么功能，怎样把它接入肉鸽架构，最后形成一款有趣且可重玩的游戏？**

---

## 0. 先给结论：好肉鸽不是“堆随机内容”，而是一台“决策生成器”

肉鸽真正的产品不是“随机地图 / 随机装备 / 随机掉落”，而是：

> **让玩家在不完全信息下持续做有意义的选择，并让每次选择改变下一次选择的价值。**

优秀肉鸽通常同时拥有 5 层结构：

```text
                    ┌──────────────┐
                    │   核心动作     │  ← 玩家每秒/每分钟在做什么
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   构筑系统     │  ← 这次跑法变成什么样
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   路线/资源    │  ← 选择去哪、拿什么、赌什么
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   威胁/节奏    │  ← 为什么现在必须做决定
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │   死亡/反馈    │  ← 这次失败带来什么信息/成长
                    └──────┬───────┘
                           ↓
                    下一局的选择空间改变
```

这五层里，**随机性只是“内容发生器”**。它必须服务于决策，而不能代替决策。

Hades 的官方定义直接把它概括为：每次运行中，玩家组合不同神祇的祝福、面对不同挑战，并把死亡后的知识继续带入下一局；Supergiant 还明确将设计口号定为“every run counts”，通过永久成长和叙事避免死亡变成“清零”。[Hades FAQ](https://www.supergiantgames.com/blog/hades-faq/)；[Supergiant 访谈](https://www.tomsguide.com/features/hades-exclusive-interview)

---

# 1. 10 款样本：它们分别贡献了什么“架构原件”

| 游戏 | 核心玩法层 | 随机层 | 构筑层 | 主要乐趣 | 最值得借鉴的架构 |
|---|---|---|---|---|---|
| **Hades** | 高速动作 + 房间战斗 | 房间、奖励、神祇、事件 | 武器 + Boon + Hammer + Keepsake | 战斗手感 + 构筑 + 叙事回馈 | **每一局都推进：失败不等于浪费** |
| **Dead Cells** | 2D 动作 / RogueVania | 地图、房间、武器掉落 | 武器、技能、变异、路线 | 操作熟练度 + 高压战斗 | **熟练度本身就是元成长** |
| **Vampire Survivors** | 自动攻击 + 走位 + 生存 | 升级池、怪物、宝箱 | 武器 + 被动 + Evolutions + Arcana | 指数式滚雪球 + 数值爆炸 | **把操作预算换成“构筑与定位预算”** |
| **Vampire Crawlers** | TurboTurn 卡牌 + 地牢探索 | 卡牌、宝石、掉落、探索 | 卡组、进化、Combo 链 | 高速规划 + 连锁结算 | **把“爽”重新编码成顺序/连锁** |
| **Dicey Dungeons** | 回合制 + 骰子分配 | 骰点 | 装备槽位 + 职业规则 | 在随机数字中寻找最优解 | **控制随机源数量，保留可规划结构** |
| **Balatro** | 手牌选择 / Poker scoring | 抽牌、商店、盲注、掉落 | Joker + 卡牌强化 + Voucher + Planet | “我这套牌已经坏掉了”的组合快感 | **让一个简单规则产生超多组合空间** |
| **Slay the Spire** | 回合制卡牌战斗 | 地图、敌人、奖励、事件 | 卡组 + Relic + Potion | 期望值管理 + 路线博弈 | **宏观路线决策与微观战斗决策闭环** |
| **Spelunky 2** | 平台动作 + 物理互动 | 地形、敌人、道具、事件 | 低元成长，更多靠玩家知识 | 涌现、意外故事、极高重玩 | **让规则彼此互相作用，而不是只做内容掉落** |
| **Risk of Rain 2** | 第三人称动作 + 清场 | 敌人、物品、地图位置 | 物品堆叠 + Survivor | 指数成长 + 时间压迫 | **“变强”本身成为时间成本** |
| **Enter the Gungeon** | Bullet Hell + 射击 | 房间、敌人、枪械、宝箱 | 枪械 + 被动 + Synergy | 纯粹操作 + 道具组合 | **让弱道具也能通过协同变得有意义** |

样本选择原则是“经典性 + 结构覆盖”：动作肉鸽、卡牌肉鸽、生存肉鸽、系统肉鸽、资源管理肉鸽、物理涌现肉鸽分别各取代表，而不是只收集十款同模板作品。

---

# 2. 逐款拆解：一款好肉鸽到底“哪里好”

## 2.1 Hades：把“死亡”从损失改造成内容推进器

### 架构

```text
武器选择
   ↓
房间选择 → Boon / Hammer / 钱 / 商店 / 事件
   ↓
战斗技能表达
   ↓
构筑形成
   ↓
Boss / 失败
   ↓
回到 House
   ├─ 永久成长（Mirror）
   ├─ 装备/收藏/Meta
   └─ 对话/关系/叙事
```

Hades 的关键不是“有很多内容”，而是它把**run 内成长、玩家知识、角色成长、叙事推进**串在同一条死亡循环上。官方 FAQ 说明其核心体验是：每次运行都会组合不同的神祇力量、面对不同挑战，并持续展开故事；Supergiant 进一步明确“every run counts”，希望死亡不产生“game over”的感觉，而是由永久成长和叙事共同消化死亡带来的挫败。[官方 FAQ](https://www.supergiantgames.com/blog/hades-faq/)；[Supergiant 访谈](https://www.tomsguide.com/features/hades-exclusive-interview)

### 值得抄的不是 Boon，而是功能设计

**设计点：死亡后人物主动对你说话。**

满足功能：

- 降低死亡的负面情绪；
- 让失败马上产生新内容；
- 把“重复”重新包装成世界状态更新；
- 让叙事天然与 Roguelite 结构绑定。

**设计点：Mirror of Night / Keepsake / Pact of Punishment。**

满足功能：

- Mirror：长期成长；
- Keepsake：run 前方向选择；
- Pact：玩家主动提高风险，提供后期重复价值。

官方更新记录能看到这几套系统被持续调整：Mirror、Keepsakes 与 Pact 被当作独立的长期结构维护。[Supergiant 更新记录](https://www.supergiantgames.com/blog/hades-welcome-to-hell-update-patch-notes/)

### 设计启示

> **如果你的游戏死亡后只有“重新开始”，那么死亡没有被设计成系统；它只是流程终点。**

---

## 2.2 Dead Cells：把“操作熟练度”直接变成成长系统

Dead Cells 官方自称 RogueVania：2D 动作平台 + 非线性探索 + 永久解锁，并强调“Kill, die, learn, repeat”。它同时拥有极强的即时战斗与永久解锁路径。[Dead Cells 官方](https://deadcells.com/)；[Motion Twin Press Kit](https://motiontwin.com/presskit/)

### 架构重点

```text
操作能力
  ├─ 走位
  ├─ 闪避
  ├─ 攻击时机
  └─ 敌人模式学习
          ↓
更高生存率
          ↓
更好的路线 / 更高难度
          ↓
更多可解锁内容
```

它的核心“元成长”不是简单给玩家 +20% HP，而是不断解锁**新路线和新表达方式**。官方明确强调 nonlinear progression：死后解锁新关卡，可以选择不同路径。[Dead Cells 官方](https://deadcells.com/)

其战斗也经历了从塔防式原型转向动作平台战斗的过程，开发团队后来明确发现原先设计“不够有趣”，于是改成完整 action platformer。[PC Gamer / Dead Cells development](https://www.pcgamer.com/dead-cells-combat-evolved-from-tower-defense-games-and-team-fortress-2/)

### 设计启示

> **肉鸽不一定要靠“数字成长”让玩家变强；让玩家解锁更多“可理解的可能性”同样是成长。**

这对低成本独立游戏尤其重要：

- 少做无穷 +1；
- 多做“新武器、新玩法、新路线、新敌人关系”。

---

## 2.3 Vampire Survivors：用低输入换高构筑密度

poncle 对 Vampire Survivors 的官方描述非常直接：这是“time survival game with minimalistic gameplay and roguelite elements”，玩家主要生存、捡经验与金钱，并把一局的钱转化为后续提升。[poncle 官方](https://poncle.games/vampire-survivors)

### 它最重要的设计决定

**把实时操作从“攻击”中拿掉。**

所以玩家的有限注意力被重新分配给：

- 去哪里吃经验；
- 哪个升级更值得；
- 哪些武器组合能形成进化；
- 什么时候冒险去宝箱/高价值资源；
- 什么时候只是活下来。

游戏中的武器和被动构成了最典型的“组合式升级”：满级武器 + 对应被动可产生进化，进一步改变武器形态与战斗函数。[Vampire Survivors Wiki – Weapons](https://vampire-survivors.fandom.com/wiki/Weapons)；[Passive Items](https://vampire-survivors.fandom.com/wiki/Passive_items)

### 设计启示

> **你不是必须让玩家同时操作很多东西；你也可以把“操作复杂度”转移为“构筑复杂度”。**

这样能获得一个极强的廉价爽点：

```text
简单移动
   ↓
自动输出
   ↓
数字迅速变大
   ↓
新武器 / 新进化
   ↓
更大范围清怪
   ↓
越来越像“失控机器”
```

这叫 **Power Curve Theater：让玩家看到自己的系统越来越像一台机器。**

---

## 2.4 Vampire Crawlers：把“滚雪球”改造成“顺序滚雪球”

Vampire Crawlers 是《Vampire Survivors》的首个官方衍生作。开发团队公开表示，他们希望把 Survivors 的“snowballing chaos”重新设计成 TurboTurn 卡牌驱动的 Roguelite。[官方发布公告](https://steamcommunity.com/app/3265700/announcements/)

其核心系统包括：

- TurboTurn：即时排队并高速结算的回合制；
- Combo：按 mana 递增播放，后续效果被乘算；
- Wild cards：允许延长连锁；
- Deckbuilding：卡牌、Power-up、Weapon Evolutions；
- Dungeon crawling：地牢探索、宝藏、互动点；
- 速度可以由玩家自行控制。[Vampire Crawlers 官方公告](https://steamcommunity.com/app/3265700/announcements/)

### 核心启示

同样是“数值爆炸”，Vampire Survivors 的表现方式是：

> **空间覆盖越来越大。**

Vampire Crawlers 则是：

> **因果链越来越长。**

因此，一个“爽”可以有多种编码方式：

- 空间爆炸；
- 时间缩短；
- 数值乘法；
- 连锁；
- 资源复利；
- 触发层层嵌套。

设计的时候不应该问“我要不要做乘法”，而要问：

> **我的游戏里，什么东西一旦越来越强，玩家能明显看见“规则机器开始自己跑起来”？**

---

## 2.5 Dicey Dungeons：随机不是问题，“随机叠随机”才是问题

Dicey Dungeons 的开发者 Terry Cavanagh 公开讲过：最初想把 deckbuilding 与骰子随机结合，但很快发现“随机卡牌 + 随机骰子”会让游戏过于混乱，于是选择了**静态装备布局**，让玩家在每次战斗之间调整确定性的结构。[GameDeveloper 访谈](https://www.gamedeveloper.com/business/road-to-the-igf-cavanagh-houston-dobbe-s-i-dicey-dungeons-i-)

### 这是一个非常重要的随机性公式

```text
坏随机：
随机选项 × 随机资源 × 随机结果
= 玩家不知道自己为什么输

好随机：
随机资源
  ↓
玩家仍然拥有结构化决策
  ↓
结果有多个可接受方案
  ↓
失败可以解释
```

Dicey Dungeons 甚至把“装备问题”当成设计核心：由于进入战斗时你只能使用当前装备，各角色必须采用不同方式解决这个约束。[GameDeveloper – Witch design](https://www.gamedeveloper.com/design/witch-craft-how-i-dicey-dungeons-balances-chance-and-predictability)

不同角色实际上是在**重写基础规则**：Warrior 可以重掷，Thief 偷敌方装备，Robot 使用 push-your-luck，Witch 则以法术书重新生成装备。[Terry Cavanagh Press Kit](https://terrycavanaghgames.com/dice/presskit/xbox/)

### 设计启示

> **一个新职业最有价值的地方，不是“初始数值不一样”，而是它解决了原系统的某一个结构性问题。**

---

## 2.6 Balatro：用极少的基础规则制造极大的“规则组合空间”

Balatro 官方定位是“poker roguelike”，核心卖点就是 Joker 带来的巨幅规则修改和组合爆炸。[Balatro 官方](https://www.playbalatro.com/)

LocalThunk 的访谈非常值得研究：早期版本主要是升级普通扑克牌，这个结构不够有趣；后来 Joker 作为“passive item”加入，才给系统引入了真正的跨牌规则层。[Rogueliker 访谈](https://rogueliker.com/balatro-interview/)

### Balatro 的结构非常像编译器

```text
基础语法：Poker Hand
       ↓
评分：Chips × Mult
       ↓
Joker 改写规则
       ↓
牌本身拥有增强 / edition / seal 等属性
       ↓
Tarot / Planet / Voucher 修改系统
       ↓
Boss Blind 改写当前约束
       ↓
玩家为了满足目标，被迫重构自己的牌组
```

### 为什么它特别容易让玩家上头？

因为它给玩家一个非常强的**“规则拥有感”**：

玩家不是“抽到了一个好武器”，而是：

> “我自己把这套规则变成了这样。”

LocalThunk 还提到其大量设计来自不断试错，看一个方向是否“interesting”；Joker 也经常从视觉概念与效果概念双向产生。[DayOne 访谈](https://playday.one/2024/03/09/there-is-a-lot-more-design-to-explore-within-balatro/)

### 设计启示

> **最好的构筑物不是增加一个按钮，而是修改一个已有规则。**

例如：

- “暴击 +10%” → 普通强化；
- “所有偶数点数都算作暴击触发条件” → 规则改写；
- “治疗时溢出的治疗量变成护盾” → 规则改写；
- “每次使用第三个技能后，第一技能免费” → 节奏改写。

后者更容易产生构筑身份。

---

## 2.7 Slay the Spire：真正的“肉鸽地图”是资源预算图

Mega Crit 对 Slay the Spire 的定义非常经典：把卡牌游戏和 Roguelike 融合，玩家构筑牌组、拿 Relic、面对程序生成关卡；原版包含 4 个核心角色、300+ cards、50+ combat encounters、100+ items。[Mega Crit Press Kit](https://www.megacrit.com/press-kits/slay-the-spire/)

### 其宏观结构

```text
                    当前战斗力
                        ↑
                        │
  Elite ← 资源高风险      │      商店 ← 资源交换
                        │
  ? ← 不确定性           │      宝箱 ← 构筑资本
                        │
  普通战斗 ← 稳定成长     │      休息点 ← 补血/升级
                        │
                       起点
```

所以地图实际上不是“去哪一格”，而是：

> **我愿意把多少生命值、多少金币、多少未来稳定性，换成多少当前成长？**

### 设计启示

一个好的地图节点至少应该改变其中一个预算：

- HP；
- 钱；
- 构筑稀有度；
- 信息；
- 风险；
- 路线选择；
- 最终 Boss 准备度。

如果一个地图节点只是“随机事件 + 一个按钮”，它通常不够深。

---

## 2.8 Spelunky 2：真正高复玩不是“随机内容多”，而是规则能互相作用

Mossmouth 对 Spelunky 2 的官方描述强调：随机化挑战、分支路线、陷阱、道具、NPC、载具、动态液体等，让世界成为可以反复实验的 playground；而不只是“通关一次”。[Mossmouth](https://www.mossmouth.com/spelunky2/)

Derek Yu 在开发访谈里还说明，他喜欢随机化的一点，是可以先创造规则，再观察规则之间会产生什么疯狂结果；这正是 Spelunky 的系统性乐趣来源。[GameDeveloper 访谈](https://www.gamedeveloper.com/game-platforms/interview-i-aquaria-i-s-derek-yu-on-indie-the-pit-of-death)

### 这类肉鸽依赖的不是 build，而是 systemic combinatorics

```text
敌人 × 地形 × 陷阱 × 道具 × 物理 × NPC
                ↓
        非预制的局部故事
```

所以玩家会产生：

> “这一次怎么会发生这个？”

而不是：

> “这一次又抽到了哪个道具？”

### 设计启示

你的内容最好既有“对象”，又有“关系”。

低成本生产中，**一个新对象如果能与 8 个旧对象发生新关系，价值远高于 8 个互不相干的新对象。**

---

## 2.9 Risk of Rain 2：用“时间”把贪婪行为变成风险

Risk of Rain 2 官方明确强调：玩家与敌人都会不断变强；大量物品叠加形成每局不同的 build。[Steam 官方页面](https://store.steampowered.com/app/632360/Risk_of_Rain_2/)

最值得借鉴的是 Hopoo 的自我设计说明：他们把玩家能影响结果的能力拆成 micro / macro 两层。团队认为早期版本的宏观 agency 不足，因此增加 Scrapper 等系统，让玩家可以主动放弃当前物品换未来更合适的构筑。[Hopoo Dev Thoughts](https://store.steampowered.com/news/posts/?appids=632360&enddate=1604419228&feed=steam_community_announcements)

与此同时，开发团队明确解释过：Risk of Rain 使用**手工地图 + 随机放置敌人/物品**，因为完全程序生成的 3D 地形很难在小团队里同时保证有趣和可记忆；收集更多物品会消耗时间，而时间又会提升难度，因此“搜刮”天然变成风险。[GameDeveloper / Hopoo 访谈](https://www.gamedeveloper.com/design/risk-of-rain-interview)

### 这是一个非常强的设计公式

```text
更多资源
   ↑
   │
花时间探索
   │
   ↓
敌人更强 / 风险更高
```

于是“贪婪”不需要一个按钮来表达：**系统自己会惩罚你。**

### 设计启示

设计资源系统时可以问：

> 玩家是不是可以通过“多花时间 / 多冒险 / 多操作”换更多成长？

只要答案是 yes，就会自然出现 push-your-luck。

---

## 2.10 Enter the Gungeon：让“坏掉的掉落”重新具有期待

Enter the Gungeon 是 bullet-hell dungeon crawler，以大量枪械、宝箱、商店、隐藏空间与 Synergy 构成丰富 run。[Steam 官方](https://store.steampowered.com/app/311690/Enter_the_Gungeon/)

非常值得借鉴的是 Synergy 的设计方向：开发资料显示，后续版本刻意让一些原本偏弱的枪械/道具获得更多协同，以提高“拿到废物”的兴奋度和修复同质化枪械的问题。[Official Wiki – Synergies](https://enterthegungeon.wiki.gg/wiki/Synergies)

### 这是肉鸽内容经济里一个极重要的问题

假设：

```text
100 个道具
其中只有 20 个好
```

玩家会记住的是：

> “剩下 80 个都是垃圾。”

如果变成：

```text
100 个道具
80 个有明确使用场景
60 个可以与其他系统形成组合
20 个可以直接改变 build
```

玩家才会形成：

> “这次拿到这个垃圾，说不定能救活我的构筑。”

### 设计启示

**弱道具不一定错误；没有未来价值的弱道具才错误。**

---

# 3. 十款游戏放在一起之后：肉鸽的真正架构

把十款游戏抽象之后，基本都能拆成下面 9 个层：

## Layer A：Core Verb —— 玩家最常做的动作

例如：

- Hades：攻击 / 闪避；
- Dead Cells：移动 / 攻击 / 滚；
- Vampire Survivors：移动；
- Dicey Dungeons：分配骰子；
- Balatro：打牌；
- StS：出牌；
- Spelunky：移动 / 搬运 / 使用物理；
- RoR2：移动 / 射击 / 搜刮；
- Gungeon：射击 / 闪避。

### 必须满足的功能

**核心动作要“本身就有反馈”。**

构筑再漂亮，如果 Core Verb 无聊，玩家仍然会觉得拖。

---

## Layer B：Run Goal —— 为什么这一局要继续

常见目标：

- 到终点；
- 杀 Boss；
- 活够时间；
- 达到分数；
- 逃离；
- 完成任务。

### 必须满足的功能

**把玩家从“收集”拉回“解决问题”。**

没有目标的构筑会退化成数值养成游戏。

---

## Layer C：Build —— 我这局到底在玩什么

构筑不是“拿到多少物品”，而是：

> **玩家的行为策略是否开始因为这些物品而发生改变。**

一个新道具至少应该满足下列之一：

1. 改变最优操作；
2. 改变资源优先级；
3. 改变路线；
4. 改变对敌方式；
5. 改变下一件物品的价值；
6. 形成新的组合方向。

否则它只是“+5%”。

---

## Layer D：Randomness —— 产生差异

随机至少有 6 种：

| 随机类型 | 示例 | 功能 |
|---|---|---|
| 内容随机 | 掉落什么 | 制造 run 差异 |
| 空间随机 | 房间/地图 | 改变路线 |
| 信息随机 | 不知道事件结果 | 制造风险 |
| 数值随机 | 骰子、暴击 | 制造波动 |
| 敌人随机 | 谁出现 | 改变战术 |
| 规则随机 | Boss modifier | 改写构筑 |

### 重要规则：不要让同一层叠太多随机

Dicey Dungeons 的案例尤其说明：当“选择什么”与“结果是什么”都高度随机时，策略很容易消失。[GameDeveloper](https://www.gamedeveloper.com/business/road-to-the-igf-cavanagh-houston-dobbe-s-i-dicey-dungeons-i-)

建议使用：

> **随机 + 可控修正 + 可解释反馈**

而不是：

> **随机 + 随机 + 随机**

---

## Layer E：Economy —— 玩家为什么不能全拿

每一种资源都应该成为“机会成本”：

```text
金币 → 商店 / 重抽 / 升级
HP   → 治疗 / 生命换资源
时间 → 搜刮 / 难度
卡位 → 构筑纯度
装备槽 → 选择与放弃
路线 → 当前收益 / 未来安全
```

**如果一项资源不会迫使玩家放弃另一件事，它通常不是“经济资源”，只是积分。**

---

## Layer F：Tension —— 为什么决定不能拖到以后再做

肉鸽需要压力。

压力来源可以是：

- 时间；
- 生命；
- 越来越强的敌人；
- 有限 reroll；
- 有限卡槽；
- Boss 检查点；
- 永久死亡；
- 稀缺机会。

Risk of Rain 2 的时间-难度耦合、Hades 的 Pact、Slay the Spire 的路线风险都是在做同一件事：**把选择变成带代价的选择。**

---

## Layer G：Meta —— 为什么“再开一局”是合理的

元成长可以有四类：

1. **Power Meta**：直接变强；
2. **Content Meta**：解锁新内容；
3. **Knowledge Meta**：玩家学会规则；
4. **Expression Meta**：更多玩法分支。

高质量肉鸽最好不是只有第 1 类。

Dead Cells、Spelunky 的“知识成长”尤其重要；Hades 则把 Power / Content / Narrative 结合起来。[Dead Cells 官方](https://deadcells.com/)；[Hades 官方 FAQ](https://www.supergiantgames.com/blog/hades-faq/)

---

## Layer H：Failure —— 为什么输了反而想开下一局

死亡至少要产生一种“获得”：

```text
失败
 ├─ 我知道了什么
 ├─ 我解锁了什么
 ├─ 我发现了什么
 ├─ 我离目标更近了多少
 └─ 我下一局会换什么策略
```

如果答案只有：

> “没关系，我金币多了。”

那么你的元成长可能在替你遮掩 run 本身的无聊。

---

## Layer I：Pacing —— 什么时候给决定，什么时候给爽

优秀肉鸽不是持续高密度决策。

理想节奏通常是：

```text
压力
 ↓
行动
 ↓
短暂放松
 ↓
奖励
 ↓
构筑决定
 ↓
新威胁
 ↓
高潮
 ↓
Boss / 失败
```

把全部时间塞满“选择”，玩家会累；全部时间塞满“爽”，玩家会失去参与感。

---

# 4. 最重要的设计框架：每一个“点子”都必须回答“它满足什么功能”

以后构思一个新点子，严禁只写：

> “我想做一个会吸血的武器。”

必须改写成：

> “我想解决 **资源压力不足**，所以设计一个会吸血的武器，让玩家在**攻击风险**与**恢复能力**之间建立循环。”

推荐使用下面这个六段式模板。

## 点子 → 功能 → 行为 → 选择 → 风险 → 回馈

```text
【点子】
我构思了一个 ______。

        ↓

【功能】
它要解决/强化 ______。

        ↓

【玩家行为】
为了利用它，玩家需要 ______。

        ↓

【选择】
玩家因此必须在 A / B 之间选择 ______。

        ↓

【风险】
如果贪这个收益，会暴露在 ______。

        ↓

【反馈】
成功时玩家能明显感觉到 ______。
```

### 示例 1：吸血武器

**点子**：攻击敌人恢复生命。

**功能**：增加资源恢复能力，减少补血节点的绝对必要性。

**玩家行为**：为了回血必须主动贴近敌人。

**选择**：远程安全输出 vs 近战高风险回血。

**风险**：高压 Boss 下近身可能死亡。

**反馈**：连续命中后血条快速回升，让玩家形成“越打越稳”的正反馈。

**最终形成的不是一个数值，而是一个玩法身份：**

> “我要靠侵略性维持生存。”

---

# 5. 构思肉鸽内容时，优先考虑“功能槽位”

下面是一张可直接用于立项的“功能菜单”。

| 你设计的点 | 它最好负责的功能 | 常见实现 |
|---|---|---|
| 新武器 | 改变核心动作 | Hades / Dead Cells |
| 新被动 | 放大某类行为 | Vampire Survivors / RoR2 |
| 新 Joker | 改写规则 | Balatro |
| 新职业 | 重写一个系统约束 | Dicey Dungeons |
| 新地图节点 | 改变资源预算 | StS |
| 新敌人 | 检查某类 build | StS / Dead Cells |
| 新 Boss | 反制过度泛化构筑 | Hades / StS |
| 新事件 | 注入信息不确定性 | Hades / FTL |
| 新资源 | 创造机会成本 | Hades / FTL / RoR2 |
| 新危险 | 提高贪婪代价 | RoR2 / Spelunky |
| 新交互规则 | 增加涌现 | Spelunky |
| 新协同关系 | 提高坏掉道具价值 | Gungeon / Balatro |
| 新 Meta | 支持长期目标 | Hades / Dead Cells / VS |
| 新挑战修正 | 延长高手寿命 | Hades Pact / RoR2 Eclipse |

**核心原则：**

> 不要为了“增加内容”增加内容；让每份内容承担一个结构功能。

---

# 6. 一款新肉鸽最推荐的系统骨架

假设今天从 0 开始制作一款新的独立肉鸽，我会先写成下面这样：

```text
                         ┌──────────────┐
                         │    元目标      │
                         │ Unlock / Story │
                         └──────┬───────┘
                                │
                        ┌───────▼────────┐
                        │   Hub / Loadout │
                        │ 起始方向选择     │
                        └───────┬────────┘
                                │
                    ┌───────────▼────────────┐
                    │        RUN             │
                    │                        │
                    │  起点                  │
                    │   ↓                    │
                    │  路线选择              │
                    │   ↓                    │
                    │  战斗/挑战             │
                    │   ↓                    │
                    │  奖励/资源             │
                    │   ↓                    │
                    │  构筑决定              │
                    │   ↓                    │
                    │  新威胁/新规则          │
                    │   ↓                    │
                    │  Boss / Finale         │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │     Death / Victory    │
                    └───────────┬────────────┘
                                │
               ┌────────────────┼─────────────────┐
               ▼                ▼                 ▼
          知识反馈          永久成长          内容解锁
               │                │                 │
               └────────────────┴─────────────────┘
                                │
                                ▼
                            下一局
```

这个结构能覆盖绝大多数肉鸽，而不限制题材。

---

# 7. 真正决定好不好玩的，是“选择链”，不是“内容量”

设计一个优秀 run，可以用下面的链检查：

```text
看到选择
   ↓
马上明白区别
   ↓
能猜到一部分后果
   ↓
无法确认全部后果
   ↓
做出带观点的选择
   ↓
系统反馈
   ↓
下一次选择受到影响
```

这叫 **Choice Propagation（选择传播）**。

最强的肉鸽不是“选择很多”，而是：

> **前面的选择会改变后面的选择价值。**

例如：

```text
先拿暴击 Joker
        ↓
更喜欢多次攻击
        ↓
某个多段攻击卡价值上升
        ↓
商店出现对应卡
        ↓
你开始愿意花钱 reroll
        ↓
经济压力变高
        ↓
你舍不得买治疗
        ↓
下一层变危险
```

一个好点子，应该尽量能制造这种“连锁改变”。

---

# 8. 让构筑变得“有身份”：三种最强的构筑单位

## 8.1 Stat Build：数值型

例：暴击、攻击速度、生命、护甲。

优点：直观；易做。

缺点：容易变成“哪个数字大选哪个”。

使用场景：新手友好、动作肉鸽。

---

## 8.2 Synergy Build：协同型

例：

```text
火焰
+
燃烧
+
燃烧扩散
+
击杀时爆炸
```

形成：

> “我要让这个状态扩散。”

Balatro、Gungeon、Vampire Survivors 都特别依赖这一层。

---

## 8.3 Rule-Change Build：规则型

这是最强但最难做的一类。

例：

- “你不能治疗，但护盾越低越强”；
- “每第三次攻击必暴击”；
- “弃牌后本回合免费”；
- “技能顺序决定倍率”。

它不是给你 +20%。

它在告诉玩家：

> **换一种方式玩。**

这也是 Balatro / Dicey Dungeons / Hades 各自最值得学习的层面。

---

# 9. 随机性设计：用“确定性容器”装随机

一个很好用的公式：

> **Randomness × Agency = Roguelike Fun**

不是随机越多越好。

玩家必须拥有至少一个“修正随机”的手柄：

- 重抽；
- 锁定；
- 商店；
- 选择池；
- reroll；
- 资源换取；
- 路线规避；
- 敌人信息；
- 构筑预备。

否则玩家很难形成：“这是我的决定”。

---

# 10. Boss 不应该只是更厚的血条，而应该是“构筑考试”

一个优秀 Boss 至少回答一个问题：

```text
你的构筑是否解决了 X？
```

例如：

- 单体爆发；
- 清小怪；
- 生存；
- 位移；
- 长线资源；
- 近身风险；
- 护盾破解；
- 时间压力。

因此 Boss 的功能不是“结束一局”，而是：

> **告诉玩家：这局构筑最终到底有没有逻辑。**

Risk of Rain 2 的开发者甚至明确说明，一些原本不热门的物品因为最终 Boss 的存在而获得了新的价值评价；Boss 会把所有构筑统一拉到一个最终检验标准上。[Hopoo Dev Thoughts](https://store.steampowered.com/news/posts/?appids=632360&enddate=1604419228&feed=steam_community_announcements)

---

# 11. 内容生产：不要问“还能做多少个”，要问“组合图有多大”

一个肉鸽内容的价值可以近似理解为：

> **内容自身价值 + 与已有内容产生关系的价值。**

因此：

```text
10 个独立道具
≈ 10 个内容点

10 个能两两产生明显协同的道具
≈ 远大于 10 个内容点
```

Spelunky 的对象互相影响、Gungeon 的 Synergy、Balatro 的 Joker 都体现了这一点。[Spelunky 2](https://www.mossmouth.com/spelunky2/)；[Gungeon Synergies](https://enterthegungeon.wiki.gg/wiki/Synergies)；[Balatro](https://www.playbalatro.com/)

所以独立团队的优先级应该是：

> **先做关系，再做数量。**

---

# 12. 新肉鸽立项时的“最小可行架构”

不要一开始做 200 张卡、40 个角色、100 个道具。

第一阶段只需要验证：

### MVA（Minimum Viable Addiction / 最小有趣架构）

- 1 个核心动作；
- 1 条完整 run；
- 1 个可感知的构筑方向；
- 1 种随机；
- 1 个会被构筑改变的 Boss；
- 1 种死亡后反馈；
- 1 个可以让下一局不同的元系统。

### 第一条垂直切片应该长这样

```text
10-20 分钟
↓
玩家得到 3-5 次真正构筑选择
↓
形成一个明显玩法身份
↓
遇到一个针对性威胁
↓
可能失败
↓
失败后知道下一局想做什么
```

如果这个循环不成立，继续加内容只会把问题藏起来。

---

# 13. 设计评审清单：一个点子能不能留

给每个设计点问这 12 个问题：

1. 它解决哪个游戏设计问题？
2. 它让玩家多做了什么行为？
3. 它改变了什么选择？
4. 它制造了什么机会成本？
5. 它与至少 3 个旧系统有关系吗？
6. 它能产生不同 build 身份吗？
7. 它会在后期仍然有价值吗？
8. 它是否会让玩家更容易预测“我在干什么”？
9. 它的随机是惊喜还是噪音？
10. 它失败时玩家是否能理解原因？
11. 它成功时是否有明显反馈？
12. 删掉它，游戏会不会真的变差？

如果第 12 题答案是“不会”，删掉。

---

# 14. 一套可以直接用于原创肉鸽的“设计方程”

下面不是数学定律，而是一套设计检查模型：

> **乐趣 ≈ 决策价值 × 反馈强度 × 组合空间 × 选择传播 − 噪声成本**

其中：

### 决策价值
玩家选择 A 和 B，未来有没有明显差异？

### 反馈强度
选对之后，玩家是不是马上知道？

### 组合空间
前一个选择是否影响后一个选择？

### 选择传播
一个决定能传播多少个后续决定？

### 噪声成本
玩家是否因为随机而失去解释能力？

肉鸽最常见的五种失败模式也可以直接从这个方程理解：

```text
内容很多，但组合空间低     → 内容型假肉鸽
随机很多，但决策价值低     → 抽奖型肉鸽
数值很多，但反馈弱         → Spreadsheet RPG
升级很多，但选择传播低     → 装备清单模拟器
死亡很多，但没有新信息     → 重复劳动模拟器
```

---

# 15. 最终方法论：从一个灵感到一款不错的肉鸽

以后设计时，建议严格按下面 8 步走。

## Step 1：先确定“爽点动词”

例如：

- 闪避；
- 连击；
- 押注；
- 合成；
- 拆解；
- 召唤；
- 偷窃；
- 爆炸；
- 规划；
- 探索。

**没有爽点动词，不要开始做内容。**

## Step 2：决定你要玩家“越来越会什么”

只能先选 1-2 个：

- 操作；
- 构筑；
- 资源管理；
- 路线规划；
- 风险判断；
- 系统推理。

这决定了游戏的灵魂。

## Step 3：设计第一个构筑轴

例如：

> “攻击次数越多越强”

它应该天然导出一组内容：

- 多段攻击；
- 攻速；
- 触发次数；
- on-hit；
- 状态刷新。

## Step 4：设计第一个反制轴

如果玩家能一直堆攻击次数，那么 Boss / 敌人必须提出问题：

> “攻击次数高，但是单次伤害低怎么办？”

于是玩家必须继续做选择。

## Step 5：设计资源压力

至少加入一种：

- HP；
- 钱；
- 时间；
- 卡槽；
- 能量；
- 路线。

让成长拥有代价。

## Step 6：设计第一次“构筑惊喜”

在 10-20 分钟内，必须让玩家说出：

> “等等……这两个东西居然可以这样连！”

这是肉鸽最重要的情绪节点之一。

## Step 7：设计失败后的新意图

死亡后玩家应该自然说：

> “下一局我要试另外一种。”

而不是：

> “下一局我再刷一次金币。”

## Step 8：再扩内容

只有核心闭环成立以后，才增加：

- 新职业；
- 新卡；
- 新武器；
- 新地图；
- 新 Boss；
- 新事件；
- 新 Meta。

---

# 16. 一句话总结十款游戏真正共同的东西

**Hades** 告诉你：把死亡变成推进。

**Dead Cells** 告诉你：把玩家技能当成长。

**Vampire Survivors** 告诉你：把低操作换成高构筑密度。

**Vampire Crawlers** 告诉你：把爽点编码成连锁系统。

**Dicey Dungeons** 告诉你：给随机一个确定性的容器。

**Balatro** 告诉你：规则改写比数字加法更能制造身份。

**Slay the Spire** 告诉你：地图本质是资源预算图。

**Spelunky 2** 告诉你：关系比内容数量更能产生重玩价值。

**Risk of Rain 2** 告诉你：时间可以把贪婪变成风险。

**Enter the Gungeon** 告诉你：弱内容可以靠协同获得第二生命。

把这十条合在一起，就是：

> **一款好的肉鸽，是一个不断把“随机结果”转换成“玩家决策”的系统。**

而原创设计最重要的问题，永远不是：

> “我还能加什么？”

而应该是：

> **“我现在构思的这个东西，究竟为玩家提供了什么新的决策，并让哪个旧系统因此变得更有价值？”**

---

# 17. 研究来源

1. Supergiant Games — Hades FAQ  
   https://www.supergiantgames.com/blog/hades-faq/
2. Supergiant Games — Hades game page  
   https://www.supergiantgames.com/games/hades/
3. Tom’s Guide — Hades / Greg Kasavin interview  
   https://www.tomsguide.com/features/hades-exclusive-interview
4. Motion Twin — Dead Cells official page  
   https://deadcells.com/
5. Motion Twin — Dead Cells press kit  
   https://motiontwin.com/presskit/
6. PC Gamer — Dead Cells combat development  
   https://www.pcgamer.com/dead-cells-combat-evolved-from-tower-defense-games-and-team-fortress-2/
7. poncle — Vampire Survivors official page  
   https://poncle.games/vampire-survivors
8. Vampire Survivors Wiki — Weapons / Passive Items  
   https://vampire-survivors.fandom.com/wiki/Weapons
9. Vampire Crawlers — official Steam announcements  
   https://steamcommunity.com/app/3265700/announcements/
10. Terry Cavanagh Games — Dicey Dungeons press kit  
    https://terrycavanaghgames.com/dice/presskit/xbox/
11. GameDeveloper — Dicey Dungeons IGF interview  
    https://www.gamedeveloper.com/business/road-to-the-igf-cavanagh-houston-dobbe-s-i-dicey-dungeons-i-
12. GameDeveloper — Dicey Dungeons / Witch design  
    https://www.gamedeveloper.com/design/witch-craft-how-i-dicey-dungeons-balances-chance-and-predictability
13. Balatro official website  
    https://www.playbalatro.com/
14. Rogueliker — LocalThunk interview  
    https://rogueliker.com/balatro-interview/
15. DayOne — LocalThunk interview  
    https://playday.one/2024/03/09/there-is-a-lot-more-design-to-explore-within-balatro/
16. Mega Crit — Slay the Spire press kit  
    https://www.megacrit.com/press-kits/slay-the-spire/
17. Mossmouth — Spelunky 2 official page  
    https://www.mossmouth.com/spelunky2/
18. GameDeveloper — Derek Yu interview  
    https://www.gamedeveloper.com/game-platforms/interview-i-aquaria-i-s-derek-yu-on-indie-the-pit-of-death
19. GameDeveloper — procedural generation / Spelunky  
    https://www.gamedeveloper.com/design/how-to-effectively-use-procedural-generation-in-games
20. Risk of Rain 2 — Steam official page  
    https://store.steampowered.com/app/632360/Risk_of_Rain_2/
21. Hopoo Games — Development Thoughts #16  
    https://store.steampowered.com/news/posts/?appids=632360&enddate=1604419228&feed=steam_community_announcements
22. GameDeveloper — Risk of Rain interview  
    https://www.gamedeveloper.com/design/risk-of-rain-interview
23. Enter the Gungeon — Steam official page  
    https://store.steampowered.com/app/311690/Enter_the_Gungeon/
24. Enter the Gungeon Wiki — Synergies  
    https://enterthegungeon.wiki.gg/wiki/Synergies
25. FTL — Subset Games official page  
    https://subsetgames.com/ftl.html
26. FTL — Steam official page  
    https://store.steampowered.com/app/212680/FTL_Faster_Than_Light/

---

## 研究边界与说明

- 本文把“肉鸽”按现代 Roguelike / Roguelite 的广义设计谱系处理，不强行区分严格的 Berlin Interpretation。
- 重点研究的是**游戏设计架构**，不是各项目源代码架构、ECS、存档格式或引擎实现。
- 对于具体的掉落率、概率、数值表，没有逐项重建数学模型；本文重点提炼能迁移到新项目的系统结构。
- 《Vampire Crawlers》于 2026 年正式作为《Vampire Survivors》的首个官方衍生作进入样本，因此本研究把它作为“从既有核心爽点迁移到另一种肉鸽结构”的重要案例。
