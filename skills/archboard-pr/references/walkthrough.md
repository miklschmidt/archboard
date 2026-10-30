# A narrated walkthrough for the reviewer

A walkthrough video is the long version of the Summary: a voice explains the
picture while the picture highlights what it speaks of. The sentences above
the picture are the short version, so the two never repeat each other.
Section 5 of the skill decides whether to record one. This file says what it
needs, how to write it, how to record it, and what goes into the pull request
with it.

Narration at the same time as the picture it explains helps a learner more
than text beside the picture [Mayer and Moreno]. The effect appears with
material whose parts interact a lot, and it disappears with simple material
[Sweller]. That is why a change of one or two parts gets no video.

## What it needs

- Codex signed in, Chromium or Google Chrome, and ffmpeg with libx264 and
  aac. Section 0 of the skill checks all three before anything else, and asks
  the user once when one is missing. If the user chose no walkthrough, do not
  record. A recording that still finds one missing refuses before it records:
  `Codex is not signed in on this Archboard server` (exit 4, measured with a
  server that had no sign-in), or `ENCODER_UNAVAILABLE` (exit 4) for ffmpeg.
  Then post the body without a video, and say why in your final report.
- The chosen checkout. The recording's page reads the chosen checkout of the
  repository. In another checkout, such as a worktree, `semantic record`
  refuses with `CHECKOUT_NOT_CHOSEN` (exit 2). If the user has the app open,
  `archboard browser show "<board>@<proposal>"` from your checkout makes it the
  chosen one. Its answer's `chose.replaced` names the checkout that the user
  read before: tell the user. If no app is open, ask the user before you run
  `archboard repo use <checkout>`.
- Time: about twice the length of the talk.
- Size: GitHub takes a video of up to 10 MB on a free plan and 100 MB on a paid
  plan [GitHub, attaching files]. Archboard recordings measured 3.2 to 6.7 MB a
  minute, and a dense view costs the most. The voice speaks 20 to 25 seconds
  for each beat, whatever the length of its body.

`archboard semantic record --help` lists the options.

## Write the beats

On a vault board, claim it first. Add one walkthrough to the proposal, or on an
ephemeral board to the head branch's draft, in one edit with
`--variant "<proposal>"`. Name it `Review: <head branch>`. The `archboard`
skill's walkthroughs section gives the payload rules for beats, subjects and
views. In a stack, every proposal branched from this one takes the walkthrough
too, and its removal: record it and remove it before you work on the
proposal above. Write the beats in this order:

1. **Why, and where.** Why the change exists, and where it sits in the
   design: the design part it builds. No subjects: a beat with no subjects is
   about the whole picture.
2. **The changes.** One beat for each change that the reviewer must
   understand, the most important first. The
   heading states what the pull request does ("The ledger now takes the
   lease"), not what is drawn ("The ledger"). The subjects are the two or
   three parts the beat is about, so the highlight lands while the voice
   speaks of them [Mayer and Moreno: signalling]. A removed part cannot be a
   subject, so the body names what was removed.
3. **Where to look.** The last beat names the one place where a reviewer must
   look closely, and what to check there. It is the place that Merge Danger
   names.

Rules for every beat:

- It makes one point. Short segments help more than one continuous talk
  [Mayer and Moreno: segmenting].
- Its body is two or three sentences about the system, in the board's names.
  The voice explains them in its own words. Never write about the screen, the
  beat or the walkthrough itself.
- It gives the one number that matters, such as a limit or a timeout.
- It sets `view` to the view of the picture, so the video shows what the
  Summary shows.
- It leaves out the history of the pull request and how anything was made
  [Mayer and Moreno: coherence].

Done: each beat makes one point and has a `view`, the first has no subjects,
and the last says where to look.

## Record

```bash
archboard semantic record <board> --variant "<proposal>" --against "<below>" --walkthrough "Review: <head branch>" --talk "$tmp/talk" --out "$tmp/walkthrough.mp4"
```

- Pass the same `--against` as the picture, so every frame marks the same
  change. Leave it out when the picture does.
- Leave out `--discard`. It deletes the board: a vault board belongs to the
  vault, and an ephemeral board goes with its whole vault afterwards. Keep the
  talk in `$tmp`, outside any vault.
- Use `.mp4`. It is H.264 with AAC sound, and GitHub recommends H.264 for
  greatest compatibility [GitHub, attaching files].
- The video and picture use Blocks by default.
  The talk keeps the layout, so `semantic replay` draws it again.
- The video is drawn in the dark theme unless you pass `--theme light`. A video
  cannot follow the reader's theme, so record one video only.

On a vault board, remove the walkthrough from the proposal afterwards, in one
edit (`removeWalkthroughs: ["Review: <head branch>"]`), and release the claim.
Its beats speak of the change, and after the merge the proposal becomes the
current architecture. The kept talk in `$tmp/talk` can render the video again
with `semantic replay`, without the board.

Done: the receipt names the video and its `talk`, and on a vault board
`semantic compare` no longer lists the walkthrough. If gh refuses the upload
for its size, post the body without the video, and give the user the video's
path and size.

## Check the video

You cannot watch the video, so look at one frame of each beat. Take a frame a
few seconds after each chapter start (below), with the same ffmpeg the
recording used. If that was Nix, put `nix run nixpkgs#ffmpeg-headless --` in
place of `ffmpeg`:

```bash
ffmpeg -loglevel error -ss <seconds> -i "$tmp/walkthrough.mp4" -frames:v 1 "$tmp/frame-<beat>.png"
```

Then read the transcript (below) against the diff. The voice explains in its
own words, so it can state something that the code does not do. Rewrite the
body of such a beat to say it plainly, and record again. Done: on each frame,
the beat's subjects are highlighted and the caption shows the beat's heading,
and the transcript says nothing about the screen and nothing that the code
does not do.

## Chapters and transcript

A video has no alt text on GitHub [gh source]. A transcript lets a reviewer
read instead of watch, and chapters show how the video is organised [Brame].

Read both from the kept talk. Times are counted in samples at 48 kHz.

```bash
# Chapters: the start time and heading of each beat.
jq -r '.board as $b | ([.document.variants[] | select(.id == $b.variant) | .content.walkthroughs[] | select(.id == $b.walkthrough.id) | .beats[].heading]) as $h | .events[] | select(.kind == "step") | (.at / 48000 | floor) as $s | "\($s / 60 | floor):\($s % 60 | tostring | if length < 2 then "0" + . else . end) \($h[.beat])"' "$tmp/talk/talk.json"
# Transcript: each line the voice said, in order.
jq -r '.events[] | select(.kind == "said" and .final) | .text' "$tmp/talk/talk.json"
```

Copy the voice's words as they are. Correct only spacing, such as a missing
space between two sentences.

## In the pull request

Put this in the Summary, under the picture:

```markdown
**Walkthrough**, <m:ss>, narrated.

![](/absolute/path/to/walkthrough.mp4)

<details><summary>Transcript</summary>

**0:01 <heading of beat 1>.** <what the voice said in beat 1>

**0:24 <heading of beat 2>.** <what the voice said in beat 2>

</details>
```

Each chapter is the bold start of its part of the transcript, so the visible
Summary keeps one line and one video. The video reference stands alone in its
paragraph. gh then replaces it with the bare URL of the upload, and GitHub
plays a bare URL alone on its line [gh source]. Section 7 of the skill attaches
the file.

## What the video cannot do yet

The recording always shows subtitles, and a caption with the beat's heading
and body. Narration together with the same words on screen can hurt learning
[Mayer and Moreno: redundancy]. Subtitles also serve a viewer with the sound
off. This cannot be turned off, so keep each body short, and the caption
stays short.

## Sources

- Mayer and Moreno: R. Mayer, R. Moreno, "Nine Ways to Reduce Cognitive Load
  in Multimedia Learning", Educational Psychologist 2003, Table 3.
  <https://www.uky.edu/~gmswan3/544/9_ways_to_reduce_CL.pdf>
- Sweller: J. Sweller, "Visualisation and Instructional Design", 2002.
  <https://nielsolson.us/STLHE020409/SwellerVisualizationAndInstructionalDesign.pdf>
- Brame: C. Brame, "Effective Educational Videos", CBE Life Sciences
  Education 2016 (a review).
  <https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5132380/fullTextXML>
- GitHub, attaching files:
  <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files>
- gh source: `internal/attachments` in cli/cli, and `gh pr create --help`.
  <https://github.com/cli/cli/tree/f0b5f183c30585971a0d1544b8ac34c0b5af816d/internal/attachments>
