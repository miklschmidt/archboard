# Archboard GitHub Actions

Two composite actions run the `archboard` CLI from npm on a pull request. They need no build step:
Node 22.18 or later runs their TypeScript as it is.

| Action                                       | What it does                                                                        | Permissions                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `miklschmidt/archboard/actions/check`        | Runs `archboard check` as a gate, and puts each finding on the pull request's diff. | `contents: read`                         |
| `miklschmidt/archboard/actions/pull-request` | Comments on the pull request with its proposal and its footprint, as text.          | `contents: read`, `pull-requests: write` |

The docs hold every input and output, and workflows to copy:

- [The Actions reference](https://miklschmidt.github.io/archboard/docs/reference/actions/), generated from each `action.yml`.
- [The check as a gate](https://miklschmidt.github.io/archboard/docs/gate/) and [architecture on pull requests](https://miklschmidt.github.io/archboard/docs/pull-requests/).

## Pin a release

Each release of Archboard tags this repository, such as `v0.3.0`, and the Actions of that release
are at that tag. Pin each Action to the commit SHA of the tag, with the tag in a comment. The
pull-request action holds a token that can comment, so pin it as you pin any third-party action:

```yaml
- uses: miklschmidt/archboard/actions/check@<commit SHA of the tag> # v0.3.0
```

The docs examples carry the SHA of the latest release. A tag can move, and a SHA cannot.

## Take the report as a file

The pull-request action can write its report to a file in place of the comment. Set `report-file`,
and the action writes the Markdown that it would post to that file. It posts and changes no comment
and writes no job summary, so the job needs only `contents: read`. Its `report` output names the
file, and a later step puts the report where you want it, such as the job summary:

```yaml
- uses: miklschmidt/archboard/actions/pull-request@<commit SHA of the tag> # v0.3.0
  id: architecture
  with:
    report-file: ${{ runner.temp }}/architecture.md
- if: always() && steps.architecture.outputs.report != ''
  run: cat "$REPORT" >> "$GITHUB_STEP_SUMMARY"
  env:
    REPORT: ${{ steps.architecture.outputs.report }}
```

`always()` runs the last step also when the plan check fails the action's step.

## This repository

[`.github/workflows/architecture.yml`](../.github/workflows/architecture.yml) runs both Actions on
each pull request of this repository. Its `cli` input names `./bin/archboard`, so the Actions run the
CLI of the commit under review instead of a published release.
