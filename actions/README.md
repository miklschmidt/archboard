# Archboard GitHub Actions

Two composite actions run the `archboard` CLI from npm on a pull request. They need no build step:
Node 22.18 or later runs their TypeScript as it is.

| Action                                       | What it does                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `miklschmidt/archboard/actions/check`        | Runs `archboard check` as a gate, and puts each finding on the pull request's diff.                   |
| `miklschmidt/archboard/actions/pull-request` | Comments on the pull request with its proposal, the architecture before and after, and its footprint. |

The docs hold every input and output, and workflows to copy:

- [The Actions reference](https://miklschmidt.github.io/archboard/docs/reference/actions/), generated from each `action.yml`.
- [The check as a gate](https://miklschmidt.github.io/archboard/docs/gate/) and [architecture on pull requests](https://miklschmidt.github.io/archboard/docs/pull-requests/).

## Pin a release

Each release of Archboard tags this repository, such as `v0.3.0`, and the Actions of that release
are at that tag. Pin each Action to the commit SHA of the tag, with the tag in a comment. The
pull-request action holds a token that can write, so pin it as you pin any third-party action:

```yaml
- uses: miklschmidt/archboard/actions/check@<commit SHA of the tag> # v0.3.0
```

The docs examples carry the SHA of the latest release. A tag can move, and a SHA cannot.

## This repository

[`.github/workflows/architecture.yml`](../.github/workflows/architecture.yml) runs both Actions on
each pull request of this repository. Its `cli` input names `./bin/archboard`, so the Actions run the
CLI of the commit under review instead of a published release.
