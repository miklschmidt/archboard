---
status: accepted
---

# The browser is one app, and each checkout has its own workhorse

Decided with the owner on 2026-10-14, together with ADR 0049. The migration is
planned in the Backlog document doc-002, "One Archboard server for every vault".

ADR 0049 makes one server serve every vault. This decision says how the browser
and the Codex workbench read several repositories at once. The owner asked for
the browser to work as one app, not as a set of web pages. Everything that a
person reads is in one tab, and nothing needs a second tab to be reachable.

## The navigator and the panes

Board names need to be unique only inside one vault, because the identity
groups them.

Each identity has a menu of its known checkouts. Choosing one is `repo use`,
so the choice is for the whole machine, and every tab follows it.

A pane can show a board of any listed repository, and the two panes of a tab
can show two repositories. The URL gives each pane its own repository
parameter beside its board, for example
`?paneA=Payments@proposed&repoA=github.com/acme/payments`. Thus the parser never
splits an identity and a board name out of one string, and both can hold `/`.
An untracked vault uses its registry name there. The URL holds no path.

## Agents and the browser

`browser show` from an agent in a checkout that is not chosen makes that
checkout the chosen one, and then it shows the board. Its answer says that it
changed the chosen checkout and names the checkout that it replaced. Two agents
in two worktrees of one repository take turns, and the last `show` wins. Only
`browser show`, `repo use` and the navigator's menu change the choice. A board
command never does.

## The Codex workbench

A tab session has one voice coordinator for the whole app and one workhorse for
each checkout that the tab works in.

A workhorse runs in the directory of its checkout. Thus it reads that
repository's agent instructions, skills and Codex configuration, and a plain
`archboard` in it addresses the right vault. The workhorse of an untracked
vault runs in the directory that holds the vault. A workhorse belongs to a
checkout, not to an identity. So if the chosen checkout of its identity
changes, the workhorse stays valid.

The coordinator runs in a directory of its own under the state directory, so it
works in no checkout. It reads boards with `-C`. It gives all work in a checkout
to that checkout's workhorse. If there is no such workhorse, the coordinator
starts it. Its bounded direct work (ADR 0019) is reading boards and answering.

The Stop control stops the workhorse of the shown conversation. A spoken stop
stops every running workhorse of the tab session, because the voice speaks for
the whole app. Workhorse news reaches the coordinator from every workhorse of
the tab, and each item names its checkout.

The Codex child keeps `ARCHBOARD_URL` and `ARCHBOARD_NO_AUTOSTART` in its
environment, and it loses `ARCHBOARD_VAULT` (ADR 0049).

## Considered options

The first design gave each tab one repository, which the tab selected and kept
in its URL. A drill-down into another repository then opened a new tab. That
treats the browser as web pages. A person then manages tabs to read one system
that spans repositories, and an agent's `show` needs a rule that finds a tab.

One conversation for each tab, working in one checkout, keeps the workbench as
it is. But its workhorse reads another repository without that repository's
agent instructions and skills. That is the reason why a workhorse runs in its
checkout.

## Consequences

- ADR 0019 is amended. A tab session has one workhorse for each checkout,
  which runs in that checkout, and one coordinator that runs in no checkout.
  The child environment holds no vault.
- The implementation brief of ADR 0047 names the checkout and `-C`, not
  `ARCHBOARD_VAULT`.
- ADR 0048 is amended. A spoken stop is a workhorse stop of every running
  workhorse of the tab session, and the Stop control is one of the shown
  workhorse.
- The pane address, the picture cache, the socket messages and the change feed
  name the vault of each board.

## Canonical explanation actions

TASK-549.13 adds one local action for selection, relationship, flow, and proposal explanations.
The existing tab coordinator and checkout workhorse own execution.
Explanations remain temporary and author no architecture.
A later explicit edit requires normal claims and the complete stale-write token.
No additional agent process, session manager, or durable explanation store exists.
