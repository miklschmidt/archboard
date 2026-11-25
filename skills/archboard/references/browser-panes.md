# Drive browser panes and temporary explanations

Use this reference only when steering a live browser pane with `browser show` or `browser panes`, or when answering a pointed screen question through `model explain`.

## Navigate a local agent pane

`browser show [model] --pane <pane>` opens a model in an existing pane.
If no browser is connected, it opens the canvas in the default browser and waits for its pane.
On a machine with no display, it refuses with `BROWSER_REQUIRED`. Give the user the address in the refusal.
The optional model must match the vault's identity or exact name.
Use `--module`, `--scope`, `--focus`, `--hide-kind`, `--grammar`, and `--flow` for its reading.
Use `--state`, `--checkpoint`, `--preview`, `--bookmark`, or `--legacy-address` for selection.
`--walkthrough <id> --beat <index>` requests a narrative at a zero-based beat.
`--input <file>` supplies complete reading JSON.

POST `/api/panes/show`, also `/api/browser/show`, accepts `{vault,pane,agent,session,reading}`.
`reading` uses the same selectors, plus optional `model` and `beat`.
The server resolves it before changing the pane or chosen checkout.
The `pane_model` message carries `{model,reading,revision,vault,repository}`.
The result carries `{success,model,reading,revision,repository,checkout,paneId}` and pane address fields.

`browser panes` reports `panes[].architecture` and `tabSessionId` for explanation and narrative guards.
Navigation can choose a checkout but cannot activate the tab's conversation.
For narratives, read [canonical walkthroughs](canonical-walkthroughs.md).

## Temporary explanations

An explanation capture fixes the reading that the agent answers.
It keeps subjects, complete revision, state or checkpoint, and reading intent together.
Reading intent includes scope, focus, relationship filters, group visibility, grammar, and optional flow.
`reading.groups` accepts exact visible group IDs, or `true` and `false` for all and none.
A compared capture also keeps its actual base and separate revision. Navigation cannot retarget it.

Before answering a screen question, run `browser panes`.
Read the selected pane's `architecture` report and `tabSessionId`.
If absent, ask the person to open the canonical reading before resolving a pointing request.
Use the reported `architecture.vault`, even after foreign navigation.
Keep `reading.referenceSubject` separate from temporary pointer selection.
Do not infer architecture from `paneKey`.

For a comparison, copy `model.comparison.revision.digest` into `request.expectedComparisonRevision`.
Omit it only when the observed model has no comparison.
Keep it with target and narrative-source revisions from that same reading.
A changed, missing, or newly appeared comparison returns `MODEL_CHANGED` before invocation.

Use `model explain` to request a new action from the local workhorse.
Pass `-C` for the directory that holds the reported vault.
Keep its complete `selection` and guards when reading further context.
If your queue names `captureFile`, read its complete JSON before answering.
The server removes that temporary file.
If it contains `explanation`, answer the accepted capture directly without another invocation.

```json
{
	"type": "invoke",
	"tabSessionId": "<reported-tab-session>",
	"selection": { "state": "current" },
	"request": {
		"actionId": "<new-action-identity>",
		"action": "explain-selection",
		"model": "Shop",
		"expectedRevision": "<complete-observed-revision-digest>",
		"subjects": ["Shop#Gateway"],
		"reading": {
			"scope": "Shop#Gateway",
			"focus": [],
			"relationshipKinds": ["sync"],
			"groups": true,
			"grammar": "architecture"
		}
	}
}
```

```bash
archboard model explain --input explanation.json -C <directory>
```

Other actions are `explain-relationship`, `trace-flow`, and `explain-proposal`.
Without an explicit flow, `trace-flow` can investigate without authoring one.
An explicitly unavailable flow refuses.
A proposal explanation requires the selected draft and comparison.
State and checkpoint selectors are exclusive.
Read progress through the same command:

```json
{
	"type": "read",
	"tabSessionId": "<reported-tab-session>",
	"actionId": "<original-action-identity>"
}
```

The result reports `captured`, `queued`, `running`, `completed`, `failed`, `cancelled`, or `unavailable`.
After navigation, the answer still names its original model, state, subjects, and revision.

Send `type:"latest"` with `tabSessionId` for the last invocation or retry.
Use returned `action.vault` for later reads, cancellation, and retry, even after navigation.
If the action queues on your own workhorse, end your turn so it can start.

If `action.retryable` is true, send `type:"retry"` with the original tab and action identity.
Retry preserves captured content despite navigation or source changes.
Uncertain delivery disables retry to prevent duplicate work.
Send `type:"cancel"` to remove its queue item or interrupt its exact turn.
Read until the provider reports the final outcome.

Explanations write no architecture and take no claims.
Answers last only within the local agent generation and tab lifetime.
If the user requests saving one, use a claimed edit with a fresh complete revision.
