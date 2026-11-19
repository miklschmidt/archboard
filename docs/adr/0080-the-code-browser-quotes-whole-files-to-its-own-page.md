---
status: accepted
---

# The code browser quotes whole files to its own page

The owner decided this on 2026-11-19. It replaces the one quoting exception of [ADR 0046](0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md) ("Where the pass runs"): the source excerpt of remembered evidence.

## Context

Archboard goes from the picture to code: a module opens its bound code in an editor. The owner asked
for the other way too. A person who reads a file wants to see which modules own it, and to go from
a symbol in the code to the module in the picture. That needs a file tree and the whole text of a
file beside the picture.

ADR 0046 let one route quote text: the lines around a piece of remembered evidence
(`GET /api/code/source-lines`). A whole file is a larger quote, and a file can hold a secret. Once
the server quotes whole files, the excerpt is a few lines of a quote it already makes. The Archboard server answers any request from this
machine with no authentication.

The threat is another web page. A page of another origin could ask the server for a file, and the
browser would let it read the answer if the server allowed it. A process on this machine needs no
route: it reads the same files with the user's own rights.

## Decision

- Two routes serve the code browser, and `GET /api/code/source-lines` is gone. `GET /api/code/files` lists the files that Git lists in a
  registered checkout. `GET /api/code/file` quotes one whole file of a registered checkout and names
  the modules of a reading that own it.
- Only a page of the server's own origin reads either route. A request from another origin, or with
  no browser headers, is refused.
- Every guard of the excerpt stays. The file is resolved in a registered checkout, inside it before
  and after links resolve, and only a file. Git lists it, judged where its links lead. It is not one
  that the code check never reads: Terraform state, variable files, the `.terraform` directory and
  env files. It does not hold a Kubernetes Secret. It is no larger than 1 MiB. It is opened with
  `O_NOFOLLOW`. One operation holds these guards.
- One guard is new: the route refuses a file with a NUL byte or text that is not UTF-8.
- The evidence excerpt reads through the file route. The browser takes the lines round the
  evidence line from the whole text and cuts a long line itself. The restriction to places that
  remembered findings name is gone, because the person chooses the file, and a request that names
  no model reads no model and returns no owners.
- A refusal is no HTTP error. The answer is 200 with a refused source, because the owners of the
  file are still useful. A repository with no checkout on this machine is a 404 that says how to
  register one.
- The owners come from the bindings and the code facts, by the rule of ADR 0046 ("Bound code"): a
  symbol, then the file, then the deepest directory. They never depend on whether the text was
  quoted.
- The routes never log a path or the text of a file, and send no usage event.

## Considered and rejected

- **Quote only files that remembered evidence names.** The tree would show a few files. The owner
  asked to browse the code.
- **Keep the excerpt route beside the file route.** It would hold the same guards twice, under a
  restriction that protects nothing the file route does not already allow.
- **Let the browser read files itself.** The page has no file access, and the server already holds
  the checkout registry and the guards.
- **A token for each request.** The own-origin guard stops a page of another origin. A token adds
  a secret to keep, and does not stop a process that can read the files anyway.
- **Quote any file in the checkout, ignored files too.** An ignored file is where a person keeps a
  local secret. The tree lists what Git lists, as the code check reads it.
