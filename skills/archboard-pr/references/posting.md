# Post the body

Prepare the complete body and artifacts before publishing to the requested destination under existing authorization.
Use the parent skill's marked section and state comment.
Before upload, reference local artifacts through absolute paths in the body file.
Place each video in its own paragraph.
Inside details elements, keep a blank line after the summary and before the closing tag.

If installed gh supports attachments, use:

```bash
gh pr create --title '<title>' --body-file <artifact-directory>/body.md --attach <artifact-directory>/after.svg
gh pr edit <number> --body-file <artifact-directory>/body.md --attach <artifact-directory>/after.svg
```

Add the video as another attachment when present.
Otherwise, use an already-authorized upload route or return completed files to the user.
Never publish unresolved local paths.

For updates, read the existing body before replacing the marked section.
Preserve author and reviewer text outside it.
Replace the section rather than appending another description.
Remove earlier generated Summary or Evidence duplicates outside the markers, while preserving unrelated author text.

Read the posted body back.
Make sure that the markers occur once, pictures use uploaded URLs, and each video URL occupies its own paragraph.
Report unavailable artifacts or history publication through the parent skill's handoff rules.
