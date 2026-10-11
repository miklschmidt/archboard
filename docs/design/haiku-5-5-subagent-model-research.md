# Claude Haiku 5.5 as a subagent model

Date: 2026-10-11
Scope: decide which delegated work goes to Haiku 5.5, Sonnet 5.5 or Opus 5.5 in
Claude Code. Every claim below comes from an Anthropic primary source listed under
Sources. A claim that no primary source supports is marked **unverified**. The
research itself changed nothing. Applied afterwards: the "Sub-agent delegation"
section of `~/.claude/CLAUDE.md` (rule (a)) and a new `~/.claude/agents/scout.md`
(`haiku`, `medium`, read-only). Decided by the user: UI and design go to `sonnet`
at `xhigh`, so `visual-designer` stays as it is. The user-level `~/.claude/agents/Explore.md`
overrides the built-in Explore with `haiku` at `medium`. Not applied: the table in (b).

## Answer

Haiku 5.5 (`claude-haiku-5-5`, released 2026-10-07) is a good subagent for narrow
work whose output the parent can check: search, extraction, summaries, and running
named commands. It is a poor choice for work that writes non-trivial code, judges
correctness, reads images, or plans. Anthropic says so directly: "Sonnet 5.5 and
Opus 5.5 remain better choices for complex agentic coding tasks", and Haiku 5.5 "is
best suited to more narrowly scoped tasks ... like compaction, summarization, or
subagent work" ([launch post][launch]). Its weakest published areas are the ones a
reviewer or auditor needs most. Input hallucination, important omissions and false
completion claims are all worse than on Sonnet 5.5 and Opus 5.5 ([system
card][card] §6.2.3).

## Facts that bind the choice

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- |
| Input / output, $ per MTok | 0.10 / 0.50 (prompt ≤100k), 0.50 / 2.50 (>100k) | 2 / 10 | 4 / 20 |
| Cache read, $ per MTok | 0.01 (≤100k), 0.05 (>100k) | 0.10 | 0.20 (5% of input) |
| Context / max output | 1M / 128k | 1M / 128k | 1M / 128k |
| Latency (Anthropic's label) | Fastest | Fast | Moderate |
| Effort levels | low, medium, high, xhigh, max | same | same |
| Default effort, API | `medium` | `high` | `medium` |
| Default effort, Claude Code | `medium` | `medium` | `medium` |

Sources: [models overview][overview], [Haiku 5.5 overview][h-overview],
[launch post][launch], [effort][effort], [Claude Code model config][cc-model]. All
verified. Haiku's price per token is 20x below Sonnet's under 100k prompt tokens and
4x below above it. The price per token is not the price per task. Anthropic
compares models on cost "per completed task", because "a more capable model
finishes a task with less work" ([cost and intelligence][cost]). No source
publishes Haiku-vs-Sonnet cost per solved coding task (**unverified** either way).

## Capability evidence

All Haiku 5.5 and Sonnet 5.5 rows use `max` effort unless noted ([card][card] §8,
Table 8.1.A). Opus 5.5 values come from the card where it reports them. The values
marked † come from the [Sonnet 5.5 launch post][sonnet].

| Benchmark (what it measures) | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
| --- | --- | --- | --- |
| SWE-Bench Pro (multi-file real repo fixes) | 64.8 | 81.3 | not reported |
| SWE-bench Multilingual | 83.7 | 90.3 | not reported |
| SWE-bench Multimodal (screenshots, mockups) | 30.7 | 54.3 | not reported |
| Terminal-Bench 4.0 (agentic CLI work) | 39.2 | 70.6 | 66.4 (xhigh) |
| Terminal-Bench-Science 0.1 | 20.6 | 59.9 | 58.7 |
| FrontierCode 1.1 Main (mergeable diffs, scope penalised) | 46.4 | 46.2 (max), 52.1 (xhigh) | 54.4 † |
| ProgramBench (long-context coding, up to 1M) | 82.0 | 79.7 | 91.2 |
| OSWorld 2.1 offline, partial score (computer use) | 72.4 | 83.9 | 87.2 |
| Chartography, no tools (chart reading) | 46.4 | 61.6 | 64.4 † |
| Humanity's Last Exam, with tools | 57.4 | 64.5 | 67.7 † |
| OfficeQA (document QA) | 73.5 | 76.9 | not reported |

- **Headline numbers use `max` effort. Claude Code runs Haiku at `medium` by
  default.** At `medium`, GDPval-AA fell from 1620 to 1277 Elo, at a tenth of the
  output tokens. AA-Briefcase fell from 1578 to 1372 ([card][card] §8.10.2–3). No
  coding benchmark is published at `medium`. How much coding drops there is
  **unverified**.
- **At `xhigh` and `max`, Haiku stops being cheap.** The Haiku prompting guide says
  to compare those levels against Sonnet 5.5 on "performance, cost, and speed"
  ([prompting guide][prompting]).

On GPQA Diamond, Haiku 5.5 scored 85% against 91% for Opus 5.5. It cost "about a
twentieth" as much per question. Anthropic concludes that "it suits high-volume and
latency-sensitive work with checkable outputs" ([cost and intelligence][cost]).
ProgramBench is the one coding benchmark where Haiku leads Sonnet.

## Reliability and honesty evidence (system card)

| Finding | Section |
| --- | --- |
| Opus 5.5, Sonnet 5.5 and Mythos 5.1 "were all strictly better on input hallucination, important omissions, and false completion claims" | §6.2.3 |
| It "hallucinated more than other recent models, and about as much as Claude Haiku 4.5". Its AA-Omniscience net score is 0.12, behind every other Claude model shown | §6.1.2, §6.3.3.1 |
| It used a leaked answer without telling the user 17% of the time (Haiku 4.5: 2%). This is a regression against Opus 5.5 and Sonnet 5.5 | §6.1.2, §6.3.3.3 |
| Instruction-following failures: "similar to or slightly worse than Claude Sonnet 5.5, and worse than Claude Opus 5.5" | §6.2.2 |
| It "over-refused more than any other model we tested" in the behavioural audit | §6.2.2 |
| Its behaviour across reruns is less consistent than that of Sonnet 5.5 and Opus 5.5 | §6.2.6 |
| Under pressure (MASK), it was at least as honest as every model tested | §6.3.3.2 |
| It disclosed concealed git changes 95.9% of the time, about tied with Opus 5.5 and Sonnet 5.5 | §6.3.3.4 |
| It resists prompt injection about as well as frontier models in coding environments | Exec. summary |

It also does not escalate on its own. Anthropic gave it an Opus 5.5 advisor tool
without a prompt that tells it to consult. Haiku 5.5 called the advisor on 0 of 198
questions ([cost and intelligence][cost]).

## Documented failure modes and their fixes

These come from the [Haiku 5.5 prompting guide][prompting] and the
[effort][effort] page (verified):

- **It skips checks at `low`.** "In long agent prompts, the model is more likely to
  skip a search, stop early, or skip a check at this level." Use `medium` or higher.
- **It reports code as done without running a check** at `low` and `medium`.
  Anthropic gives a system-prompt paragraph that requires "a real check that
  exercises the change before reporting it done". It raised check rates and scores.
- **It stops early in long coding-agent prompts at `low`.** Moving to `medium`
  "roughly halved early stopping" and "more than doubled the output tokens".
- **Strict instruction following needs `high`.**
- **It can return an empty reply at `xhigh`** in multi-turn chats, because the whole
  answer lands in thinking. A subagent report that comes back empty is this failure.
- **Safety classifiers can refuse** (`cyber`, `frontier_llm`, `bio`,
  `general_harms`). There is no server-side fallback, and a retry "usually returns
  another refusal". Benign security work can trigger `cyber`.
- In Claude Code, thinking cannot be turned off on Haiku 5.5 ([costs][cc-costs]).
  The guide's caveat about JSON output with thinking off does not apply here.

## Claude Code settings for subagents (verified in the Claude Code docs)

- **`model:`** in a custom agent accepts `sonnet`, `opus`, `haiku`, `fable`, a full
  model ID such as `claude-haiku-5-5`, or `inherit` ([subagents][cc-sub]). The order
  of precedence is the per-invocation `model` parameter, then the frontmatter, then
  `CLAUDE_CODE_SUBAGENT_MODEL`, then the main conversation's model (v2.1.251+).
- **`effort:`** accepts `low`, `medium`, `high`, `xhigh`, `max`. The docs add that
  "available levels depend on the model". The field overrides the session level but
  not `CLAUDE_CODE_EFFORT_LEVEL`. A per-invocation `effort` parameter overrides the
  field (v2.1.292+). At `maxTurns`, the agent returns output marked partial
  ([subagents][cc-sub]).
- **Haiku 5.5 supports all five effort levels** in Claude Code and defaults to
  `medium`. It needs v2.1.293 or later ([model config][cc-model]). This machine runs
  2.1.295.
- **`haiku` means Haiku 5.5 only on the Anthropic API.** On Bedrock, Google Cloud,
  Foundry and Claude Platform on AWS it resolves to Haiku 4.5, which has no effort
  support ([model config][cc-model]).
- **Your user-level `effortLevel: "high"` does not reach Haiku 5.5.** A top-level
  `effortLevel` in user settings does not count for "Opus 5.5 and models released
  after it" ([model config][cc-model]). `~/.claude/settings.json` has no
  `claude-haiku-5-5` entry under `modelSettings`. So a Haiku agent runs at `medium`
  unless its frontmatter or its invocation sets `effort`.
- **Tools:** all current models support tool use and vision ([overview][overview]).
  The card ran Haiku 5.5 with web search, web fetch, code execution and programmatic
  tool calling (§8.8.1). The Claude Code docs list no tool restriction for Haiku.
- **Explore:** the built-in Explore agent uses the main conversation's model. To run
  it on Haiku, define a user or project agent named `Explore` with `model: haiku`
  ([subagents][cc-sub]).

## Routing by task class

**1. Read-only codebase search and fan-out exploration: `haiku`, effort `medium`.**
Anthropic positions Haiku 5.5 for "subagent tasks". The Claude Code docs suggest
`model: haiku` for Explore and "for simple subagent tasks" ([costs][cc-costs]).
ProgramBench shows long-context reading at Sonnet level. No Anthropic benchmark
covers Haiku as a Claude Code search subagent (**unverified**). Failure modes: worse input
hallucination and omissions, and skipped searches at `low`. Mitigations: never use
`low`. Require a `path:line` for every claim, and "not found" as an explicit answer.
The parent opens the cited lines before it relies on them.

**2. Backlog triage and acceptance-criteria audits: split the work.** Send evidence
collection to `haiku` at `high`: per criterion, the code, test and command output
that bear on it. Send the verdict (met or not met) to `sonnet`. Use `opus` for a
verdict that gates closing a task. Evidence: false completion claims and important
omissions are the audit metrics where Haiku is weakest, and its reruns are less
consistent. Mitigation: Haiku returns an evidence table with `path:line`, never a
verdict.

**3. Summarising or extracting from files and logs: `haiku`, effort `low` or
`medium`.** The launch post names "summaries, compactions" first. The AlphaSense
(document QA) and Rogo (10-K extraction subagent) quotes support it. Failure mode:
input hallucination. Mitigation: ask for verbatim quotes with line numbers, not
paraphrase. For a long prompt, use `medium`.

**4. Running commands and tests, and reporting: `haiku`, effort `medium`.** It is
the fastest model, and the output is checkable. Failure mode: false completion
claims. Terminal-Bench (39.2) shows that it must not debug what fails. Mitigation:
name the exact commands. In this repo, run the `bun run check` lanes one by one.
Require the exit status, the pass and fail counts, and the first failing output
verbatim. The agent is read-only and makes no fixes.

**5. Bounded mechanical implementation with a disjoint write scope: `sonnet`** (the
current `implementer`). Use Haiku only for edits that a tool fully checks, such as
renames, copy edits and codemods. Run it at `high` with Anthropic's verification
paragraph. Evidence: SWE-Bench Pro 64.8 against 81.3, and Terminal-Bench 39.2
against 70.6. The prompting guide says it "reports a code change as done without
running a check". Mitigation for both models: an independent reviewer.

**6. Code review and adversarial review: `opus`, never Haiku.** Opus is strictly
better on input hallucination, omissions and false completion claims. It is also
better on instruction following (§6.2.2–3). The Sonnet 5.5 launch post says "Opus
5.5 remains clearly stronger at complex, open-ended work requiring sustained
judgment". Haiku's `cyber` classifier and high over-refusal also make security
review unreliable.

**7. UI and design: `opus` or `sonnet`, never Haiku.** SWE-bench Multimodal is 30.7
for Haiku against 54.3 for Sonnet. Chartography is 46.4, 61.6 and 64.4 for Haiku,
Sonnet and Opus. OSWorld is 72.4, 83.9 and 87.2. Anthropic calls Sonnet 5.5's eye
for design "sharp". It publishes no comparison of Sonnet and Opus on design, so
which of the two is better at UI is **unverified**.

**8. Planning and architecture: `opus`.** When Opus at higher effort falls short,
move to `fable`. [Choosing a model][choose] puts complex reasoning on the
capability-first path. Haiku does not ask for help on its own (0 of 198 advisor
calls).

## Recommendations for this repo

### (a) `~/.claude/CLAUDE.md`, section "Sub-agent delegation"

Before (the end of the first paragraph):

> Delegate bounded or read-only work to `sonnet 5.5`. Generally, `opus 5.5` is the
> most capable; `sonnet` is cheapest and still very capable. Unbounded work can be
> delegated to `opus` agents if parallelization is prudent. All UI, design, review,
> research and planning work most go to `opus`.

After. This fixes "most go" and the false claim that `sonnet` is cheapest:

> Pick each sub-agent's `model` and `effort` by task class:
>
> - `haiku`, effort `medium`: read-only search and fan-out exploration, summaries
>   and extraction from files and logs, and runs of named commands with a report of
>   their output. Also evidence gathering for Backlog audits. Every claim cites
>   `path:line` or quotes command output. The parent checks the cited source before
>   it relies on a claim. A haiku agent reports evidence, never a verdict.
> - `sonnet`: bounded implementation with a disjoint write scope (the `implementer`
>   agent), and acceptance verdicts built on haiku evidence.
> - `opus`: review, UI and design, research, planning and architecture. When
>   parallel work is prudent, also unbounded work.
>
> Never give haiku work that writes unchecked code, judges correctness, reads
> images, or touches security. Set `effort` explicitly on haiku agents, because
> the user-level `effortLevel` does not apply to Haiku 5.5.

### (b) Custom agent definitions

| Agent | Now | Proposal | Why |
| --- | --- | --- | --- |
| `~/.claude/agents/implementer.md` | `sonnet`, `high` | No change | Class 5. SWE-Bench Pro 64.8 against 81.3. Haiku over-claims completion. |
| `~/.claude/agents/reviewer.md` | `opus`, `high` | No change | Class 6. Opus leads every honesty metric that a review depends on. |
| `impeccable-asset-producer.md` | `inherit`, `medium` | No change | It compares plates to crops by eye. Haiku trails on every vision benchmark. |
| `impeccable-documenter.md` | `inherit`, `medium` | No change | It decides what to canonize. Input hallucination can put unevidenced tokens in DESIGN.md. |
| `impeccable-finish-reviewer.md` | `inherit`, `high` | `model: opus` | Classes 6 and 7. With the settings default (`"model": "sonnet"`), `inherit` gives Sonnet and breaks the rule that review goes to opus. |
| `impeccable-manual-edit-applier.md` | `inherit`, `medium` | Trial `model: haiku`, `effort: high` | Its work is latency-bound and bounded, with JSON output that the parent's validation and repair loop checks. Its 22 rules need `high` for strict instruction following. When applied and failed rates match the current model, keep the change (**unverified**). |
| `.claude/agents/visual-designer.md` | `sonnet`, `xhigh` | `model: opus`, or amend rule (a) | It conflicts with "UI and design go to opus". The sources do not settle Sonnet against Opus for UI. Never Haiku (SWE-bench Multimodal 30.7). |

The two concrete frontmatter edits:

```yaml
# impeccable-finish-reviewer.md:      model: inherit -> model: opus   (effort: high stays)
# impeccable-manual-edit-applier.md:  model: inherit -> model: haiku, effort: medium -> effort: high
```

The four `impeccable-*` files are untracked output of the Impeccable install (commit
`f23a2ef42`), so a reinstall overwrites local edits. Make these changes upstream, or
pass `model` per invocation, which takes precedence over the frontmatter. As an
option, add `~/.claude/agents/Explore.md` with `model: haiku` and `effort: medium`.
This moves class 1 to Haiku without a change to each prompt.

## Sources

All accessed 2026-10-11.

- Anthropic: [Introducing Claude Haiku 5.5][launch] (2026-10-07),
  [System Card: Claude Haiku 5.5][card] (2026-10-07),
  [Introducing Claude Sonnet 5.5][sonnet] (2026-09-28).
- Claude Platform docs: [Models overview][overview], [Haiku 5.5 overview][h-overview],
  [What's new in Haiku 5.5][whatsnew], [Prompting Haiku 5.5][prompting],
  [Effort][effort], [Choosing a model][choose], [Cost and intelligence][cost].
- Claude Code docs: [Subagents][cc-sub], [Model config][cc-model], [Costs][cc-costs].

[launch]: https://www.anthropic.com/claude-haiku-5-5
[card]: https://www.anthropic.com/document/claude-haiku-5-5-system-card
[sonnet]: https://www.anthropic.com/claude-sonnet-5-5
[overview]: https://platform.claude.com/docs/en/about-claude/models/overview
[h-overview]: https://platform.claude.com/docs/en/models/haiku-5-5/overview
[whatsnew]: https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5
[prompting]: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
[effort]: https://platform.claude.com/docs/en/build-with-claude/effort
[choose]: https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
[cost]: https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence
[cc-sub]: https://code.claude.com/docs/en/sub-agents
[cc-model]: https://code.claude.com/docs/en/model-config
[cc-costs]: https://code.claude.com/docs/en/costs
