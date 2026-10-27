# Render a canonical reading

Use the proposal's complete comparison to identify changed subjects before selecting a picture.
A render shows a selected architectural state.
The shipped canonical render schema accepts no comparison base, named view, title, legend, or layout flag.
Keep change evidence in `model compare` and describe the picture's state in its caption.

## Select and retain

Choose a module scope or focused subjects that explain the change with their direct context.
Use stable qualified module identities from `model read`.
For behavior, choose an explicit flow and sequence or flowchart grammar.
The complete flow preserves all participants and steps, independently of structural scope and filters.

Use the exact checkpoint returned by the completed proposal edit when it captures the intended state.
For current architecture, use `model retain` with the observed revision and a fresh retention intent.
Read that checkpoint and make sure that its selected state matches the intended picture.
A planning model without current architecture uses its proposal edit checkpoint rather than current-only retention.

```bash
archboard model read --checkpoint <checkpoint-id> -C <checkout>
archboard model render --checkpoint <checkpoint-id> --scope '<qualified-module-id>' --theme auto --out <artifact-directory>/after.svg -C <checkout>
archboard model rasterize --checkpoint <checkpoint-id> --scope '<qualified-module-id>' --out <artifact-directory>/look.png -C <checkout>
```

Add `--state <proposal-id>` only when an explicit state selection is needed within that retained input set.
Use the same selectors for SVG and PNG.
Keep artifacts in a temporary directory outside the checkout unless the repository intentionally tracks them.
Git-tracked SVG and PNG files carry reproducible canonical render recipes.
Use the consumer embed workflow when updating those artifacts.

## Inspect the picture

Read the receipt's model, revision, checkpoint, dimensions, and placed identities.
Make sure that the caption names the actual state and scope.
Open the PNG at the size that the reviewer will see.
If labels are unreadable, narrow the scope or provide separate pictures for distinct concerns.
Keep the full proposal intact.

Use one SVG with `--theme auto` when the receiving platform supports it.
Use PNG when its viewer cannot render SVG correctly.
Give each image alt text that explains its architectural point.
Use prose captions for titles and change descriptions.
Do not add unsupported flags or alter architecture to improve placement.

If Chromium is unavailable, keep the SVG and report that visual inspection remains incomplete.
A successful SVG export alone provides no visual inspection evidence.
Shared checkpoint reproducibility also requires explicit archive publication, independently of uploaded picture bytes.
