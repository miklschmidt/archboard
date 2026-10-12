# Post the explainer

Section 5 of the skill sends you here. It says where the explainer goes in the
body; this file says how to attach the renders and the video.

Each render is one `--theme auto` file, which follows the reader's colour
scheme by itself, so a plain Markdown image shows it. gh `--attach` uploads a
file and rewrites a Markdown reference to it. `--attach` needs gh 2.99 or
later. Without it, leave the renders and the video out of the body, and give
the user their paths.

In the section, reference each file by the absolute path that you give
`--attach`, each on a line of its own. For a render, the alt text says what
the picture shows, as in `![Board store, Write path: the proposal adds Lease
table](/tmp/pr/after.svg)`. Give the video a paragraph of its own:
`![](/tmp/pr/walkthrough.mp4)`. Inside a `<details>`, leave a blank line after
the `<summary>` line and before `</details>`, so that the lines between are
read as Markdown. gh replaces each path with the URL of the upload and keeps
the alt text.

```bash
gh pr create --title "<title>" --body-file "$tmp/body.md" --attach "$tmp/after.svg" --attach "$tmp/before.svg"
gh pr edit <number> --body-file "$tmp/body.md" --attach "$tmp/after.svg" --attach "$tmp/before.svg"
```

For a video, add `--attach "$tmp/walkthrough.mp4"`.
