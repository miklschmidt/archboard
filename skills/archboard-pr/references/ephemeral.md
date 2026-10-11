# Ephemeral boards

An ephemeral board is drawn only to explain one pull request. It lives in a
temporary vault that an Archboard server of its own serves, and both are gone
once the renders and the video are made. Section 1 of the skill decides when to draw one, and
section 3 lists the steps. This file gives the commands, what they were checked
against, and which comparisons work.

## Why a vault of its own

- A board that the repository's vault holds is part of the architecture that
  the vault states. It shows in every pane and, when Git tracks the vault, in
  the vault's history. No command deletes a board, except `semantic record
--discard` after a recording.
- A command reaches the server at `ARCHBOARD_URL`, and that server keeps the
  vault that it started with. Nothing checks that the command's
  `ARCHBOARD_VAULT` is that vault. With `ARCHBOARD_VAULT` set to a temporary
  vault and `ARCHBOARD_URL` left at the repository's server, `semantic config`
  answered with the repository's `configurationFile` (checked in October
  2026). A write sent that way goes to the repository's vault. So an ephemeral
  board needs both variables and its own server, and `semantic config` proves
  which vault the server holds.
- A copy of the vault's `config.yaml` gives the ephemeral vault the same kinds,
  levels, groups and evidence rules, so the board draws as the vault's boards
  do.

## Make it

```bash
tmp=$(mktemp -d)
real_vault=$ARCHBOARD_VAULT real_url=${ARCHBOARD_URL:-}
mkdir -p "$tmp/vault/.archboard"
cp "$real_vault/.archboard/config.yaml" "$tmp/vault/.archboard/"
port=$(bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true)')
export ARCHBOARD_VAULT="$tmp/vault" ARCHBOARD_URL="http://127.0.0.1:$port"
archboard start
archboard semantic config | jq -r .configurationFile   # must print "$tmp/vault/.archboard/config.yaml"
```

- If your shell does not keep variables from one command to the next, put
  `ARCHBOARD_VAULT=… ARCHBOARD_URL=…` in front of every `archboard` command
  until the teardown. One command without them reaches the repository's server.
- `start` returned in under two seconds. The server draws and checks without a
  Codex sign-in. Recording needs one, and a server that is already running
  sees a sign-in made elsewhere only after a restart. Section 0 of the skill
  runs before this server starts, so it sees the sign-in.
- Nobody else writes the ephemeral vault, so no claim is needed. Every write
  still needs `--doing`, and every write after `semantic new` needs
  `--expect-version`.

## Draw it

The `archboard` skill's recipes apply unchanged: the sequence recipe for a
flow, the architecture recipe for parts and relationships. Read the base
branch's code with `git show <base>:<path>` and the head branch's code in the
checkout.

1. **The base as the current variant.** `semantic new "<board>" --input base.json --doing "…"`
   with what the base branch does. Name each part as the vault's boards name
   it, and bind it to its code. A sequence carries its `data-flow` view in the
   same write.
2. **The head as a draft.** `semantic branch "<board>" --as "<head branch>" --summary "<pull request title>" --expect-version 1 --doing "…"`,
   then `semantic edit "<board>" --variant "<head branch>" --expect-version 2 --doing "…" --input head.json`.
   Restate each continuing step, flow and relationship with the `id` from the
   answer to step 1. A step written without its id reads as removed and added.
3. **Check it** as the skill's section 2 step 6 does. `semantic compare`
   reports each step and relationship that is added, changed or removed.
   `semantic footprint` reads the `HEAD` of the checkout that this machine
   registered for the repository (`archboard repo list`), and `check --code`
   reads the files on disk there. So that checkout must have the head branch
   out.

Done: `compare` reports every change the diff makes to what the board draws,
and nothing else.

## What can be compared

The first three rows were run in October 2026, with a sequence board of a real
change in the archboard repository (the stop command keeping the pidfile of a
live process). The last two follow from the `archboard` skill's variants
reference and the CLI's commands:

| Shape                                                                              | Result                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One board: the base as current, the head as a draft                                | Works. Through the `data-flow` view, the after render marks each added and changed step with a band and a pin, and the before render draws the base plain. `compare`, `footprint` and `check --code --variant` answer. |
| The same board read through its architecture picture                               | Works. Without `--view`, the draft draws the parts and relationships with the changed relationship marked.                                                                                                             |
| A flow that the base does not have, on a board created with `"lifecycle": "draft"` | Draws plain, with no marks. `compare` refuses: the first draft has nothing to be read against. Draw the after render only.                                                                                             |
| Two boards, one for the base and one for the head                                  | Each is a current variant, which draws plain, and `compare` reads only variants of one board. So nothing is marked. Do not use it.                                                                                     |
| A copy of a vault board                                                            | No command copies a board, and only the CLI writes a board. Restate the parts that you need in the `semantic new` payload instead.                                                                                     |

A flow added to a proposal on a vault board stays in the vault after the
adoption. Add one there only when the flow is durable: a later reader of the
vault needs it.

## Render and record

Draw the renders with [renders](renders.md) while the server runs: the
commands are the same, with the ephemeral board's name, its view and the
draft. Record a walkthrough with [walkthrough](walkthrough.md) the same way.
A recording on the ephemeral server worked: two beats, 51 s of talk, 3.9 MB,
about 80 s in all. Leave out `--discard`, because the whole vault is deleted
next, and do not remove the walkthrough after the recording. Keep the talk
with `--talk` in `$tmp`, outside the vault.

## Tear it down

Once the renders, the video, its chapters and its transcript are in `$tmp`:

```bash
archboard stop
ARCHBOARD_NO_AUTOSTART=1 archboard status   # exit 3, "running": false
rm -rf "$tmp/vault"
export ARCHBOARD_VAULT="$real_vault"
if [ -n "$real_url" ]; then export ARCHBOARD_URL="$real_url"; else unset ARCHBOARD_URL; fi
git -C "$real_vault" status --short -- .     # when Git tracks the vault: nothing from this work
```

- `ARCHBOARD_NO_AUTOSTART=1` keeps `status` from starting a new server over a
  vault that is about to be deleted.
- `stop` removes the server's pidfile. The state directory keeps a small Codex
  directory for the port, `codex-workbench/canvases/<port>` (12 kB measured),
  as it does for every server that ran there.
- Keep the rest of `$tmp` until the pull request is posted: the body and the
  files that section 5 attaches are there.

Done: the ephemeral server is stopped, its vault is deleted, both variables
name what they named before, and the repository's vault is unchanged.

## What the explainer says about it

An ephemeral board has no `Open it` line, because no vault holds it. The
explainer's **About the picture** line says that the board is ephemeral, that
it was drawn from the code at the base and the head branch, and that an update
of the pull request draws it again from the code.

The board's JSON is not attached. The draft's payload names the ids that the
base's write minted, so it does not replay on a new board. `semantic new` takes
a stated architecture (its `--help` lists the fields), not the family that
`semantic show` prints. The code is the source: drawing again from it is the
same work as drawing the first time.
