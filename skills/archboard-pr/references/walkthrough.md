# Narrate the review

A walkthrough explains a change through ordered beats with complete reading instructions.
Use it when order or interactions need explanation, or when the user requests one.
Read the consumer skill's canonical walkthrough recipe before authoring.

## Prepare the narrative

Make sure that the local server has Codex sign-in, Chromium, ffmpeg, and a matching frontend build.
Use the recording prerequisites in the installation reference distributed with the consumer skill.
If a prerequisite is unavailable, report the concrete limit and finish the available static evidence.
Use existing authorization for setup rather than introducing another approval step.

Claim the affected model, state, walkthrough, and existing beat identities before editing.
Add or edit the walkthrough through `model edit` in the intended proposal.
Target its stable proposal identity or an exact retained state.
Keep existing beat IDs when moving or revising them.

Write beats in this order:

1. Explain the problem and the module scope where the change sits.
2. Explain each interaction that the reviewer needs, with one point per beat.
3. Name the source boundary that deserves the closest review and its concrete failure risk.

Each beat supplies narrative, scope, selection, focus, filters, grammar, and a flow when behavior requires one.
Omitted presentation fields start empty rather than inheriting another beat.
Use stable subject identities and complete authored flows.
Keep removed subjects in the explanation text when the selected state cannot resolve them.

The completed edit returns a retained checkpoint.
Read its walkthrough through `model read --checkpoint <id> --walkthrough <id> --shared`.
Make sure that the selected proposal and every beat match the intended review.
If current architecture needs another checkpoint, use the current-only `model retain` recipe.
A planning root uses the checkpoint from its proposal edit.

## Record and inspect

```bash
archboard model record --checkpoint <checkpoint-id> --walkthrough <walkthrough-id> --talk <artifact-directory>/talk --out <artifact-directory>/walkthrough.mp4 -C <checkout>
archboard model replay <artifact-directory>/talk --out <artifact-directory>/walkthrough-again.mp4
```

The checkpoint pins the complete narrative and architecture for the recording.
The recorder refuses unavailable beats before voice starts.
It uses the existing local voice, talk storage, and frame renderer.
Replay reads the retained talk without starting another voice session or consulting mutable model files.

Read the receipt for duration, output size, talk path, and exact revision.
Inspect one representative frame per beat with the existing ffmpeg tools.
Read the spoken transcript against source evidence.
Repair inaccurate narrative before recording another version.
Preserve the retained narrative and talk until the review artifacts are complete.

The talk's `architecture.playback.beats` supplies canonical beat metadata.
Its `events` contains `step` and final `said` events.
Divide event sample positions by `audio.sampleRate` for chapter times.
Use the canonical playback metadata rather than the retained legacy document envelope.
Copy spoken words accurately, with spacing repairs only.

## Share the result

Place the video below its picture in Summary.
Put the transcript and chapter times inside a collapsed details element.
Upload the standalone MP4 through the posting workflow.
Keep the talk directory for replay.

Uploaded video bytes do not publish their source archive.
For reproducible shared history, use the owner-authorized archive publication workflow and retain every dependency.
Report local-only or unavailable history honestly.
Removing a temporary review narrative later requires a separate authorized edit and preserves the recorded checkpoint.
