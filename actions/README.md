# Archboard GitHub Actions

Two composite actions run the published `@archboard/cli` on a pull request. They need no build step:
Node 22.18 or later runs their TypeScript as it is.

| Action                                       | What it does                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `miklschmidt/archboard/actions/check`        | Runs `archboard check` as a gate, and puts each finding on the pull request's diff.                   |
| `miklschmidt/archboard/actions/pull-request` | Comments on the pull request with its proposal, the architecture before and after, and its footprint. |

The examples use `@main`. Pin each action to a commit SHA of this repository, as you pin any
third-party action, because the pull-request action holds a token that can write.

## The check as a gate

`archboard check` exits 0 when nothing is wrong, 1 when a semantic diagnostic or a warning remains,
and 2 or more when it could not run (usage error, refusal, outside any Git checkout, server
unreachable: 3). In a checkout without a vault only the embeds check runs. Information findings
never fail it.

```yaml
name: Architecture
on: pull_request
permissions:
  contents: read
jobs:
  archboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: miklschmidt/archboard/actions/check@main
```

The action annotates each finding on the diff. A semantic diagnostic is an error, a code or embeds
warning is a warning, and information is a notice. A finding that rests on code or configuration
carries each end of its evidence with the excerpt of the line and one line around it. When a finding
crosses a network hop, each annotation carries the code and manifest evidence.
It annotates both places when they belong to the checked repository. A finding with no evidence is
annotated at the vault file it names. The job summary lists the counts, up to 100 findings with links
to the findings reference, evidence for the first 30 errors and warnings, and what the check did not read.

GitHub shows 10 annotations of each level in a step. The summary names omitted entries.
The complete JSON report is at the `report` output. Upload that file as an artifact to keep it for review.

| Input               | Default   | Meaning                                                                                                  |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `version`           | `latest`  | The `@archboard/cli` version to install.                                                                 |
| `working-directory` | `.`       | The checkout whose vault is checked, relative to the workspace.                                          |
| `checks`            | `all`     | `all`, `semantics`, `code` or `embeds`.                                                                  |
| `args`              |           | Extra arguments, such as `--every-draft`. Quotes group words; no shell runs them.                        |
| `repos`             |           | More checkouts to register, one path per line.                                                           |
| `fail-on`           | `warning` | `warning` fails the step on exit 1. `never` reports only. A check that cannot run always fails the step. |
| `allow-codes`       |           | Codes, separated by newlines or commas, that are shown and never block.                                  |
| `node-version`      | `22`      | The Node.js version.                                                                                     |

Outputs: `exit-code`, `errors`, `warnings`, `information`, and `report`, the path of the saved JSON
answer.

`allow-codes` keeps a finding on the pull request without blocking it. The finding keeps its annotation
and its row in the summary, marked allowed. With `fail-on: warning`, the step fails only when an
error or a warning with another code remains.

```yaml
- uses: miklschmidt/archboard/actions/check@main
  with:
    allow-codes: |
      RELATIONSHIP_UNDRAWN
      CALLER_UNDRAWN
```

## A platform setup with an infrastructure checkout

A bound module names its repository by identity, and the check reads a network hop on both sides
only when it can read both checkouts. Check out the infrastructure repository beside the
application and list it in `repos`.

```yaml
steps:
  - uses: actions/checkout@v5
    with:
      path: app
  - uses: actions/checkout@v5
    with:
      repository: my-org/infrastructure
      path: infrastructure
      token: ${{ secrets.INFRASTRUCTURE_READ_TOKEN }}
  - uses: miklschmidt/archboard/actions/check@main
    with:
      working-directory: app
      repos: infrastructure
```

The action annotates only files in the repository that the pull request changes.
The message and job summary also carry excerpts from the other checkout.

## The pull request report

The action comments on the pull request with the proposal it carries, the architecture at the base
and at the head as SVG, the footprint of the change, and a link to the map. It keeps one comment and
updates it on each push. When a push leaves the head without a vault, the comment says so. The plan is what the proposal changes against the current architecture at
the base: each module that it adds, removes or changes, and both ends of each relationship or flow
step that it adds, removes or changes. It uses only `model proposals`, `model read`,
`model footprint` and `model render`.

```yaml
name: Architecture report
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled, edited]
permissions:
  contents: write # pushes the pictures to the archboard-assets branch
  pull-requests: write # posts the comment
jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: miklschmidt/archboard/actions/pull-request@main
        with:
          out-of-plan: fail
```

The proposal is, in order, the `state` input, the `state` attribute of the
`<!-- archboard-pr model="…" state="…" … -->` marker in the pull request description, the only draft
proposal of the model, or none. With a proposal, the footprint has three lists: planned and changed,
changed outside the plan, and planned but unchanged. With none, the comment lists the changed modules
and nothing is out of plan.

| Input               | Default                  | Meaning                                                               |
| ------------------- | ------------------------ | --------------------------------------------------------------------- |
| `version`           | `latest`                 | The `@archboard/cli` version to install.                              |
| `working-directory` | `.`                      | The checkout whose vault is read.                                     |
| `repos`             |                          | More checkouts to register, one path per line.                        |
| `state`             |                          | The proposal, by identity or name.                                    |
| `out-of-plan`       | `warn`                   | `warn` annotates, `fail` fails the step, `off` does not judge.        |
| `override-label`    | `archboard: out of plan` | With `out-of-plan: fail`, the label that lets a pull request through. |
| `github-token`      | `${{ github.token }}`    | The token that comments and pushes the pictures.                      |
| `assets-branch`     | `archboard-assets`       | The orphan branch for the pictures, under `pr-<number>/<head sha>/`.  |
| `node-version`      | `22`                     | The Node.js version.                                                  |

A pull request from a fork gets a read-only token. The comment is still posted when the token
allows it, without pictures, and says why. When even the comment is refused, the report is in the
job summary. The pictures are embedded from `raw.githubusercontent.com`. In a private repository they may not
load there, because that host asks for a token. The comment also links to the vault on github.com,
which opens for members of the repository.
