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
application. Its initial value is the platform's native opener. A custom opener
is an executable plus an argument list that contains `{path}`. It is never a
shell command. The setting lives outside the vault, survives a restart, and
applies to every pane immediately. The frontend settings panel provides platform
and editor presets, custom executable and argument fields, validation, and a
test that opens a chosen registered checkout root.

Activating a local target does not move away from the canvas or ask for a second
confirmation. The canvas shows a launch failure. If the binding has a GitHub
action, the launch failure can offer it as an explicit action. It does not
silently change the person's requested action. A remote GitHub target opens as
an ordinary HTTPS link in a new browser tab.

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
Tests must therefore cover both halves together. The first half is that the
browser can activate local file and directory targets or open the GitHub
fallback. The second half is that the raw note still contains only the portable
binding and unrelated human-authored links.
