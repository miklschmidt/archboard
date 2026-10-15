# Post the body

Section 7 of the skill sends you here. The body is one section between
`<!-- archboard-pr:begin -->` and `<!-- archboard-pr:end -->`, and this file
says how to attach the picture and the video.

The picture is one `--theme auto` file, posted as a plain Markdown image
([why](renders.md#what-github-supports)). gh `--attach` uploads a file and
rewrites a Markdown reference to it. `--attach` needs gh 2.99 or later.
Without it, leave the picture and the video out of the body, and give the
user their paths.

In the body, reference each file by the absolute path that you give
`--attach`, each on a line of its own. For the picture, the alt text says what
it shows, as in `![Inside Board store: the lease table replaces lock
files](/tmp/pr/after.svg)`. Give the video a paragraph of its own:
`![](/tmp/pr/walkthrough.mp4)`. Inside a `<details>`, leave a blank line after
the `<summary>` line and before `</details>`, so that the lines between are
read as Markdown. gh replaces each path with the URL of the upload and keeps
the alt text.

```bash
gh pr create --title "<title>" --body-file "$tmp/body.md" --attach "$tmp/after.svg"
gh pr edit <number> --body-file "$tmp/body.md" --attach "$tmp/after.svg"
```

For a video, add `--attach "$tmp/walkthrough.mp4"`.

## Updating a body

Read the body with `gh pr view <number> --json body`. Keep the text outside
the markers, because it belongs to the author and the reviewers. Replace all
of the text between the markers with the new section, then post the whole
body with `gh pr edit`. Never add a paragraph to the old section: a body that
grows with each update reads as its history.

An earlier version of this skill wrote a `## Summary` heading above the begin
marker, and an Evidence or Merge Danger section below the end marker. Those
are part of the old body, not the author's text: replace them with the new
section too, so that the body has one set of sections.

News about the pull request, such as a CI fix or a rebase, goes in a comment
with `gh pr comment <number>`, never in the body.
