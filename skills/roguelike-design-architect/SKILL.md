---
name: roguelike-design-architect
description: Use this skill when designing, evaluating, balancing, or iterating a roguelike or roguelite game. It converts game ideas into explicit design functions, player choices, controlled randomness, build identities, risk/reward loops, encounters, pacing, failure feedback, and meta progression. Apply it especially when a user asks to invent a mechanic, item, character, room, event, progression system, or complete roguelike architecture.
---

# Roguelike Design Architect

## Purpose

Design roguelike/roguelite systems by maximizing meaningful decisions under controlled uncertainty.

The default design objective is:

> Make the player choose under uncertainty, then make each choice change the value of later choices.

Do not equate “more random content” with “more replayability.” Randomness is an input to decision-making, not the end goal.

## Core Design Model

Treat every roguelike as nine interacting layers:

```yaml
core_verb: "What does the player do most often?"
run_goal: "What must the player accomplish during one run?"
build: "What makes this run meaningfully different from another?"
randomness: "Where does uncertainty enter?"
economy: "What scarce resource creates opportunity cost?"
tension: "Why must the player decide now instead of later?"
route: "What determines where the player goes next?"
meta: "What changes between runs?"
failure: "What does the player learn or gain by losing?"
pacing: "When does the game demand thought, execution, greed, recovery, or payoff?"
```

A new mechanic should connect to at least one layer and preferably change two or more.

## Design Transformation

For every proposed idea, derive the following chain before adding content:

```text
idea
→ intended function
→ player behavior
→ meaningful choice
→ opportunity cost
→ uncertainty
→ risk
→ immediate feedback
→ downstream effect
→ run identity
→ encounter test
→ failure learning
→ meta consequence
```

If an idea cannot be mapped through this chain, treat it as cosmetic, redundant, or premature.

## Mandatory Design Statement

Rewrite every new mechanic into this sentence:

> “I am adding X to achieve Y, which causes the player to do Z, creating a choice between A and B, with risk C and feedback D.”

Example:

> “I am adding a lifesteal weapon to reduce dependence on healing rooms, which causes the player to play closer to enemies, creating a choice between safer ranged damage and riskier sustain, with health-gain feedback on successful hits.”

If the sentence remains vague, continue refining the mechanic rather than generating more content.

## Design Point Schema

Use this schema when evaluating a mechanic, item, character, room, event, upgrade, resource, or progression feature:

```yaml
DesignPoint:
  name: "..."
  fantasy: "What should this feel like?"
  problem_solved: "What design problem does it solve?"
  primary_function: "core_verb | build | economy | tension | route | information | meta | pacing"
  secondary_functions: []
  player_behavior: "What behavior does it reward or punish?"
  choice:
    option_a: "..."
    option_b: "..."
  opportunity_cost: "What is sacrificed by choosing this?"
  randomness:
    source: "none | content | spatial | numeric | informational | rules"
    player_control: "How can the player influence the outcome?"
    readability: "Can the player understand the uncertainty before committing?"
  risk: "What can go wrong?"
  reward: "What makes the risk attractive?"
  feedback: "What tells the player the mechanic worked or failed?"
  build_identity: "What archetype or fantasy does this create?"
  synergies: []
  anti_synergies: []
  encounter_test: "Which enemy, elite, boss, or room tests the mechanic?"
  route_impact: "How does this change where the player wants to go?"
  economy_impact: "What resource becomes more or less valuable?"
  future_value: "How does this alter the value of later choices?"
  failure_learning: "What should the player learn after failure?"
  meta_value: "power | content | knowledge | story | expression | none"
  run_timing: "early | mid | late | all"
  content_multiplication: "How many existing systems does this make more interesting?"
```

## Principles

### 1. Preserve Player Authorship

Use:

```text
random result + choice + readable consequence + some control
```

over:

```text
random result + random result + random result
```

The player should usually be able to explain why a choice was good or bad after the outcome.

Reduce randomness or add control when failure feels arbitrary.

### 2. Randomness Has a Budget

Treat uncertainty as a budget that can be spent across:

```text
content
spatial arrangement
numeric outcomes
information
rules
```

Do not make every layer random simultaneously unless the game intentionally targets chaos.

A reliable pattern is to keep one uncertainty layer strong while stabilizing another layer so players can plan.

Reference patterns:

- Dicey Dungeons: deterministic equipment/positioning helps contain the uncertainty of dice.
- Slay the Spire: random rewards and routes are constrained by a readable map and deterministic card effects.
- Spelunky 2: unpredictable interactions are balanced by highly learnable base rules.

### 3. Content Must Change Behavior

A new item, skill, card, relic, weapon, or upgrade should change at least one of:

- action sequence
- target priority
- positioning
- resource priority
- route preference
- value of future rewards
- synergy structure
- risk tolerance
- encounter strategy

Pure numerical inflation is lower-value content unless its purpose is explicitly tempo, accessibility, or power progression.

### 4. Prefer Rule Changes Over Flat Bonuses

Weak example:

```text
+10% attack speed
```

Stronger example:

```text
Every third attack resets the cooldown of the previous ability.
```

The second changes rhythm, sequencing, and build value rather than only increasing a number.

Use rule transformation when you want a piece of content to become a build-defining object.

### 5. Every Build Needs a Question

A build is interesting when it creates a strategic question.

Examples:

```yaml
build: many_small_hits
question: "Can I survive enemies that punish prolonged contact?"

build: glass_cannon
question: "Can I kill threats before attrition overwhelms me?"

build: economy_snowball
question: "Can I spend time farming without giving the run enough danger to catch me?"

build: status_combo
question: "Can I maintain setup long enough to reach the payoff?"
```

Bosses and elites should test the build's central promise rather than merely have more health.

### 6. Push-Your-Luck Needs a Clock or Scarcity

Use a pressure system when you want players to choose between greed and safety.

Canonical structure:

```text
more exploration
→ more resources
→ more time / danger / debt
→ harder future state
```

Alternative pressure resources include:

```text
HP
healing
ammo
charges
money
heat
curse
noise
enemy escalation
limited rerolls
```

The pressure should make the greedy option attractive, not simply punish greed.

### 7. Weak Content Needs a Future

A weak item can be valuable if it has optionality.

Useful future roles:

```text
synergy piece
route enabler
counterpick
early-game stabilizer
resource converter
boss preparation
future-value multiplier
```

Do not force every item to be universally strong.

### 8. Build Identity Must Emerge Early

By early-to-mid run, the player should be able to answer:

> “What kind of run am I building?”

Build identity can come from:

```text
weapon
card package
Joker / relic package
status system
resource engine
movement style
risk profile
scoring rule
```

If the run remains generic until the final third, the build layer is too weak or starts too late.

### 9. Choices Should Propagate

Prefer choices that change future choices.

Weak:

```text
Pick +5% damage.
```

Stronger:

```text
Pick a bleeding relic.
→ bleed effects become more valuable.
→ future bleed cards rise in value.
→ healing becomes less urgent.
→ a bleed-focused boss becomes easier.
→ a different route may now be optimal.
```

This propagation is one of the main engines of replayability.

### 10. Death Must Teach or Advance

A failed run should produce at least one meaningful gain:

```text
knowledge
content
story
power
expression
```

Prefer knowledge plus another category rather than power alone.

The next run should feel informed by the previous run even when permanent power is modest.

## Architecture Rules

### Run Loop

A healthy run loop generally has:

```text
prepare
→ enter challenge
→ make tactical decision
→ receive reward
→ update build
→ choose route/resource allocation
→ encounter stronger test
→ reach spike / boss
→ win or die
→ receive feedback
→ modify next attempt
```

Each stage should create or transform a decision. If a stage only consumes time, question whether it should exist.

### Micro / Meso / Macro Decisions

Evaluate decisions at three scales:

```yaml
micro:
  examples: ["attack target", "play card", "dash", "spend charge"]
  cadence: seconds

meso:
  examples: ["choose reward", "buy item", "change loadout", "take elite"]
  cadence: minutes

macro:
  examples: ["choose route", "choose risk level", "choose long-term build"]
  cadence: run/act
```

A strong game lets these scales interact.

Example:

```text
macro: pursue poison build
→ meso: select poison card
→ micro: preserve application uptime
→ meso: buy duration relic
→ macro: poison route becomes increasingly attractive
```

### Economy

For every major resource, define:

```yaml
resource:
  source: "How is it generated?"
  sink: "Where is it spent?"
  scarcity: "Why can't the player have infinite amounts?"
  timing: "When is it most valuable?"
  opportunity_cost: "What does spending it prevent?"
  snowball: "Does having more create even more?"
  comeback: "Can a weak run recover?"
```

Healthy economies usually contain both a reason to save and a reason to spend.

### Route Design

Each route choice should trade at least two dimensions:

```text
power vs safety
short-term vs long-term
consistency vs variance
resources vs time
build fit vs generic value
information vs reward
```

Avoid routes that are simply:

```text
bad reward
→ less fun
```

### Encounter Design

For each build or core mechanic, define tests:

```yaml
encounter_tests:
  baseline: "Can the build function at all?"
  execution: "Can the player execute it under pressure?"
  counter: "What naturally challenges it?"
  optimization: "What rewards expert use?"
  boss: "What proves the build's central promise?"
```

A boss should ask a build-specific question.

## Pacing Model

Track the emotional rhythm, not only difficulty.

A useful sequence is:

```text
learn
→ stabilize
→ discover
→ commit
→ spike
→ recover
→ gamble
→ test
→ payoff
→ reset
```

Do not stack continuous intensity. Players need contrast for peaks to feel like peaks.

Use shops, safe rooms, story moments, healing, low-threat encounters, or build screens as pressure-release valves.

## Meta Progression

Classify permanent progression before adding it:

```yaml
power:
  changes combat capability

content:
  unlocks new weapons, cards, enemies, rooms, or routes

knowledge:
  reveals systems, patterns, counters, or hidden information

story:
  changes context and character relationships

expression:
  adds customization without meaningfully changing power
```

Use meta progression to solve a specific problem.

Bad reason:

> “We need a meta tree because roguelites have meta trees.”

Good reason:

> “We need a small permanent unlock layer because early runs are currently repetitive before the player reaches meaningful build choices.”

## Reference Patterns From the 10-Game Study

Use these as structural references, not as templates to copy.

| Game | Architecture pattern |
|---|---|
| Hades | Death advances story and permanent progression; each run still has a strong combat identity. |
| Dead Cells | High mechanical demand makes player knowledge and execution part of progression. |
| Vampire Survivors | Automated attacks shift attention from aiming toward positioning, timing, upgrades, and exponential build growth. |
| Vampire Crawlers | Fast card exploration converts action-game tempo into sequencing and combo planning. |
| Dicey Dungeons | Controlled randomness prevents random systems from overwhelming player planning. |
| Balatro | Simple base rule + rule-changing modifiers creates enormous combinatorial build space. |
| Slay the Spire | Route, rewards, deck construction, and combat form a tightly coupled decision system. |
| Spelunky 2 | Small systemic rules create emergent situations that generate stories and mastery. |
| Risk of Rain 2 | Time pressure converts exploration and farming into a greed-vs-danger decision. |
| Enter the Gungeon | Large item pools gain additional value through synergies and interaction rules. |

## Design Review Rubric

Score a proposed mechanic from 0 to 2 on each dimension.

```yaml
meaningful_choice: 0-2
behavior_change: 0-2
future_choice_impact: 0-2
build_identity: 0-2
controlled_randomness: 0-2
risk_reward_clarity: 0-2
feedback_strength: 0-2
encounter_relevance: 0-2
replay_value: 0-2
content_multiplication: 0-2
```

Interpretation:

```text
0-7   = reject or redesign
8-13  = promising but incomplete
14-17 = strong candidate
18-20 = core-system quality; prototype early
```

A mechanic can still be valuable with a low score when it intentionally serves accessibility, onboarding, story, or presentation rather than replayability.

## Red Flags

Reject or challenge a design when you see:

```text
“More RNG will make it replayable.”
“More items will solve the content problem.”
“Every upgrade should just be stronger.”
“Every build should have one obvious optimal path.”
“The player should not know what the choice does.”
“Death should reset everything so runs feel meaningful.”
“Bosses only need more HP.”
“Meta progression should always increase numbers.”
```

Translate each claim into a design function before accepting it.

## AI Workflow

When asked to design a new roguelike or a new roguelike mechanic, follow this order:

1. Identify the intended player fantasy and core verb.
2. Identify which architecture layer the new idea is supposed to improve.
3. Write the mandatory design statement.
4. Populate the DesignPoint schema.
5. Identify the new choice and its opportunity cost.
6. Identify the uncertainty source and the player's control over it.
7. Identify at least one downstream choice that changes because of the mechanic.
8. Define the build identity and at least one counter-test.
9. Define how the mechanic feels in the first minute, first run, and after mastery.
10. Define what failure teaches.
11. Run the rubric.
12. Redesign before adding extra content if the score is low.

## Output Format For Design Tasks

When the user asks for a new mechanic, provide:

```yaml
concept:
function:
player_behavior:
choice:
opportunity_cost:
randomness:
risk_reward:
build_identity:
synergies:
counters:
encounter_test:
feedback:
failure_learning:
meta_role:
rubric_score:
prototype:
```

For full-game design, additionally provide:

```yaml
core_loop:
run_structure:
combat_or_primary_action:
reward_structure:
build_system:
route_system:economy:
tension_system:
encounter_ladder:
boss_tests:
meta_progression:
pacing:
replayability_engine:
content_strategy:
```

Do not generate large content tables until the architecture passes the rubric.

## Prototype Rule

Prototype the smallest system that can answer the highest-risk design question.

Examples:

```text
Risk: “Will this synergy create interesting choices?”
→ prototype 8 items, not 80.

Risk: “Does time pressure create greed?”
→ prototype one map with escalating danger.

Risk: “Can players understand this random system?”
→ prototype one random source with visible control tools.

Risk: “Does the weapon create a distinct build?”
→ prototype one weapon, three supporting upgrades, two counters.
```

Never use content volume to hide an unresolved interaction problem.

## Final Quality Gate

Before considering a roguelike design complete, answer all of these:

1. What does the player do every few seconds?
2. What meaningful decision occurs every few minutes?
3. What decision changes the value of future decisions?
4. What makes two runs strategically different?
5. Where is randomness introduced?
6. What prevents randomness from removing player agency?
7. What scarce resource creates opportunity cost?
8. What makes greed attractive?
9. What tests each major build?
10. What does death teach or unlock?
11. What makes the player say “one more run”?
12. What is the smallest prototype that can prove the central hypothesis?

If several answers are vague, the architecture is not ready for content expansion.
