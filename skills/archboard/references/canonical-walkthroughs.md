# Author and record a canonical walkthrough

A walkthrough is an ordered narrative with complete reading instructions.
Its `.walkthrough.json` contains no geometry or copied architecture.
Use the [claimed edit recipe](canonical-models.md#edit-one-module-description) for the target, revision, operation identity, writer, claim, and doing line.
Claim the model ID when adding a walkthrough:

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

Archboard allocates walkthrough and beat identities.
Each beat states its complete reading. No presentation field inherits from another beat.
Omitted selection, focus, and filters mean empty lists. Omitted scope means model roots.

`focus` contains module IDs. `selection` contains stable subject IDs.
For relationships or messages, selection lights only those subjects and their ends.
Module-only selection lights those modules and connecting lines, with adjacent subjects one step fainter.

`filters.relationships` lists hidden kinds.
Group regions are off by default, so `filters.groups` changes no picture.
A sequence or flowchart beat requires a qualified `flow` and includes that complete flow.

The target accepts `state:"current"`, a stable proposal ID, or a unique proposal name.
For exact history, use `checkpoint` with a complete retained Git object ID.
Playback resolves the target once for all beats.
A retained narrative requires its exact target as an archive dependency.
If that dependency is missing, a new signed write refuses.

To edit, claim the walkthrough and all existing beats.
Also claim the model when adding or removing identities.
Use `edit-walkthrough` with stable `subject`, metadata `set`, or `clear:["summary"]`.

An optional `beats` array gives the complete intended order.
Keep `id` for continuing beats, including moves. Omit it only for new beats.
Omitting an old beat retires it.

`remove-walkthrough` retires the walkthrough and all beats.
Drafts use the proposal edit intent. Their stored changes track beat fields and placements separately.

## Read, record, and replay

Use these commands after authoring the walkthrough:

```bash
archboard model read --walkthrough 'Request tour' -C <directory>
archboard model read --walkthrough 'Request tour' --checkpoint <checkpoint.id> --shared -C <directory>
archboard model record --walkthrough 'Request tour' --checkpoint <checkpoint.id> --out tour.mp4 -C <directory>
archboard model replay <talk-directory> --out tour-again.mp4
```

The first command changes no inputs and retains no history.
Its `playback` gives narrative identity, source revision, resolved revision, and availability per beat.
A missing subject stops that beat with recovery instructions.
Keep the returned model for playback. Restart explicitly to use later architecture.

A checkpoint pins both narrative and playback model.
`--shared` requires an exact retained target.
Before sharing or recording, use [history retention and publication](canonical-models.md#retain-an-exact-local-reading).

Recording uses local voice and rendering, and requires every beat to be available before voice starts.
The recording artifact keeps one exact model and narrative for offline replay, separately from authored inputs.
Replay needs its talk directory and voice file.
It reads no mutable model, starts no live voice session, and recreates no writer.
Saved talks stay exact history.

Voice reads the narrative source separately from its target.
Before starting, the pane reports `playback.source`, `expectedSourceRevision`, and `expectedRevision`.
Narration waits for server acceptance and matching source and target revisions.
Narrate stays unavailable while the picture draws.

A narrative can target a checkpoint older than its own definition.
Accepted captures stay complete for later beats despite file changes.
If source or target changes or becomes unavailable, reopen the walkthrough before retrying narration.

Live narration requests the first beat by pane and walkthrough, without a pane key.
The recording page advances its own beats and receives no server request for the first beat.
Both paths narrate only available beats after pane arrival.
Leaving the walkthrough stops narration.

## Write each beat

Make one point per beat.
State it in the title, for example `Only the ledger sets items aside`.
Use the narrative for what the picture cannot show.
Use model names and source-backed numbers, such as a limit, count, or timeout.
Select the two or three subjects that the beat explains.
Voice uses the title, narrative, selection, and picture.

## A newcomer's walkthrough

Use this sequence when a newcomer asks how something works:

1. Write a one-sentence answer: `When you do this, this happens`. Name the action and result.
2. Choose four to ten modules and one flow that explain the answer. Give each module a plain `responsibility`. Exclude helpers, configuration, types, and tests. Include every module and relationship needed for the answer.
3. Open with the whole roots: omit `scope`, `visibility`, and `focus`. Select the root containing the answer.
4. Grow the path through `visibility`. Start with two modules, then preserve prior modules and relationships and add one to three per beat. Select the additions. End with the complete path.
5. Show the exchange through a sequence beat with its `flow`.
6. If the reader encounters a failure, add a beat that explains the failure and visible result.
7. End with the answer, one source-backed number, and the next module or flow to read. Make that beat stand alone.

## A pull request's walkthrough

Use this sequence for reviewers unfamiliar with the code.
Target the change's proposal.
Write three to six beats of a few sentences each, for one to three minutes:

1. Read the diff against the merge base. State why the PR exists in one sentence about the need.
2. Run `archboard model footprint --base <merge-base> --state <proposal>`. Read each commit marked `large` before assigning it a beat. Give every changed module a beat, or explain its omission.
3. Open with the reason and no selection. Give the main change a beat, then each other change its own. Titles state what changed. Name removed modules in prose because the selected state cannot select them.
4. End on the boundary or invariant that needs closest inspection and what to inspect there. Make sure that the beats explain what changed and why without the code.

Record from the retained checkpoint.
The archboard-pr skill owns video attachment and placement in the PR.
