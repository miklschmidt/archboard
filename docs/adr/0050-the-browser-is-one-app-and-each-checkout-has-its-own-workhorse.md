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

The navigator lists every repository identity that has a known checkout with a
vault. It also lists every untracked vault, under its registry name. Under each
entry are the boards of the vault in the chosen checkout of that identity.
Board names need to be unique only inside one vault, because the identity
groups them.

Each identity has a menu of its known checkouts. Choosing one is `repo use`,
so the choice is for the whole machine, and every tab follows it. The chosen
checkout of an identity can have no vault, or it can be gone. Then the row of
the identity says so, and the menu is the way out.

A pane can show a board of any listed repository, and the two panes of a tab
can show two repositories. The URL gives each pane its own repository
parameter beside its board, for example
`?paneA=Payments@proposed&repoA=github.com/acme/payments`. Thus the parser never
splits an identity and a board name out of one string, and both can hold `/`.
An untracked vault uses its registry name there. The URL holds no path.

A drill-down into another repository dives in its pane like any other
drill-down, and the breadcrumb leads back across repositories. If the target
identity has no known checkout on this machine, the pane does not open it. The
inspector says that the repository is not registered and how to register it.

When the chosen checkout of an identity changes, every pane that shows a board
of that identity reads it again from the new checkout's vault. A pane whose
board is not there says so.

## Agents and the browser

`browser show` from an agent in a checkout that is not chosen makes that
checkout the chosen one, and then it shows the board. Its answer says that it
changed the chosen checkout and names the checkout that it replaced. Two agents
in two worktrees of one repository take turns, and the last `show` wins. Only
`browser show`, `repo use` and the navigator's menu change the choice. A board
command never does.

`browser panes` reports every pane on the screen. Each pane gives its
repository identity and checkout, and says whether it shows the caller's own
checkout.

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

The agent dock shows one workhorse conversation, the shown conversation. It is
the conversation of the checkout that the user last activated: by focusing a
pane, opening a board from the navigator, or drilling down. The dock's list of
workhorses also chooses it. The list names each live workhorse of the tab
session by repository and checkout. It marks a workhorse that waits for an
approval or for the user. Nothing that an agent does to a pane changes the
shown conversation, so that it never changes while somebody types.

A typed message goes to the workhorse of the shown conversation, and it starts
one if that checkout has none. New conversation replaces that workhorse, and an
old thread is never resumed. A coordinator turn shows in the conversation of
the workhorse that it delegated to. A turn that delegated nothing shows in the
conversation that was shown while it ran.

The Stop control stops the workhorse of the shown conversation. A spoken stop
stops every running workhorse of the tab session, because the voice speaks for
the whole app. Workhorse news reaches the coordinator from every workhorse of
the tab, and each item names its checkout. Pane news from both panes reaches the
coordinator as before.

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

If an agent's move of a pane switched the conversation, the conversation changed
under the person who types in it. Pane news already excludes what an agent
causes, for the same reason.

## Consequences

- ADR 0019 is amended. A tab session has one workhorse for each checkout,
  which runs in that checkout, and one coordinator that runs in no checkout.
  The list of workhorses is not the thread selector that TASK-373 removed. It
  lists only the live workhorses of the tab session, and nothing resumes an old
  thread. The child environment holds no vault.
- ADR 0047 is amended. The implementation brief names the checkout and `-C`,
  not `ARCHBOARD_VAULT`.
- ADR 0048 is amended. A spoken stop is a workhorse stop of every running
  workhorse of the tab session, and the Stop control is one of the shown
  workhorse.
- The pane address, the picture cache, the socket messages and the change feed
  name the vault of each board.

## Canonical explanation actions

TASK-549.13 adds one local action for selection, relationship, flow, and proposal explanations.
The public architecture reader captures the model, state or checkpoint, complete revision, stable subjects, and reading intent.
A proposal capture keeps the actual comparison base and its independent revision.
The action addresses the actual canonical vault after foreign repository navigation.
It never infers that address from the initial legacy pane.

The existing tab coordinator and checkout workhorse own execution.
The workhorse queue holds captured input and existing provider notifications supply one textual answer.
The browser and voice consume that same answer.
The existing pane socket announces temporary answer changes only to panes in the same tab.
The browser reads the latest deliberate invocation or retry through its existing query cache.
That result names its captured vault, so later controls stay attached after foreign navigation.
The answer panel keeps its original model, state, subjects, and revision visible.
It owns dismissal and no architecture content.
Explicit retry reuses the capture, even after navigation or source changes.
Uncertain delivery prevents retry until its outcome is known.
Cancellation uses queue deletion or interruption of the exact correlated turn.

Canonical pane reports carry reading intent without architecture content.
Their existing report sequence rejects older navigation reports.
The coordinator context source receives accepted reports directly.
Conversation selection stays inside the workbench operation that owns its allowed checkouts and tab state.
The server translates the complete request without assembling those internal owners.

Explanations remain temporary and author no architecture.
A later explicit edit requires normal claims and the complete stale-write token.
No additional agent process, session manager, or durable explanation store exists.
