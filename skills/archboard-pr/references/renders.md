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

In a stack, read the base that `model compare` reports.
If it is the lower layer's proposal, the marks show only this layer's change.
If it is Current or an older state, the caption names the marks that lower layers add.
If the picture shows behavior from later layers, the caption says so.

Before you post the picture, match each added, changed and removed count in its legend with `model compare` and the diff.
Each added module with a binding needs source that the diff adds. An added module without a binding, such as an external service, needs none.
For a mark that the caption gives to a lower layer, use that layer's diff.
If an added module binds code that exists at the base, the proposal documents existing code: model that code in Current first, then render again.

Then give a reviewer with no context, such as a fresh subagent, the picture, its caption, and the diff.
Ask it to trace the changed route and to name what this PR changes and what it inherits.
If its answer differs from the diff, repair the picture or caption, and ask a new reviewer.

Use auto-theme SVG when the platform supports it, otherwise PNG.
Give images alt text that explains their architectural point. Use prose for titles and captions.

If Chromium is unavailable, keep the SVG and report incomplete visual inspection.
An SVG export alone proves no visual inspection.
For reproducible sharing beyond picture bytes, follow the parent skill's publication step.
