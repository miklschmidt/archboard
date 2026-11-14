# Render review evidence

Use the complete proposal comparison to choose subjects that explain the change with their direct context.
Follow the consumer rendering recipe for selectors, comparison behavior, flows, and embedded artifacts.
Render accepts no explicit comparison base, named view, title, or layout flag.
Use `model compare` to identify the default base and name both states in the caption.

Choose the checkpoint through the consumer retention recipe for Current, drafts, and planning models.
Read the checkpoint before rendering and make sure that it selects the intended state:

```bash
archboard model read --checkpoint <checkpoint-id> -C <checkout>
archboard model render --checkpoint <checkpoint-id> --scope '<qualified-module-id>' --theme auto --out <artifact-directory>/after.svg -C <checkout>
archboard model rasterize --checkpoint <checkpoint-id> --scope '<qualified-module-id>' --out <artifact-directory>/look.png -C <checkout>
```

A checkpoint selects its recorded state, so omit `--state`.
Use the same selectors for SVG and PNG, with the default Blocks engine.
Keep artifacts outside the checkout unless the repository intentionally tracks them.

Read the receipt's model, revision, checkpoint, dimensions, and placed IDs.
Make sure that the caption matches its state and scope.
Open the PNG at the reviewer's viewing size.
If labels are unreadable, narrow the scope or use separate pictures without trimming the proposal.

Before you post the picture, match each added, changed and removed count in its legend with `model compare` and the diff.
An added subject needs source that the diff adds. If the legend counts more added subjects than that, the proposal documents existing code: model that code in Current first, then render again.

Use auto-theme SVG when the platform supports it, otherwise PNG.
Give images alt text that explains their architectural point. Use prose for titles and captions.

If Chromium is unavailable, keep the SVG and report incomplete visual inspection.
An SVG export alone proves no visual inspection.
For reproducible sharing beyond picture bytes, follow the parent skill's publication step.
