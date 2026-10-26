# Ephemeral boards

An ephemeral board is drawn only to explain one pull request. It lives in a
temporary vault that an Archboard server of its own serves, and both are gone
once the picture and the video are made. Section 1 of the skill decides when to draw one, and
section 3 lists the steps. This file gives the commands, what they were checked
against, and which comparisons work.

## Why a vault of its own

- A board that the repository's vault holds is part of the architecture that
  the vault states. It shows in every pane and, when Git tracks the vault, in
  the vault's history. No command deletes a board, except `semantic record
  --discard` after a recording.
- A command reaches the server at `ARCHBOARD_URL` and names its vault on every
  call. It finds that vault from `-C <dir>`, or else from its working
  directory (see "Make it"). So it reads and writes the vault it names,
  whichever server answers. With `ARCHBOARD_URL` left at the repository's
  server, that server holds the claims, panes and disk watch of the
  ephemeral vault in its memory. So an ephemeral board needs `-C` on every
  command and a server of its own, and `semantic config` proves which vault the
  commands name.
- A copy of the vault's `config.yaml` gives the ephemeral vault the same kinds,
  levels, groups and evidence rules, so the board draws as the vault's boards
  do.

## Make it

```bash
tmp=$(mktemp -d)
config=$(archboard semantic config | jq -r .configurationFile)
mkdir -p "$tmp/.archboard/vault/.archboard"
cp "$config" "$tmp/.archboard/vault/.archboard/"
port=$(bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true)')
real_url=${ARCHBOARD_URL:-}
export ARCHBOARD_URL="http://127.0.0.1:$port"
archboard start
archboard -C "$tmp" semantic config | jq -r '.configurationFile, .vault'   # must name a file inside "$tmp/.archboard/vault"
```

- A vault is the `.archboard/vault` directory of a directory. `-C "$tmp"`
  makes a command find `$tmp/.archboard/vault`. `$tmp` is outside any git
  checkout, so the nearest enclosing vault counts. Make sure that `TMPDIR` is
  not inside a checkout. Inside a checkout, only the vault at the checkout root
  counts, and the command refuses.
- Give `-C "$tmp"` to every `archboard` command that reads or writes the
  ephemeral board, until the teardown. A command without it reaches the vault of
  your working directory on the ephemeral server. `-C` changes only where the
  vault is found. A relative `--input` or `--out` still resolves against the
  working directory.
- The first command with `-C "$tmp"` registers the vault as an untracked vault
  and prints one line about it to stderr. The answer's `vault.registered` says
  so. The registry is machine-wide, so the navigator of every server lists the
  vault until the teardown forgets it.
- `start` returned in under two seconds. The server draws and checks without a
  Codex sign-in. Recording needs one, and a server that is already running
  sees a sign-in made elsewhere only after a restart. Section 0 of the skill
  runs before this server starts, so it sees the sign-in.
- Nobody else writes the ephemeral vault, so no claim is needed. Every write
  still needs `--doing`, and every write after `semantic new` needs
  `--expect-version`.

## Draw it

The `archboard` skill's recipes apply unchanged, with `-C "$tmp"` on each
command: the sequence recipe for a flow, the architecture recipe for parts and
relationships. Read the base branch's code with `git show <base>:<path>` and
the head branch's code in the checkout.

1. **The base as the current variant.** `semantic new "<board>" --input base.json --doing "…"`
   with what the base branch does. Name each part as the vault's boards name
   it, and bind it to its code. A sequence carries its `sequence` view in the
   same write.
2. **The head as a draft.** `semantic branch "<board>" --as "<head branch>" --summary "<pull request title>" --expect-version 1 --doing "…"`,
   then `semantic edit "<board>" --variant "<head branch>" --expect-version 2 --doing "…" --input head.json`.
   Restate each continuing step, flow and relationship with the `id` from the
   answer to step 1. A step written without its id reads as removed and added.
3. **Check it** as the skill's section 2 step 6 does. `semantic compare`
   reports each step and relationship that is added, changed or removed.
   `semantic footprint` reads the `HEAD` of the checkout that this machine
   registered for the repository (`archboard repo list`), unless you add
   `--head <branch>`, which reads that branch from Git without a checkout. With
   `--variant`, add `--against <variant>` for what the proposal is read against.
   `check code` reads the files on disk there. So for `check code`, that
   checkout must have the head branch out.

Done: `compare` reports every change the diff makes to what the board draws,
and nothing else.

## What can be compared

The first three rows were run in October 2026, with a sequence board of a real
change in the archboard repository (the stop command keeping the pidfile of a
live process). The last two follow from the `archboard` skill's variants
reference and the CLI's commands:

| Shape                                                                              | Result                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One board: the base as current, the head as a draft                                | Works. Through the `sequence` view, the after render marks each added and changed step with a band and a pin, and the before render draws the base plain. `compare`, `footprint` and `check code --variant` answer. |
| The same board read through its architecture picture                               | Works. Without `--view`, the draft draws the parts and relationships with the changed relationship marked.                                                                                                          |
| A flow that the base does not have, on a board created with `"lifecycle": "draft"` | Draws plain, with no marks. `compare` refuses: the first draft has nothing to be read against. Draw the after render only.                                                                                          |
| Two boards, one for the base and one for the head                                  | Each is a current variant, which draws plain, and `compare` reads only variants of one board. So nothing is marked. Do not use it.                                                                                  |
| A copy of a vault board                                                            | No command copies a board, and only the CLI writes a board. Restate the parts that you need in the `semantic new` payload instead.                                                                                  |

A flow added to a proposal on a vault board stays in the vault after the
adoption. Add one there only when the flow is durable: a later reader of the
vault needs it.

## Render and record

Draw the picture with [renders](renders.md) while the server runs: the
commands are the same, with `-C "$tmp"`, the ephemeral board's name, its view
and the draft. Record a walkthrough with [walkthrough](walkthrough.md) the same way.
A recording on the ephemeral server worked: two beats, 51 s of talk, 3.9 MB,
about 80 s in all. Leave out `--discard`, because the whole vault is deleted
next, and do not remove the walkthrough after the recording. Keep the talk
with `--talk` in `$tmp`, outside the vault.

## Tear it down

Once the picture, the video, its chapters and its transcript are in `$tmp`:

```bash
archboard stop
ARCHBOARD_NO_AUTOSTART=1 archboard status   # exit 3, "running": false
archboard repo forget "$tmp"
rm -rf "$tmp/.archboard"
if [ -n "$real_url" ]; then export ARCHBOARD_URL="$real_url"; else unset ARCHBOARD_URL; fi
git status --short -- "$(archboard semantic config | jq -r .vault.path)"   # when Git tracks the vault: nothing from this work
```

- `ARCHBOARD_NO_AUTOSTART=1` keeps `status` from starting a new server over a
  vault that is about to be deleted.
- `stop` removes the server's pidfile. The state directory keeps a small Codex
  directory for the port, `codex-workbench/canvases/<port>` (12 kB measured),
  as it does for every server that ran there.
- Keep the rest of `$tmp` until the pull request is posted: the body and the
  files that section 7 attaches are there.

Done: the ephemeral server is stopped, its vault is forgotten and deleted,
`ARCHBOARD_URL` names what it named before, and the repository's vault is
unchanged.

## What the body says about it

Nothing. The reader needs the picture, not where it was drawn. The state
comment is `<!-- archboard-pr ephemeral -->`, which tells the agent of an
update to draw the board again from the code.

The board's JSON is not attached. The draft's payload names the ids that the
base's write minted, so it does not replay on a new board. `semantic new` takes
a stated architecture (its `--help` lists the fields), not the family that
`semantic show` prints. The code is the source: drawing again from it is the
same work as drawing the first time.
