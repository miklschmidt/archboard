# Author and record a canonical walkthrough

Use this recipe for a vault whose `model.json` owns its architecture.
A walkthrough is an ordered narrative with instructions for each reading.
Its `.walkthrough.json` file contains no geometry or copied architecture.

Read `archboard model read` before writing.
Keep its complete revision and stable target state identity.
Claim the model ID before adding a walkthrough.
Use the normal `model edit` request with the following change.
Supply its target, expectedRevision, operationId, writer, and claim from the current read and claim results.
Pass the doing line through `--doing`.

```json
{
	"type": "add-walkthrough",
	"walkthrough": {
		"name": "Request tour",
		"target": { "state": "current" },
		"beats": [
			{
				"title": "The gateway",
				"narrative": "The gateway accepts the request.",
				"reading": {
					"scope": "Shop#Gateway",
					"selection": ["Shop#Gateway"],
					"grammar": "architecture"
				}
			}
		]
	}
}
```

Archboard allocates the walkthrough and beat identities.
A beat states its complete reading.
Omitted selection, focus, and filters mean empty lists.
Omitted scope means the model roots.
No field inherits a previous beat's presentation state.
`focus` contains module identities.
`selection` contains stable subject identities.
`filters.relationships` and `filters.groups` contain keys to hide.
A sequence or flowchart beat also names an explicit qualified `flow` identity.
Its behavioral reading includes the complete flow.

The target accepts `state:"current"`, a stable proposal ID, or a unique proposal name.
An exact historical target uses `checkpoint` with a complete retained Git object ID.
The reader resolves that target once for every beat in the playback.
An exact target becomes an archive dependency of the retained narrative.
A missing exact dependency refuses a new signed write.

To edit a walkthrough, claim its identity and every existing beat identity.
Also claim the model ID when allocating or removing identities.
Use `edit-walkthrough` with its stable `subject` and optional metadata `set` or `clear:["summary"]`.
Its optional `beats` array states the complete intended order.
Keep an existing beat's `id` when changing or moving it.
Omit `id` only for a new beat.
An omitted old beat retires its identity.
`remove-walkthrough` removes the narrative and retires all its beats.
A draft uses the normal proposal edit intent with the same narrative changes.
Compact proposals store beat fields and placements independently.

```bash
archboard model read --walkthrough 'Request tour' -C <directory>
archboard model read --walkthrough 'Request tour' --checkpoint <checkpoint.id> --shared -C <directory>
archboard model record --walkthrough 'Request tour' --checkpoint <checkpoint.id> --out tour.mp4 -C <directory>
archboard semantic replay <talk-directory> --out tour-again.mp4
```

The first command reads without retaining history or changing inputs.
Its `playback` identifies the narrative, source revision, resolved revision, and each beat's availability.
A missing subject stops its affected beat with a recovery explanation.
A later model change requires an explicit restart to read the newer architecture.
Playback keeps the original returned model until that restart.

An explicit checkpoint pins both the narrative definition and the complete model used for playback.
`--shared` requires an exact retained target.
Retain the observed reading before recording or sharing it.
Use the existing publication workflow when another checkout needs that history.
Local retention alone establishes no remote availability.

Recording uses the existing local voice, talk storage, and frame renderer.
Every beat must be available before voice starts.
The recording artifact keeps one exact model and the narrative for offline replay.
That artifact is separate from authored walkthrough and proposal inputs.
The existing replay command needs its talk directory and voice file.
It reads no mutable model and starts no live voice session.

Voice narration reads the narrative source separately from its target.
The pane reports `playback.source`, `expectedSourceRevision`, and `expectedRevision` before voice starts.
The server resolves that source through the public architecture reader and compares both revision guards.
A narrative can name a target checkpoint that predates its definition.
The server keeps the complete capture for later beats, even when authored files change.
A changed or unavailable source or target refuses the start.
Reopen the walkthrough before starting narration again.

Live narration requests its first beat through the existing pane presentation port.
Canonical requests name the pane and walkthrough without a legacy board key.
The recording page drives its own steps and receives no first-beat request from the server.
Both paths narrate only available beats after the pane reports arrival.
Leaving the walkthrough ends its narration.
