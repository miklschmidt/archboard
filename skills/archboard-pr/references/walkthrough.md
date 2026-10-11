# A narrated walkthrough for the reviewer

A walkthrough video is an overview that a voice explains while the picture
highlights what it speaks of. Section 3 of the skill decides whether to record
one. This file says what it needs, how to write it, how to record it, and what
goes into the pull request with it.

## Why the signs in section 3

Narration beside a picture helps a learner more than text beside it. Narration
at the same time as the picture it explains helps more still [Mayer and
Moreno]. These effects appear with material whose elements interact a lot, and
they disappear with simple material [Sweller]. A video of a one-part change
costs the reviewer time and gives nothing back. So the signs for a recording are many
interacting parts, or a request from the user.

## What it needs

- The Archboard server's Codex signed in. If it is not, the command refuses
  and says so. Then post the explainer without a video.
- Chromium or Google Chrome on `PATH`, or named by
  `ARCHBOARD_RENDERER_CHROMIUM`.
- ffmpeg that can encode libx264 and aac: the one `ARCHBOARD_FFMPEG` names,
  else the one on `PATH`, else Nix, which fetches `nixpkgs#ffmpeg-headless` on
  the first recording. With none of them, the command refuses with
  `ENCODER_UNAVAILABLE` (exit 4) before it starts a browser.
- Time: about twice the length of the talk.
- Size: GitHub takes a video of up to 10 MB on a free plan and 100 MB on a paid
  plan [GitHub, attaching files]. Three archboard recordings measured 3.2 to
  4.3 MB a minute. So a talk under about two minutes fits every plan.

`archboard semantic record --help` lists the options.

## Write the beats

Claim the board. Add one walkthrough to the proposal in one edit, with
`--variant "<proposal>"`. Name it `Review: <head branch>`. The `archboard`
skill's walkthroughs section gives the payload rules for beats, subjects and
views. Write the beats in this order:

1. **Why.** The why sentence of the explainer, with no subjects. A beat with no
   subjects is about the whole picture.
2. **The parts.** Name the few parts the change touches and what each one
   does, with those parts as subjects. Learners who know the names and
   behaviour of the parts first learn more from what follows [Mayer and
   Moreno: pretraining].
3. **One beat for each change, the most important first.** The heading states
   what the pull request did ("The ledger now takes the lease"), not what is
   drawn ("The ledger"). The subjects are the two or three things the beat is
   about, so the highlight lands while the voice speaks of them [Mayer and
   Moreno: signalling and temporal contiguity, de Koning et al.]. A removed
   part cannot be a subject, so the body names what was removed.
4. **Where to look.** The last beat says where to look closely and what to
   check there. It is the same place as the explainer's **Where to look
   closely**. The voice closes the walkthrough by itself in one sentence.

Rules for every beat:

- It makes one point. Short segments help more than one continuous talk
  [Mayer and Moreno: segmenting].
- Its body is a few sentences that the voice can explain. The voice explains
  in its own words and does not read the body out. It also hears each
  subject's standing: added or changed against the current variant.
- It names parts exactly as the board names them, and gives the one number
  that matters, such as a limit or a timeout.
- It sets `view` to the view of the renders, so the video shows the picture the
  explainer shows.
- Leave out the history of the pull request and context the reviewer does not
  need. Removing extra material helps learning [Mayer and Moreno: coherence].

Keep it to three to six beats, one to three minutes in all. A beat of a few
sentences is about 20 to 30 seconds of speech. Viewers stay with a tutorial
video for about 2 to 3 minutes, whatever its length [Guo et al.]. Under two
minutes also fits GitHub's free plan. The three-minute cap is **judgement**
from that evidence.

Done: three to six beats. Each beat has a `view`, the first has no subjects,
and the last says where to look. A reviewer can answer "what changed, and why"
from the beats alone.

## Record

```bash
archboard semantic record <board> --variant "<proposal>" --walkthrough "Review: <head branch>" --talk "$tmp/talk" --out "$tmp/walkthrough.mp4"
```

- Leave out `--discard`. It deletes the board, and this board belongs to the
  vault.
- Use `.mp4`. It is H.264 with AAC sound, and GitHub recommends H.264 for
  greatest compatibility [GitHub, attaching files].
- The video is drawn in the light theme unless you pass `--theme dark`. A video
  cannot follow the reader's theme, so record one video only.

Then remove the walkthrough from the proposal in one edit
(`removeWalkthroughs: ["Review: <head branch>"]`) and release the claim. Its
beats speak of the change, and after the merge the proposal becomes the
current architecture. The kept talk in `$tmp/talk` can render the video again
with `semantic replay`, without the board.

Done: the receipt names the video and its `talk`, its `bytes` is under 10 MB
(10,000,000), and `semantic compare` no longer lists the walkthrough. If the
video is too large, cut a beat or shorten the bodies, and record again.

## Check the video

You cannot watch the video, so look at one frame of each beat. Take a frame a
few seconds after each chapter start (below), with the same ffmpeg the
recording used. If that was Nix, put `nix run nixpkgs#ffmpeg-headless --` in
place of `ffmpeg`:

```bash
ffmpeg -loglevel error -ss <seconds> -i "$tmp/walkthrough.mp4" -frames:v 1 "$tmp/frame-<beat>.png"
```

Done: on each frame, the beat's subjects are highlighted, and the caption shows
that beat's heading.

## Chapters and transcript

A video has no alt text on GitHub [gh source]. Chapters let a reviewer skip to
a part, and a transcript lets a reviewer read instead of watch. Visual
signposts help viewers find their way in a tutorial video [Guo et al.], and
chapters show how the video is organised [Brame].

Read both from the kept talk. Times are counted in samples at 48 kHz.

```bash
# Chapters: the start time and heading of each beat.
jq -r '.board as $b | ([.document.variants[] | select(.id == $b.variant) | .content.walkthroughs[] | select(.id == $b.walkthrough.id) | .beats[].heading]) as $h | .events[] | select(.kind == "step") | (.at / 48000 | floor) as $s | "\($s / 60 | floor):\($s % 60 | tostring | if length < 2 then "0" + . else . end) \($h[.beat])"' "$tmp/talk/talk.json"
# Transcript: each line the voice said, in order.
jq -r '.events[] | select(.kind == "said" and .final) | .text' "$tmp/talk/talk.json"
```

## In the pull request

Put this under the after render, as the explainer's part 3:

```markdown
**Walkthrough**, <m:ss>, narrated. The video uses the Track layout; the renders above use Blocks.

![](/absolute/path/to/walkthrough.mp4)

- 0:01 <heading of beat 1>
- 0:20 <heading of beat 2>

<details><summary>Transcript</summary>

<the transcript>

</details>
```

The video reference stands alone in its paragraph. gh then replaces it with the
bare URL of the upload, and GitHub plays a bare URL alone on its line
[gh source]. Section 4 of the skill attaches the file.

## What the video cannot do yet

- **Layout.** `semantic record` and `semantic replay` have no `--layout`, so a
  video is always drawn in Track, while the renders use Blocks. The note in the
  pull request says so.
- **Subtitles.** The recording always shows subtitles, and a caption with the
  beat's heading and body. Narration together with the same words on screen
  can hurt learning [Mayer and Moreno: redundancy]. Subtitles also serve a
  viewer with the sound off. This cannot be turned off. Keep each body short,
  so the caption stays short.
- **Chapters and transcript.** No command prints them. Use the `jq` lines
  above.

## Sources

- Mayer and Moreno: R. Mayer, R. Moreno, "Nine Ways to Reduce Cognitive Load
  in Multimedia Learning", Educational Psychologist 2003, Table 3.
  <https://www.uky.edu/~gmswan3/544/9_ways_to_reduce_CL.pdf>
- Sweller: J. Sweller, "Visualisation and Instructional Design", 2002.
  <https://nielsolson.us/STLHE020409/SwellerVisualizationAndInstructionalDesign.pdf>
- de Koning et al.: B. de Koning et al., "Towards a Framework for Attention
  Cueing in Instructional Animations", Educational Psychology Review 2009.
  <https://repub.eur.nl/pub/16961/DeKoning%20et%20al._2009_EdPsyRev.pdf>
- Guo et al.: P. Guo, J. Kim, R. Rubin, "How Video Production Affects Student
  Engagement", Learning at Scale 2014.
  <https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf>
- Brame: C. Brame, "Effective Educational Videos", CBE Life Sciences
  Education 2016 (a review).
  <https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5132380/fullTextXML>
- GitHub, attaching files:
  <https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files>
- gh source: `internal/attachments` in cli/cli, and `gh pr create --help`.
  <https://github.com/cli/cli/tree/f0b5f183c30585971a0d1544b8ac34c0b5af816d/internal/attachments>
