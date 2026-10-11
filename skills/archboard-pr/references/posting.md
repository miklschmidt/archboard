# Post the explainer

Section 5 of the skill sends you here. It says where the explainer goes in the
body; this file says how to attach the renders and the video.

A render follows the reader's GitHub theme only inside a `<picture>` element.
gh `--attach` uploads a file and rewrites only a Markdown reference to it, so
the `<picture>` is written in a second pass. `--attach` needs gh 2.99 or
later. Without it, leave the renders and the video out of the body, and give
the user their paths.

1. **Upload.** In the section, reference each file by the absolute path that
   you give `--attach`, each on a line of its own. For a render, use the file
   name as alt text, as in `![after-light](/tmp/pr/after-light.svg)`. Give the
   video a paragraph of its own: `![](/tmp/pr/walkthrough.mp4)`. Inside a
   `<details>`, leave a blank line after the `<summary>` line and before
   `</details>`, so that the lines between are read as Markdown. gh replaces
   each path with the URL of the upload and keeps the alt text.

   ```bash
   gh pr create --title "<title>" --body-file "$tmp/body.md" --attach "$tmp/after-light.svg" --attach "$tmp/after-dark.svg" --attach "$tmp/before-light.svg" --attach "$tmp/before-dark.svg"
   gh pr edit <number> --body-file "$tmp/body.md" --attach "$tmp/after-light.svg" --attach "$tmp/after-dark.svg" --attach "$tmp/before-light.svg" --attach "$tmp/before-dark.svg"
   ```

   For a video, add `--attach "$tmp/walkthrough.mp4"`.

2. **Pair.** Read the body back with
   `gh pr view <number> --json body --jq .body > "$tmp/posted.md"`. Replace
   each light and dark pair of image lines with one `<picture>`, using the two
   uploaded URLs. Then write the body back with
   `gh pr edit <number> --body-file "$tmp/posted.md"`, without `--attach`.

   ```text
   <a href="<light URL>"><picture>
   <source media="(prefers-color-scheme: dark)" srcset="<dark URL>">
   <source media="(prefers-color-scheme: light)" srcset="<light URL>">
   <img alt="<what the render shows>" src="<light URL>">
   </picture></a>
   ```
