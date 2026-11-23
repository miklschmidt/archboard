# Advisors

An advisor is a sub-agent that gives a design judgement in place of a person.
`archboard-deepen` asks two advisors at each gate where it would otherwise ask the owner.
Each advisor answers alone first, and then it sees the other advisor's answer.

## Judge from the reader's seat

An advisor stands in for the owner, and the owner judges a decision by its user. Archboard's users
are the people who read its pictures and the agents who author its models. Judge each decision
first from the seat of the person who looks at the result: what they see at a glance, what they
learn, and what they can then act on. What an agent can decide from code is a constraint on the
design. It never sets the goal. When the two pull apart, say so, and give the reader's answer and
what it would take to make it decidable.

The two advisors in this repository:

| Advisor | Provider | Model                                                         |
| ------- | -------- | ------------------------------------------------------------- |
| Astra   | Codex    | The latest Codex Astra model, for example `gpt-6.2-astra`     |
| Fable   | Claude   | The latest Claude Fable model, for example `claude-fable-5-2` |

Pick the latest model of each family that the harness lists.
Run each advisor at high reasoning effort, and set it explicitly when you start it: Codex `reasoningEffort: "high"`, Claude `effort: "high"`. Left unset, Astra runs at low.
Give each advisor a brief with only the question, the facts it needs and pointers to the files, and no history of the conversation.
Let it read the repository, and change nothing.
