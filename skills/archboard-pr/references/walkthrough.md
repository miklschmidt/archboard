# Narrate the review

Before authoring, read the consumer walkthrough reference, including its PR narrative sequence and recording recipe.
Use the installation guide's recording prerequisites: Codex sign-in, Chromium, ffmpeg, and a matching frontend build.
For unavailable prerequisites, follow the parent skill's setup and handoff rules.

Author the walkthrough in the intended proposal, targeting its stable ID or an exact retained state.
Read the completed edit checkpoint through `model read --checkpoint <id> --walkthrough <id> --shared`.
Make sure that the selected proposal and every beat match the review.
Use the same checkpoint selection rules as [renders](renders.md).

Record and replay with the consumer recipe and explicit artifact paths:

```bash
archboard model record --checkpoint <checkpoint-id> --walkthrough <walkthrough-id> --talk <artifact-directory>/talk --out <artifact-directory>/walkthrough.mp4 -C <checkout>
archboard model replay <artifact-directory>/talk --out <artifact-directory>/walkthrough-again.mp4
```

Video and pictures use Blocks by default. The talk keeps its layout for replay.

Read the receipt's duration, output size, talk path, and exact revision.
Inspect a representative frame per beat with ffmpeg.
Compare the spoken transcript with source evidence.
Repair inaccurate narrative before recording again.
Keep the retained narrative and talk until artifacts are complete.

For chapter times, use `architecture.playback.beats` and the `step` and final `said` entries in `events`.
Divide event sample positions by `audio.sampleRate`.
Use canonical playback metadata, not the legacy document envelope.
Copy spoken words exactly, with spacing repairs only.

Place the video below its picture in Summary, with transcript and chapter times in collapsed details.
Upload the standalone MP4 through [posting](posting.md). Keep the talk directory for replay.
For history sharing, follow the parent skill's publication step.
Removing a temporary narrative later needs a separate authorized edit and preserves its recording checkpoint.
