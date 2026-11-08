# The address, the last reading or a chooser decide the start

Status: Accepted through TASK-559.07 on 2026-10-31.

## Context

ADR 0049 lets one server serve every vault, and every call names its vault. A
page therefore needs a vault before it can draw a pane. The server answered with
`/api/served-vault`: the vault of the first ready repository, by name. On one
machine the plain address opened an unrelated repository on a migration notice,
and a second pane did the same.

## Decision

The browser decides the start, once, before any pane exists. A pane socket names
its vault in its first message, so the start must end in a vault or in no pane.
The first of these rules that applies decides:

1. An address opens what it names: a repository, a model that a repository
   holds, or the only repository that this machine lists.
2. The last reading of this browser opens. It opens only if each of its panes
   can read a ready repository that still holds the same model.
3. One listed repository with a model opens, because there is nothing to choose.
4. The repository chooser opens, and the page has no pane until the reader chooses.

The browser keeps the last reading in its local storage. Local storage belongs to
one origin, and an origin is one server. The last reading stays out of the shared
registry, so a checkout cannot change what another reader starts on.

A repository with no model, or with a legacy model, opens only if somebody asks
for it. `repoX` alone names such a pane in an address.

`/api/served-vault` and the `served` field of `/api/repositories` are gone. The
server no longer holds a default vault. A pane socket whose vault is gone moves to
the home of that vault, and the server refuses a socket with no home.

## Rejected

The server remembers the last reading. A server serves every browser of the
machine, so one reader's reading then opens for another.

The chooser opens on a machine with one repository. It offers one row. It also
leaves an agent's `browser show` with no pane on a machine that has nothing to
choose.

A pane opens with no vault and moves later. A vault then becomes optional in every
pane session, for one state that lasts until the first choice.

## Consequences

- A chooser page has no pane. `browser show` answers `BROWSER_REQUIRED` until the
  reader chooses, on a machine with several repositories and no last reading.
- A reader's open moves a pane into a repository with no model or a legacy model,
  so that the pane can state what the repository lacks. An agent's show stays
  refused, because an agent must read the refusal.
- `archboard init` (named `install-skill` until TASK-601) registers the repository that it sets up, so that the
  command the empty start shows makes a row appear.
