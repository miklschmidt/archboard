---
status: accepted
---

# Code targets resolve at presentation, and local opening is a server capability

A board persists one portable binding: repository identity, repo-relative path,
branch, commit, and confirmation time. It never persists whether that binding is
local or remote, an absolute path, an internal action URL, or a GitHub URL.
Those are answers about the machine that presents the board. They are not facts
about the board.

## The decision

Every outbound presentation resolves each binding afresh. A registered checkout
gets an internal code target. Two conditions apply: its repository identity
still matches, and the bound real path exists inside that checkout. Files and
directories are both valid.

If that local target is unavailable and the repository identity starts with
`github.com/`, presentation derives an HTTPS target. The target uses the
recorded commit first. If the binding has none, it uses the recorded branch,
then `HEAD`. Other repository hosts get no remote target. Adding, moving, or
removing a checkout changes the next presentation without rewriting the note.
Human-authored Excalidraw links keep their ordinary browser behavior.

An internal code target identifies the board and element, not a path. The
frontend intercepts its activation and sends a same-origin POST to the loopback
Archboard server. Loopback means that the server accepts only requests from this
machine. The server re-reads the element's canonical binding and makes sure
again that the checkout and repository identity are valid. It resolves the real
path and refuses a symlink that escapes the checkout. The server opens nothing
in four cases:

- A cross-origin request.
- A GET with the same parameters.
- An arbitrary absolute path from the browser.
- An element without a resolvable binding.

The server owns one machine-wide opener because the server launches the
application. A custom opener
is an executable plus an argument list that contains `{path}`. It is never a
shell command. The setting lives outside the vault, survives a restart, and
applies to every pane immediately.

## Rejected alternatives

Persisting `file://` URLs, GitHub URLs, or local-versus-remote state makes a
portable board describe one machine. If checkout availability changes, that
description goes stale. Letting the browser send an absolute path turns the
loopback server into a general file-opening service. Free-form shell commands
make quoting and repository-controlled path text part of command execution. The
decision also rejects browser-native `file://` navigation, because ordinary web
pages cannot reliably open those targets. That is the failure this decision
replaces.

## Consequences

The runtime target is a presentation overlay. It must be stripped before every
note write, held write, snapshot, or browser change report becomes canonical.

## Amendment of 2026-11-03: a file an agent's answer names

Codex writes a local file in its answer as a markdown link to the file's
absolute path. The browser reads such a link as a page of the
Archboard server, so the link went nowhere. The conversation and an explanation
now send the path and its line to the same open route, through the vault of the
focused pane.

The server opens that path only as a binding of the vault would open it. It
finds the innermost checkout that holds the real path among the checkouts that
the vault reads, and it resolves the path in that checkout through the binding
resolver. A path in no such checkout, or a link inside a checkout that leads out
of it, opens nothing. So the browser still
cannot make the server open an arbitrary file: it reaches only what a binding of
the vault can already reach. A failed open offers no GitHub link, because the
answer read the checkout's working tree, not a recorded ref.
