---
status: accepted
---

# Code targets resolve at presentation, and local opening is a server capability

A board persists one portable binding: repository identity, repo-relative path,
branch, commit, and confirmation time. It never persists whether that binding is
local or remote, an absolute path, an internal action URL, or a GitHub URL. Those
are answers about the machine presenting the board, not facts about the board.

## The decision

Every outbound presentation resolves each binding afresh. A registered checkout
whose repository identity still matches and whose bound real path exists inside
that checkout gets an internal code target. Files and directories are both valid.
If that local target is unavailable and the repository identity starts with
`github.com/`, presentation derives an HTTPS target using the recorded commit
when present, then the recorded branch, then `HEAD`. Other repository hosts get
no remote target. Adding, moving, or removing a checkout changes the next
presentation without rewriting the note. Human-authored Excalidraw links keep
their ordinary browser behavior.

An internal code target identifies the board and element, not a path. The
frontend intercepts its activation and sends a same-origin POST to the loopback
canvas server. The server re-reads the element's canonical binding, revalidates
the checkout and repository identity, resolves the real path, and refuses a
symlink that escapes the checkout. A cross-origin request, a GET with the same
parameters, an arbitrary absolute path from the browser, or an element without
a resolvable binding opens nothing.

The server owns one machine-wide opener because the server launches the
application. Its initial value is the platform's native opener. A custom opener
is an executable plus an argument list containing `{path}`; it is never a shell
command. The setting lives outside the vault, survives a restart, and applies to
every pane immediately. The frontend settings panel provides platform and editor
presets, custom executable and argument fields, validation, and a test that opens
a chosen registered checkout root.

Activating a local target does not navigate away from the canvas or ask for a
second confirmation. A launch failure is shown on the canvas and may offer an
explicit GitHub action when the binding has one; it does not silently change the
person's requested action. A remote GitHub target opens as an ordinary HTTPS
link in a new browser tab.

## Rejected alternatives

Persisting `file://` URLs, GitHub URLs, or local-versus-remote state would make a
portable board describe one machine and would go stale when checkout availability
changed. Letting the browser send an absolute path would turn the loopback server
into a general file-opening service. Free-form shell commands would make quoting
and repository-controlled path text part of command execution. Browser-native
`file://` navigation was also rejected: ordinary web pages cannot reliably open
those targets, which is the failure this decision replaces.

## Consequences

The runtime target is a presentation overlay and must be stripped before every
note write, held write, snapshot, or browser change report becomes canonical.
Tests must therefore cover both halves together: the browser can activate local
file and directory targets or open the GitHub fallback, while the raw note still
contains only the portable binding and unrelated human-authored links.
