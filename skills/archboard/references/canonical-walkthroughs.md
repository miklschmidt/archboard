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
`filters.relationships` contains kinds to hide. Group regions are off by default, so `filters.groups` changes no picture.
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
archboard model replay <talk-directory> --out tour-again.mp4
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
An original saved talk stays exact retained history.
Replay draws what the talk kept, and it recreates no live writer.

Voice narration reads the narrative source separately from its target.
The pane reports `playback.source`, `expectedSourceRevision`, and `expectedRevision` before voice starts.
Narration waits until the server accepts that report.
The browser keeps Narrate unavailable while the picture draws.
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

## Write each beat

The voice explains a beat from its title, narrative and selection, beside the picture.
Make one point in each beat.
Let the title state that point ("Only the ledger sets items aside") and the narrative say what the picture cannot show.
Name modules as the model names them, and give the one number that the source states, such as a limit, a count or a timeout.
Select the two or three subjects that the beat is about.

## A newcomer's walkthrough

Use it when somebody new asks how one thing works.
The tour starts with the big picture, narrows to one module and one exchange, and ends on what to read next.

1. Write the answer as one sentence, "When you do this, this happens". Done: it names what the reader does and what they get.
2. Choose the path of four to ten modules and the flow that runs along it. Give each module a plain `responsibility`. Leave out helpers, configuration, types and tests. Done: every module and relationship that the answer rests on is on the path.
3. Open on the big picture. Omit `scope`, `visibility`, and `focus` so that the roots draw whole. Select the root module that holds the answer.
4. Grow the path beat by beat. A beat's `visibility` repeats the previous beat's modules and relationships and adds one to three more, and its `selection` names the additions. The first of these beats shows two modules. Done: the last one draws the whole path.
5. Show the one exchange in a sequence beat with its `flow`.
6. Add a beat where the path goes wrong, if the reader will meet that failure: what fails and what they see.
7. End on the answer sentence again, with one number that the source states and the module or flow to read next. Done: the last beat stands alone as the summary.

## A pull request's walkthrough

Use it for reviewers who have not read the code.
Put the change in a proposal, and target the walkthrough at it.
Write three to six beats, each a few sentences, so that the talk runs one to three minutes.

1. Read the diff against the merge base and write one sentence on why the pull request exists. Done: it names the need, not the files.
2. Run `archboard model footprint --base <merge-base> --state <proposal>`. Read the subject of a commit marked large before you give it a beat. Done: every changed module has a beat, or you can say why not.
3. Open with the why sentence and no selection. Then give the change that matters most a beat, and each other change one of its own. Name what the pull request did in the title. Name a removed module in the narrative, because a beat cannot select it.
4. End on the seam or invariant that deserves the closest look, and what to check there. Done: a reviewer can answer "what changed, and why" from the beats alone.

Record from the retained checkpoint as above. The archboard-pr skill attaches the video and places it in the pull request.
