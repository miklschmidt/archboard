# How to explain a pull request to its reviewer

Date: 2026-10-11
Scope: decide what the `archboard-pr` skill (`skills/archboard-pr/SKILL.md`)
tells an agent to produce. The goal is a human reviewer who understands a pull
request faster and reviews it more thoroughly. The research changed no code and no
skill. Every claim about a study, a book or a vendor cites the primary text,
listed under [Sources](#sources). Every claim about archboard cites a path in
this repository, read on `main` at `1f8617550`. A claim that no source
supports is marked **unverified**. Advice that goes beyond the evidence is
marked **judgement**.

## Answer

Reviewers say their main problem is understanding the change, and above all
_why_ it was made. Explicit defect finding is a smaller share of what review
produces than people expect. Most of a review's time goes into understanding
([Bacchelli and Bird][bb] §VI.A). A helpful explainer gives four things, in
this order:

1. The reason for the change.
2. An overview that shows where the change sits, marked in place on one picture.
3. A reading order: groups of related parts, each part after what it depends on,
   with the riskiest group first.
4. The places outside the diff that the change can break, with a question to
   check at each place.

If its prose replaces reading the code, it helps less and can mislead. In the
Cisco study, the vendor itself raised the risk that "prepping disables the
reviewer's capacity for criticism" ([Cohen][cisco]). So build the explainer from
what the code does (`compare`, `footprint`). It also names what the change does
outside the stated intent.

If the change has many interacting parts, a narrated walkthrough is worth
recording. Keep it short: three to six beats, one to three minutes. Each beat makes
one point and highlights what the voice talks about at that moment. The
learning evidence supports narration over a diagram for material with many
interacting elements, and only for that material ([Mayer and Moreno][mm],
[Sweller][sw-vis]).

Archboard can do most of this today. It cannot yet do five things:

- Draw one SVG that follows the reader's theme.
- Draw a key for its comparison marks.
- Record a walkthrough in the Blocks layout.
- Record without subtitles.
- Export chapters or a transcript directly.

Section D gives the source of each gap, and the last section says what archboard
needs to close it.

## A. How reviewers understand and review a change

**Understanding is the bottleneck. Reviewers miss the reason for the change
most.** At Microsoft, "understanding is their main challenge
when doing code reviews". "The biggest information need in code review" is
"what instigated the change". "Understanding the code takes most of the
reviewing time". Defects were "only the fourth most frequent" kind of review
comment (14%) ([Bacchelli and Bird][bb] §VI.A). The authors conclude: "if
managers and developers want code review to match their need for 'finding
defects,' context and change understanding must be improved". "When the author
provided context and direction to them in a review, they could respond better
and faster" (§VII). Several other sources agree:

- At Google, "misunderstandings can arise based on not knowing what gave rise
  to the change", for example whether it was "an urgent fix to a production
  problem or a 'nice to have' improvement" ([Sadowski et al.][sad]).
- In an industrial study, "the rationale of a change is regarded as the most
  important information for change understanding" ([Tao et al.][tao]). The same
  study found that the risk a change "imposed by it on other software
  components" was hard to get. Its I-9 question is "Does this change break any
  code elsewhere?"
- Nine of ten interviewees said "mentioning the motivation behind a specific
  change along with what is being changed" is essential. One said: "the first
  thing I want to see in a pull request is why you want [it]" ([Ram et
  al.][ram] §5.1.1).
- GitHub's own guidance: "Good context often explains why the change is needed,
  what changed, and where reviewers should pay special attention" ([GitHub review
  guide][gh-help]).
- Google's guidance tells a reviewer to look first at "the CL description and
  what the CL does in general". Then the reviewer looks at "the main parts".
  The reason: "this helps give context to all of the smaller parts of the CL"
  ([Google, navigating a CL][g-nav]). An author states the problem and "why
  this is the best approach". Also: "If there are any shortcomings to the approach, they
  should be mentioned" ([Google, CL descriptions][g-desc]).

**A description can mislead.** Some developers distrust descriptions. Their
reason: "people can say they are doing one thing, while they are doing many
more of them" ([Bacchelli and Bird][bb] §VI.A). One interviewee said: "the code
cannot lie and users do lie" ([Ram et al.][ram]). The Cisco study found lower
defect density in reviews with author preparation comments. It named two
explanations. First, the authors fixed defects while preparing. Second,
"prepping disables the reviewer's capacity for criticism … As long as the code
matches the prose, the reviewer is satisfied". The vendor favoured the first explanation, but did
not test it ([Cohen][cisco]).

**Smaller changes are reviewed better.** The evidence comes in three strengths:

- Experiment: "the effectiveness of reviews is significantly larger for small
  code changes" ([Baum et al. 2019][baum19]).
- Vendor study: SmartBear sold the review tool that the Cisco study used, and
  the study was not peer-reviewed. Its figures: "a reviewer will probably not be
  able to review more than 300-400 lines of code before his performance drops".
  "Reviewers slower than 400 lines per hour were above average" at finding
  defects. "Total review time should be less than 60 minutes", citing a
  "well-established fact" that reviewers "wear out" after an hour ([Cohen][cisco]).
- Practice guidance: "100 lines is usually a reasonable size for a CL, and 1000
  lines is usually too large", and "the right size for a CL is one
  self-contained change" ([Google, small CLs][g-small]). Interviewees gave a
  limit of "at most 250 lines" ([Ram et al.][ram]). Medians in the field are 24
  lines at Google ([Sadowski et al.][sad]) and 44 lines at Android and AMD
  ([Rigby and Bird][rb]). Integrators "value small pull requests as it is
  easier to assess their impact" ([Gousios et al.][gousios]).

**Tangled changes are common and harder.** "Understanding a code review is more
difficult when the changeset consists of multiple, independent, code
differences". "Over 40% of changes submitted for review at Microsoft can be
potentially decomposed" ([Barnett et al.][barnett]). "For understanding a
composite change, it is valuable to decompose it into sub-changes" ([Tao et
al.][tao]).

**Order matters, but the evidence for it is uneven.**

- GitHub and Gerrit show files alphabetically. Files shown first get more
  comments. An experiment had 106 participants. If the file of a corner-case
  defect came last, reviewers had "64% lower odds" of finding it. A second defect
  type showed no effect. The authors advise "clearly signaling developers where
  to start their review … in the change description" ([Fregnan et al.][fr]).
- Interviews and a survey give the principles of a good order ([Baum et al.
  2017][baum17] §IV):
  - "Group related change parts as closely as possible".
  - "Provide information before it is needed". 85% preferred going "bottom-up
    along the call-flow relation".
  - Make the grouping explicit. An order with no "sensible" rule was rated among
    the worst by 86%.
  - "At the very beginning of the review, the reviewer should learn about the
    requirements that led to the change", and "some kind of overview at the
    start".
- In a controlled experiment, the order effect was only "a tendency". The
  authors "cannot conclude this reliably" ([Baum et al. 2019][baum19]).

**Working memory limits the defects that span places.** "There is a moderate
association between working memory capacity and the effectiveness of finding
delocalized defects". The association with other defect types is "almost
non-existing" ([Baum et al. 2019][baum19]). The systematic reading technique
"was found to be more effective at finding delocalised defects": it reads in an
order that minimises dependencies and uses stepwise abstraction ([Dunsmore
thesis][dun] §6.3). An overview that holds the relationships between files
carries exactly what a reviewer's working memory drops.

**Focused perspectives widen coverage.** Perspective-based reading gives each
reader "operational scenarios … from a particular perspective". Teams that used
it achieved "significantly better coverage". The documents in that study were
requirements, not code ([Basili et al.][pbr]). The comparison of scenario
readers with checklist readers is related work that the paper cites, not its
own result.

## B. Explaining architecture and design intent

**Rationale is what documents lose.** A programmer who holds the theory "can
explain _why_ each part of the program is what it is". Text and documents alone
cannot pass that theory to a newcomer ([Naur][naur] pp. 231, 234). Rational
documentation is "a reference document rather than an introductory narrative".
Readers "want to understand the programs, not to relive their discovery". The
authors record "all of the design alternatives that we considered and
rejected" ([Parnas and Clements][pc] §V to §VII). Views and Beyond says: "Record Rationale", including "the important or
most likely alternatives you rejected and state why". It also says: "Write
Documentation from the Reader's Point of View" ([Clements et al.][vb] P.5).

**Every diagram needs a key, a title and labelled lines.**

- "Every diagram in the architecture documentation should include a key that
  explains the meaning of every symbol used" ([Clements et al.][vb] Rule 3a).
- "Every diagram should have a title describing the diagram type and scope",
  and "a key/legend explaining the notation". "Every line should be labelled".
  Ask "whether each diagram can stand alone, and be (mostly) understood without
  a narrative" ([C4 notation][c4-not]). The C4 checklist asks: "Do you
  understand the meaning of all colours used?" ([C4 checklist][c4-check]).
- When diagrams are collected, "the logical order in which to read the diagrams
  isn't clear" ([C4 introduction][c4-intro]).

**Draw one kind of relationship per picture.** "Are the arrows representing
compilation dependencies? Or control flows? Or data flows? Usually it is a bit
of everything" ([Kruchten][kru]). Software forms "several, general directed
graphs, superimposed", and "if we superimpose all the diagrams … it is difficult
to extract any global overview" ([Brooks][brooks]). Kruchten's scenarios are the
"+1" view that ties the others together.

**Mark a change in place.** "Diagrams can group together all information that is
used together, thus avoiding large amounts of search", and use "location to
group information about a single element, avoiding the need to match symbolic
labels" ([Larkin and Simon][ls] §5). A list of changed parts that the reader
must match by name against the picture is the search that a diagram avoids.
Tufte, read through an extractor: "spatial adjacency assists comparison"
([Tufte][tufte]). His "compared to what?" and small-multiples text was not
reached.

**Explain for understanding, in the reader's order.** "Concepts have been
introduced in an order that is best for human understanding … not in some
rigidly determined order like top-down or bottom-up" ([Knuth][knuth]).
Diátaxis says an explanation answers a "why" question, considers alternatives,
and stays "closely bounded" ([Diátaxis][dia]).

## C. Narrated walkthroughs

**Mayer's principles.** These are the median effect sizes on transfer, with the
number of experiments in brackets ([Mayer and Moreno][mm] Table 3):

| Principle           | Meaning                                                              | Effect size |
| ------------------- | -------------------------------------------------------------------- | ----------- |
| Modality            | Narration instead of on-screen text                                  | 1.17 (6)    |
| Temporal contiguity | Narration at the same time as the picture it explains                | 1.30 (8)    |
| Segmenting          | "Learner-controlled segments rather than as continuous unit"         | 1.36 (1)    |
| Pretraining         | Learners know "names and behaviors of system components" first       | 1.00 (3)    |
| Coherence           | Extraneous material removed                                          | 0.90 (5)    |
| Signalling          | Cues such as stressed words, arrows, headings, a map of where one is | 0.74 (1)    |
| Redundancy          | Narration plus the same words as on-screen text hurts                | 0.69 (3)    |
| Spatial contiguity  | Words placed next to what they describe                              | 0.48 (1)    |

In the segmenting study, each segment was "one or two sentences of narration
and approximately 8 to 10 sec of animation".

**The effects need complex material.** The effects "could readily be
demonstrated using high element interactivity material but disappeared when low
element interactivity material was used" ([Sweller][sw-vis]). Split attention
costs working memory "because learners must search for referents". A video of a
one-part change is cost without benefit.

**Cues select, and a trace persists.** Cueing works for "selection—cues guide
attention to specific locations". Animations are transient unless "they leave
some kind of trace". Cues fail if they are "overridden by attention-catching elements"
([de Koning et al.][dk]).

**Length and pace.** The data is 6.9 million sessions of MOOC video:

- "Median engagement time is at most 6 minutes, regardless of total video
  length". Viewers "make it less than halfway through videos longer than 9
  minutes". Tutorials are watched for "2 to 3 minutes".
- Speaking rates ranged from 48 to 254 words a minute, with a mean of 156.
  "Engagement usually increases (up to 2x) with speaking rate".
- The authors suggest "visual signposts" to help viewers skim and watch again.
- The study measured engagement, not learning ([Guo et al.][guo]).

A peer-reviewed review agrees: keep videos short, signal what matters, and use
chapters, which "demonstrate the organization" ([Brame][brame], a secondary
source).

## D. What archboard and GitHub support today

### Rendering

- **Commands.** `archboard semantic render <board> --out x.svg` draws an SVG.
  `semantic rasterize … --out x.png` draws a PNG in headless Chromium, with
  `--scale 0.25` to `4`. Both take `--variant`, `--view`, `--no-comparison`,
  `--theme light|dark` (default `light`) and `--layout track|blocks`
  (`./bin/archboard semantic render --help`, `semantic rasterize --help`).
- **Layout engines.** At the researched revision, Track was the default and Blocks was selectable
  (`packages/board/src/shared/protocol/render-reply.ts:40`,
  [ADR 0040](../adr/0040-track-and-blocks-replace-the-graphviz-engine.md)). The
  browser labeled Blocks "Blocks (experimental)"
  (`src/ui/semantic-board-canvas/lib/layout-engine.ts`).
  [ADR 0064](../adr/0064-blocks-is-the-default-layout-engine.md) changes the default to Blocks on 2026-10-30.
- **One theme per file.** An exported SVG stands alone. Its root carries
  `color-scheme:<theme>` and that theme's value of every colour token
  (`standingAlone` in `packages/renderer/src/shared/rules/svg/page/document.ts`).
  Light and dark therefore need two files. A themeless picture exists only for a
  page that supplies the tokens. A file rendered for this note had no
  `prefers-color-scheme` rule.
- **What an exported SVG contains.** It embeds its fonts: exports set
  `fonts: "embedded"` (`src/cli/commands/lib/semantic-input.ts`), about 650 kB
  for the 12-part `Archboard` board. It paints its own background rectangle. Its
  colours use CSS `light-dark()`, 339 times in that file. `light-dark()` is
  "Baseline 2024", so it "might not work in older devices or browsers"
  ([MDN][mdn-ld]). A PNG has no such dependence.
- **Size and legibility.** The whole `Archboard` board in Blocks drew 2011×1524
  pixels, with labels at 10 to 14 px. A pull request's text column is much
  narrower than 2000 px. GitHub does not document the width (**unverified**). A
  whole board shrinks to roughly half size or less, so its labels fall to about
  5 to 7 px. A view of the changed parts is the readable unit.
- **No key and no title.** The comparison marks are three channels:
  - Shape: a pin with a crossed bar for added, a single bar for removed, a wave
    for changed.
  - Lightness: only a removed subject is ghosted.
  - Outline: solid for added, dashed for changed, and a dashed red border round
    a removed part's footprint.

  The renderer draws no legend, because "a legend and a caption are the
  viewer's business" (`packages/renderer/src/shared/rules/svg/parts/standing.ts`
  header. `DESIGN.md`, cards section). The picture has no visible title, only an
  `aria-label` such as "Architecture diagram: 12 nodes, 18 connections".

- **Before and after are laid out apart.** "Every variant is laid out fresh":
  cards can move between variants
  ([ADR 0032](../adr/0032-every-variant-is-laid-out-fresh.md)). Laying a before
  render and an after render side by side does not line the parts up. The after
  render already marks every change in place, and keeps removed subjects as
  ghosts.

### Recording

- **What it does.** `semantic record <board> --out talk.mp4|.webm` presents one
  walkthrough in a private headless Chromium at 1920×1080. The Codex voice
  explains each beat, and the beat moves on after a quiet of 1.2 s
  (`RECORDING_QUIET_MS`). The video opens on the whole board for 1.2 s
  (`RECORDING_LEAD_MS`) and ends 1.5 s after the last beat (`RECORDING_TAIL_MS`).
  Constants: `packages/timing/src/shared/constants/walkthrough-recording.ts`. Command:
  `./bin/archboard semantic record --help`.
- **Requirements.** The recording needs:
  - The Archboard server's Codex signed in.
  - Chromium on PATH, or named by `ARCHBOARD_RENDERER_CHROMIUM`.
  - ffmpeg with libx264 and aac (libvpx-vp9 and libopus for WebM), from
    `ARCHBOARD_FFMPEG`, PATH or Nix. Without one, the command refuses with
    `ENCODER_UNAVAILABLE`, exit 4.

  It takes about twice the talk's length to make
  (`skills/archboard/references/sequences-views-walkthroughs.md`, "Recording a
  walkthrough").

- **Limits.** One beat runs for at most 180 s (`RECORDING_STEP_MAX_MS`). Nothing
  else limits the length or the number of beats. The walkthrough schema has no
  maximum (`packages/board/src/shared/schemas/walkthrough.ts`).
- **What the voice is told.** The voice gets each beat's heading, body and
  subjects. On a proposal, it is also told whether each subject was added or
  changed. Its instructions say: "explain it at once … as a good conference
  speaker would … in your own words … Keep it to a few sentences with at most
  one aside". It is told not to read the text out. It is told to "close the
  walkthrough with one short sentence"
  (`packages/workbench/src/runtime/rules/realtime/presentation-mode.ts`). The
  author does not script its words, and no option controls its pace.
- **What is on screen.** The caption shows the beat's heading and body, and "the
  recording page always shows subtitles"
  ([ADR 0041](../adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md)).
- **Output.** MP4 is H.264 High, yuv420p, CRF 18, with AAC at 160 kb/s
  (`packages/walkthrough/src/runtime/processes/video-encoder.ts` and
  `docs/design/walkthrough-recording-acceptance.md` §3). The sound alone is
  about 1.2 MB a minute. The size of the picture was not measured.
- **Layout and theme.** `semantic record` and `semantic replay` have no
  `--layout`. The recorder names no engine, so the page draws with its default,
  Track. The browser keeps the choice of engine only in its storage
  (`layout-engine.ts`), and nothing under `packages/walkthrough/src/runtime/`
  names a layout. `semantic replay <talk> --theme dark` renders a kept talk in
  the other theme with no new voice session.
- **The kept talk.** `talk.json` holds every beat's start (`kind: "step"`) and
  every line the voice said (`kind: "said"`, with `text`). Each `at` is counted
  in samples at 48 kHz (`packages/walkthrough/src/shared/protocol/talk.ts`). So
  chapter times and a transcript can be read from it with `jq`, but no command
  prints them.

### GitHub

- **File types and sizes.** GitHub accepts these "in all contexts": PNG, GIF,
  JPEG, SVG, and video in `.mp4`, `.mov` and `.webm`. The limits are 10 MB for
  images, 10 MB for videos on a free plan, and 100 MB on a paid plan. GitHub
  says "we recommend using H.264 for greatest compatibility". Uploads in a
  private repository can be seen only by people with access ([GitHub, attaching
  files][gh-attach]). Archboard's MP4 is H.264.
- **gh `--attach`.** gh 2.100.0 is installed here. It accepts `.png .jpg .jpeg
  .gif .webp .svg .mp4 .mov .webm`, with at most 10 MiB per image and 100 MiB
  per video. The server refuses the rest (`internal/attachments/userasset.go` in
  [cli/cli][gh-src]). A video "renders as a player and has no alt text"
  (`gh pr create --help`). gh rewrites only Markdown references to an attached
  file: `![alt](path)` and `[text](path)`. It matches the whole path, so
  `path#fragment` does not match (`attachAssetsToMarkdown` and
  `attachmentArgForDestination` in `internal/attachments/references.go`). It
  does not rewrite a `<picture>` `srcset` or an HTML `<img src>`.
- **Light and dark images.** GitHub documents "The `<picture>` HTML element is
  supported" ([GitHub, basic formatting][gh-basic]). Its quickstart shows
  `<source media="(prefers-color-scheme: dark)" …>` with a fallback `<img>`
  ([GitHub, quickstart][gh-quick]). That example is for a profile README. The
  feature came as a beta in May 2022 ([changelog May 2022][gh-pic]). No
  GitHub page names pull request descriptions for it (**unverified** there,
  though the formatting page covers every writing surface). The 2021 changelog
  documents the `#gh-dark-mode-only` and `#gh-light-mode-only` URL fragments
  ([changelog 2021][gh-frag]). Current docs no longer mention them, and no
  notice deprecates them.
- **Unverified.** Whether an uploaded SVG with embedded fonts and `light-dark()`
  draws correctly in a pull request, how wide the description column is, and
  whether a click opens the image at full size. This research created no pull
  request and uploaded nothing.

## Sources

All accessed 2026-10-11. Unless a note says otherwise, the full text was
extracted and the quotes come from it. The quotes the guidance rests on were
checked a second time against the extracted text.

- Code review: [Bacchelli and Bird, ICSE 2013][bb]. [Sadowski et al., ICSE-SEIP
  2018][sad]. [Rigby and Bird, FSE 2013][rb] (course-site copy). [Tao et al.,
  FSE 2012][tao]. [Ram et al., FSE 2018][ram]. [Barnett et al., ICSE
  2015][barnett]. [Fregnan et al., ESEC/FSE 2022][fr]. [Baum et al., ICSME
  2017][baum17]. [Baum et al., EMSE 2019][baum19]. [Basili et al., EMSE
  1996][pbr] (UMD lab package). [Dunsmore, PhD thesis 2002][dun]. The TSE 2003
  paper was read as an abstract only. [Cohen, "Code Review at Cisco
  Systems"][cisco] (vendor chapter). [Gousios et al., ICSE 2015][gousios].
- Practice guides: [Google eng-practices: navigating a CL][g-nav], [CL
  descriptions][g-desc], [small CLs][g-small]. [GitHub review guide][gh-help].
- Architecture explanation: [Naur 1985][naur] (scan of the Cockburn reprint).
  [Parnas and Clements 1986][pc]. [Kruchten 1995][kru]. [Clements et al., Views
  and Beyond, Prologue][vb] (publisher sample). [C4 notation][c4-not], [C4
  checklist][c4-check], [C4 introduction][c4-intro]. [Brooks, No Silver
  Bullet][brooks]. [Larkin and Simon 1987][ls]. [Knuth 1984][knuth].
  [Diátaxis: explanation][dia]. [Tufte, sparkline excerpt][tufte] (through an
  extractor only).
- Multimedia: [Mayer and Moreno 2003][mm]. [Sweller, Visualisation and
  instructional design][sw-vis]. [de Koning et al. 2009][dk]. [Guo, Kim and
  Rubin 2014][guo]. [Brame 2016][brame] (secondary review).
- GitHub and the web: [Attaching files][gh-attach]. [Basic writing and
  formatting][gh-basic]. [Quickstart for writing][gh-quick]. [Changelog
  2021-11-24][gh-frag]. [Changelog May 2022][gh-pic]. [cli/cli
  source][gh-src] (`internal/attachments`, at commit `f0b5f183`). [MDN
  `light-dark()`][mdn-ld].
- Not reached, and not cited: Sweller 1988, and Sweller, van Merriënboer and
  Paas 1998 (both paywalled). Jeung, Chandler and Sweller 1997 (403). Dunsmore
  et al., ICSE 2000. Tao and Kim, MSR 2015. Herzig and Zeller on tangled
  changes. Baum et al., "The Choice of Code Review Process". Tufte's "compared
  to what?" and the small-multiples passages. The conceptual integrity chapter
  of _The Mythical Man-Month_. Any official transcript of Simon Brown's
  "Visualising software architecture" talk. An SEI-hosted copy of Views and
  Beyond.

## What the archboard-pr skill should tell an agent

Each rule ends with the finding it rests on, or says **judgement**.

### 1. Order and anatomy of the explainer

The reviewer reads the explainer top to bottom, so put the parts in this order.

1. **Why**, in one or two sentences: the problem or need, and how urgent it is,
   never the files. Then the shortcoming or trade-off the author accepted, and
   an alternative that was rejected, with the reason. _[Bacchelli and Bird
   §VI.A. Sadowski et al. Tao et al. Ram et al. §5.1.1. Google CL
   descriptions. Parnas and Clements §VII. Clements et al. Rule 5]_
2. **The after render, with its title and key.** Show one comparison render of
   the view that holds the changed parts. Give it a one-line title that names
   the board, the view and what it compares ("Board store, write path:
   proposal `x` against `main`"). Under it, give the key:
   - added: crossed-bar pin and solid outline
   - changed: wave pin and dashed outline
   - removed: single-bar pin, ghosted, with a dashed red border

   Put the before render in a collapsed `<details>` under it, never side by
   side. _[Bacchelli and Bird §VI.B: overview first. Baum 2017 §IV.B. Larkin
   and Simon §5. Clements et al. Rule 3a. C4 notation. ADR 0032: the two
   layouts differ. `standing.ts`: no legend in the picture]_

3. **What changed**, read from `compare`. List the interface changes first, then
   the parts added and removed, then the relationships that changed, with their
   new ends. Use the board's names, so each line can be found on the picture.
   _[Larkin and Simon: no matching of labels the picture does not carry.
   Sweller: split attention]_
4. **Built but not proposed.** List every part in `changedNotNamed`, every
   `RELATIONSHIP_UNDRAWN` warning, and the diff's code that no part binds. A
   list of "nothing" is said as nothing. _[Bacchelli and Bird: "people can say
   they are doing one thing, while they are doing many more". Cohen: preparation
   can blind the reader]_
5. **What it can reach.** Name each caller of a changed entry point, and each
   part with a relationship to a changed part. For each one, ask one concrete
   question to check ("Does `Pane` still read the version before it writes?").
   _[Tao et al. I-9. Baum 2019 and Dunsmore: defects that span places]_
6. **Reading order** (section 2 below). _[Fregnan et al. Baum 2017]_
7. **Where to look closely.** Name the one seam or invariant the change relies
   on, and what to check there: a place, not a verdict. _[Fregnan et al.:
   "signaling developers where to start". GitHub review guide]_
8. **Proposed and built**, for a proposal drawn before the code, as the skill
   says today.
9. **Open it**: the `semantic compare` line, as today.

Keep the whole explainer short enough to read in a few minutes. Leave file lists
and API detail to the diff. _[Diátaxis: "closely bounded". **judgement** on
the length]_

### 2. Size and split what is asked of a reviewer

1. **Count the change.** Count the changed lines without generated files, lock
   files and snapshots: `git diff --shortstat <base>...HEAD` minus those.
   _[**judgement** on how to count]_
2. **Above about 400 changed lines, or more than one independent purpose, split
   the review into passes.** Give each pass one named group of related parts, a
   rough size, and one purpose. If the work can still become separate pull
   requests, say so once, without insisting, and say where to cut. The
   thresholds: Cohen gives 300 to 400 lines and under 60 minutes
   (vendor study). Google calls 1000 lines "usually too large". Ram et al. heard
   250 lines. Barnett et al. found over 40% of changes decomposable. The 400 is
   **judgement** taken from the vendor figure.
3. **Order the passes.** Put first the group that holds the seam or riskiest
   change, so that it is not the file a reviewer meets last. _[Fregnan et al.:
   64% lower odds for the last file. Google navigating a CL: main parts first]_
4. **Order the parts inside a group bottom-up along the relationships.** Use the
   board: a part that another part calls or reads comes before its caller, so
   information comes before it is needed. Keep a part and the parts it is tied
   to in one group. If grouping and order conflict, keep the group. _[Baum 2017
   Principles 1 to 3 and 6: 85% preferred bottom-up along the call flow]_
5. **Write the order as a numbered list of files with their part names** (for
   example "`lease.ts` (Lease table)"). The list is the reviewer's map of the
   diff, which GitHub shows alphabetically. _[Fregnan et al.: alphabetical
   order in GitHub. Baum 2017 Principle 6: make the grouping explicit]_
6. **If the change has distinct risks, name a perspective for each pass**, such
   as a caller's view or an operator's view (failure, retry, migration).
   _[Basili et al.: perspectives widen coverage. Evidence from requirements
   documents, so **judgement** for code]_

### 3. Readable renders in light and dark GitHub themes, on Blocks

What works today, step by step. It uses PNG files, not SVG (step 2 says why):

1. **Choose the view first.** Use a board view that holds the changed parts and
   their direct neighbours: about four to twelve cards. If the whole board
   renders wider than about 1200 px, never use it. _[Measured: the whole
   `Archboard` board is 2011 px wide with 10 to 14 px labels. Kruchten and
   Brooks: one kind of picture per view. The column width is **unverified**, so
   the 1200 px is **judgement**]_
2. **Draw with Blocks in both themes, through the same view:**

   ```bash
   for t in light dark; do
     archboard semantic rasterize <board> --view "<view>" --variant "<proposal>" --layout blocks --theme $t --out "$tmp/after-$t.png"
     archboard semantic rasterize <board> --view "<view>" --layout blocks --theme $t --out "$tmp/before-$t.png"
   done
   ```

   Use PNG, not SVG, for the pull request. GitHub and gh accept SVG, but an
   exported SVG depends on CSS `light-dark()` (Baseline 2024) and on embedded
   fonts. Nobody checked that these draw in a pull request. A PNG
   rasterized by Chromium has no such dependence. _[`document.ts`. MDN. GitHub,
   attaching files. **judgement** to prefer PNG]_

3. **Look at the after render at about the size it will show.** If the native
   width is over about 1000 px, rasterize again with `--scale 0.5` and open it.
   If the labels cannot be read, narrow the view. Never drop parts from the
   proposal to make the picture fit. _[Verification rule of the `archboard`
   skill. **judgement** on the scale]_
4. **Post in two passes**, because gh rewrites only Markdown references:
   1. Attach the four PNGs with plain `![alt](path)` references, as the skill
      does today.
   2. Read the body back with `gh pr view --json body`. Replace each pair of
      references with a `<picture>`:

      ```html
      <picture>
      	<source media="(prefers-color-scheme: dark)" srcset="<after-dark URL>" />
      	<source media="(prefers-color-scheme: light)" srcset="<after-light URL>" />
      	<img
      		alt="<board>, <view>: proposal against main; added, changed and removed parts marked"
      		src="<after-light URL>"
      	/>
      </picture>
      ```

   3. Write the body back with `gh pr edit --body-file`, without `--attach`.

   Done: no local path is left, and each `<picture>` has a light fallback `<img>`.
   _[gh `references.go`. GitHub quickstart and basic formatting. That
   `<picture>` works in a pull request description is **unverified**: the
   first real use must be looked at in both themes]_

5. **Write alt text that says what the picture shows**: the board, the view,
   and that it compares the proposal with `main`, not the file name. _[gh
   `--help`: without alt text, the file name is used]_

What archboard needs to make this simpler:

- An export that draws one SVG following the viewer's theme, for example
  `color-scheme: light dark` with `light-dark()` tokens and no fixed scheme.
  Today every export is fixed to one theme (`standingAlone` in `document.ts`).
  How such an SVG behaves inside an `<img>` on GitHub is **unverified**.
- An optional key on export for the comparison marks, and an optional visible
  title. Today the renderer leaves both to the viewer (`standing.ts`), so every
  explainer has to write the key by hand.
- `--layout` on `semantic record` and `semantic replay`, so that a video draws
  the same layout as the stills. Today recordings are always Track.

### 4. When to record a narrated walkthrough, and how

If the change has many interacting parts, record one. Signs of that:

- three or more relationships change across three or more parts
- an ordering or protocol matters, so a flow or a sequence is involved
- the reviewer needs to follow a path through several parts

Do not record one for a change of one or two parts that the after render
already shows. _[Sweller: the effects appear with high element interactivity
and disappear without it. Mayer and Moreno: coherence. The thresholds are
**judgement**]_ If the user asks, record one too.

Write the script like this:

1. **Three to six beats, one to three minutes.** _[Guo et al.: tutorials are
   watched for 2 to 3 minutes, and engagement is at most 6 minutes. Brame.
   `sequences-views-walkthroughs.md`: one beat is about half a minute]_
2. **Beat 1, the why**, with no subjects. Then **beat 2, the parts**: name the
   few parts the change touches and what each does, with them as subjects,
   before any flow. _[Mayer and Moreno: pretraining, 1.00]_
3. **One beat for each change, the most important first.** The heading states
   what the pull request did ("The ledger now takes the lease"). The subjects
   are the two or three things that beat is about, so the highlight lands while
   the voice speaks of them. _[Mayer and Moreno: segmenting, signalling and
   temporal contiguity. de Koning et al.: selection cues]_
4. **Each body is something the voice can explain in a few sentences.** It
   names parts as the board names them, and gives the one number that matters.
   The voice paraphrases the text and does not read it out. _[`presentation-mode.ts`]_
5. **The last beat says where to look closely and what to check.** The voice
   closes in one sentence by itself. _[Fregnan et al. `presentation-mode.ts`]_
6. **No decoration.** Leave out beats about context the reviewer does not need,
   and history of the pull request. _[Mayer and Moreno: coherence, 0.90.
   Parnas and Clements: do not relive the discovery]_

Before you record, check the requirements:

- Codex signed in on the server.
- Chromium installed.
- ffmpeg with libx264 and aac, or Nix.
- A free plan's 10 MB limit for video.

Record outside the checkout and keep the talk with `--talk <dir>`. After
recording, read the receipt's `bytes` against the plan's limit. Then put these
in the pull request body:

- the video, as a bare attached URL on its own line, so it plays
- a chapter list: each beat's heading with its start time, from `talk.json`
  (`at / 48000` seconds for each `kind: "step"`)
- the transcript in a `<details>`, from the `said` lines, because the video has
  no alt text

_[Mayer and Moreno: learner-controlled segments. Guo et al.: visual signposts.
gh `--help`. `talk.ts`]_ The video is drawn in Track whatever the stills use.
Say so in one line under the video until `record` takes `--layout`.

What archboard needs to make recordings better:

- `--layout` on `semantic record` and `semantic replay` (section 3).
- A choice to record without subtitles. Today the page always shows them
  (ADR 0041), beside a caption with the beat's heading and body. Subtitles
  repeat the narration word for word, which is the redundancy that Mayer and
  Moreno measured as harmful (0.69). Subtitles also serve a viewer with the
  sound off, so this is a trade-off: **judgement**.
- A command that prints a kept talk's chapters and transcript, so the agent
  does not have to read `talk.json` with `jq`.

### 5. Checklist before posting

- [ ] The why names the problem and its urgency, and one rejected alternative
      or accepted shortcoming.
- [ ] Every statement under What changed comes from `compare` or `footprint`.
      Built but not proposed is listed. An empty list says "nothing".
- [ ] The after render is a view of the changed parts, drawn with Blocks, in
      light and dark. If it is wider than 1000 px, it was opened at
      `--scale 0.5` and found readable.
- [ ] Each render has a title line, a key for added, changed and removed, and
      alt text that says what it shows.
- [ ] Each `<picture>` has both sources and a light fallback `<img>`. No body
      reference names a local path. The `archboard-pr` markers occur once each.
- [ ] The reading order is a numbered list of files with part names, grouped,
      with the riskiest group first. A change above about 400 lines is split
      into passes.
- [ ] Each reached part has one concrete question to check.
- [ ] If there is a video: 3 to 6 beats, under the plan's size limit, with
      chapters, a transcript, and a note that it is drawn in Track.

### 6. Anti-patterns

- **Describing what you meant instead of what the code does.** It invites the
  reader to check the code against the prose and stop there. _[Cohen.
  Bacchelli and Bird]_
- **Listing files in diff order, or alphabetically, as the reading order.**
  _[Fregnan et al. Baum 2017: an order with no sensible rule was rated among
  the worst]_
- **A whole-board render squeezed into the column**, or a render with no title
  and no key. _[Measured label sizes. Clements et al. Rule 3a. C4 notation]_
- **Before and after side by side.** Their layouts do not line up. _[ADR 0032]_
- **Telling the history of the pull request**, step by step. _[Parnas and
  Clements §VII. Knuth]_
- **A verdict** ("this is safe") **in place of a place to look.** _[the
  skill's current rule. Ram et al.: some reviewers distrust prose]_
- **A video for a small change**, or a video over about three minutes, or beats
  that each carry several points. _[Sweller. Guo et al. Mayer and Moreno]_
- **Headings that name what is drawn** ("The ledger") **instead of what
  changed.** _[`sequences-views-walkthroughs.md`. Mayer and Moreno: signalling]_
- **One SVG for both themes, a fragment on a local path, or a `<picture>`
  passed through `--attach` in one step.** None of these works today. _[`document.ts`.
  gh `references.go`]_

[bb]: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf
[sad]: https://sback.it/publications/icse2018seip.pdf
[rb]: https://users.ece.utexas.edu/~miryung/teaching/EE379K-Spring2014/Papers/Paper%204.pdf
[tao]: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf
[ram]: https://sback.it/publications/fse2018.pdf
[barnett]: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/barnett2015hdh.pdf
[fr]: https://arxiv.org/abs/2208.04259
[baum17]: https://sback.it/publications/icsme2017.pdf
[baum19]: https://sback.it/publications/emse2019a.pdf
[pbr]: http://www.cs.umd.edu/projects/SoftEng/ESEG/manual/pbr_package/docs/emp_pbr.ps.gz
[dun]: https://strathprints.strath.ac.uk/2683/1/strathprints002683.pdf
[cisco]: https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf
[gousios]: https://gousios.org/pub/pullreqs-integrators.pdf
[g-nav]: https://google.github.io/eng-practices/review/reviewer/navigate.html
[g-desc]: https://google.github.io/eng-practices/review/developer/cl-descriptions.html
[g-small]: https://google.github.io/eng-practices/review/developer/small-cls.html
[gh-help]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/getting-started/helping-others-review-your-changes
[naur]: https://pages.cs.wisc.edu/~remzi/Naur.pdf
[pc]: https://users.ece.utexas.edu/~perry/education/SE-Intro/fakeit.pdf
[kru]: https://www.cs.ubc.ca/~gregor/teaching/papers/4+1view-architecture.pdf
[vb]: https://www.informit.com/articles/article.aspx?p=1641654&seqNum=5
[c4-not]: https://c4model.com/diagrams/notation
[c4-check]: https://c4model.com/diagrams/checklist
[c4-intro]: https://c4model.com/introduction
[brooks]: https://worrydream.com/refs/Brooks_1986_-_No_Silver_Bullet.pdf
[ls]: https://mechanism.ucsd.edu/bill/teaching/F12/cs200/Readings/larkin.whyadiagramissometimesworth.1987.pdf
[tufte]: https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/
[knuth]: http://www.literateprogramming.com/knuthweb.pdf
[dia]: https://diataxis.fr/explanation/
[mm]: https://www.uky.edu/~gmswan3/544/9_ways_to_reduce_CL.pdf
[sw-vis]: https://nielsolson.us/STLHE020409/SwellerVisualizationAndInstructionalDesign.pdf
[dk]: https://repub.eur.nl/pub/16961/DeKoning%20et%20al._2009_EdPsyRev.pdf
[guo]: https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf
[brame]: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5132380/fullTextXML
[gh-attach]: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files
[gh-basic]: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax
[gh-quick]: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github
[gh-frag]: https://github.blog/changelog/2021-11-24-specify-theme-context-for-images-in-markdown/
[gh-pic]: https://github.blog/changelog/month/05-2022/
[gh-src]: https://github.com/cli/cli/tree/f0b5f183c30585971a0d1544b8ac34c0b5af816d/internal/attachments
[mdn-ld]: https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark
