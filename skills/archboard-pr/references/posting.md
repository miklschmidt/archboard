# Post the body

Prepare the complete body and artifacts before publishing.
Use the PR's requested destination and existing posting authorization.
Keep one section between `<!-- archboard-pr:begin -->` and `<!-- archboard-pr:end -->`.

The body references each local artifact by its absolute path before upload.
Use descriptive alt text for pictures.
Place each video in its own paragraph.
Keep a blank line after a details summary and before its closing tag.

Use attachment support when the installed gh exposes it:

```bash
gh pr create --title '<title>' --body-file <artifact-directory>/body.md --attach <artifact-directory>/after.svg
gh pr edit <number> --body-file <artifact-directory>/body.md --attach <artifact-directory>/after.svg
```

Add the video as another attachment when one exists.
If attachment support is unavailable, use another already-authorized upload route or return the completed files to the user.
Keep unresolved local paths out of a published body.
Standalone artifact upload does not publish a checkpoint's independent archive.
Use the consumer history workflow for authorized reproducible sharing.

## Update an existing body

Read the existing body before replacing its marked section.
Preserve author and reviewer text outside the markers.
Replace the complete generated section rather than appending another description.
An earlier generated Summary or Evidence outside the markers belongs to that generated section.
Remove such duplicate generated sections while preserving unrelated author text.

Read the posted body back.
Make sure that the markers occur once, image references use uploaded URLs, and each video URL occupies its own paragraph.
Report any unavailable artifact or history publication accurately.
