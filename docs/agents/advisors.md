# Advisors

An advisor is a sub-agent that gives a design judgement in place of a person.
`archboard-deepen` asks two advisors at each gate where it would otherwise ask the owner.
Each advisor answers alone first, and then it sees the other advisor's answer.

The two advisors in this repository:

| Advisor | Provider | Model                                                         |
| ------- | -------- | ------------------------------------------------------------- |
| Astra   | Codex    | The latest Codex Astra model, for example `gpt-6.2-astra`     |
| Fable   | Claude   | The latest Claude Fable model, for example `claude-fable-5-2` |

Pick the latest model of each family that the harness lists.
Run each advisor at high reasoning effort, and set it explicitly when you start it: Codex `reasoningEffort: "high"`, Claude `effort: "high"`. Left unset, Astra runs at low.
Give each advisor a brief with only the question, the facts it needs and pointers to the files, and no history of the conversation.
Let it read the repository, and change nothing.
