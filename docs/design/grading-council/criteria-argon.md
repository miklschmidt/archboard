# Grading Criteria — Argon

## 1. What a Reader Is Trying to Do

An architect reads an Archboard picture—authored as meaning by an agent and laid out automatically—to understand a codebase before planning or reviewing a change. The reader scans the board to see which parts exist, what each container encloses, and where requests enter and settle, then traces edges and labels from caller to callee before drilling down into linked boards or code.

## 2. Grading Criteria (Ordered by Weight)

1. **Unambiguous Edge Traceability (Weight 1 — Highest)**
   Every connection must be easy to follow from source to target with its label clearly paired, unspoiled by crossings, shared stems, or congested hubs.
   - *One-line test:* Trace the lines of the two busiest hubs; the picture where your eye reaches every target and matches every label faster wins.

2. **Honest Top-Down Hierarchy (Weight 2)**
   Entry points and callers belong above coordinators, and foundational services or storage containers belong below.
   - *One-line test:* Scan top to bottom; the picture with fewer upward back-edges and clearer caller-to-target tiers wins.

3. **Proximity of Collaborating Parts (Weight 3)**
   Cards, containers, and label stacks that interact heavily belong near one another rather than stranded across empty canvas.
   - *One-line test:* Find pairs exchanging multiple calls; the picture keeping them closer with shorter routes wins.

4. **Clean Separation of Unrelated Paths (Weight 4)**
   Long-range connections should route around unrelated subsystems instead of slicing through another cluster's traffic.
   - *One-line test:* Inspect lanes around containers and hubs; the picture routing pass-through lines along perimeter gutters rather than local call stacks wins.

5. **Whole-Board Fit and Legibility at Pane Scale (Weight 5 — Tie-breaker)**
   Scaled to fit a reference pane, the board should use balanced proportions without dead space shrinking text.
   - *One-line test:* View both pictures scaled to the same pane bounds; the picture with larger readable text and balanced coverage wins.

## 3. Outright Defects (Automatic Failure)

A picture fails outright if it has any of these defects:
- **Collision:** A card, header, or label overlaps another shape or label so text is clipped or obscured.
- **Edge through card:** A line cuts across a card it does not connect to.
- **Unattributable line or label:** Two edges merge collinearly without port separation or bridges so a reader cannot tell which caller reaches which target, or a label floats ambiguously between lines.
- **Broken containment:** A child card spills outside its container, or an unrelated card sits inside a container's frame.

## 4. Decision Procedure: "A Reads Better", "B Reads Better", or "Same"

1. **Defect Gate:** Check both pictures for Section 3 defects. If only one has a defect, the clean picture wins.
2. **Weighted Trade-offs:** Compare down the ranked list (1 to 5). A clear win on a higher-weighted criterion beats a lower-weighted one—clearer edge traceability (1) or truer top-down hierarchy (2) outweighs a tighter bounding box (5). However, a large gain on Criterion 3 or 4 (rescuing a stranded container) outweighs a negligible difference on Criterion 1 or 2.
3. **Near Ties and Calling "Same":** When Criteria 1–4 trade off equally, break the tie with Criterion 5 (pane-scale legibility) and port neatness. If differences do not change how fast or accurately a person reads any relationship, grade the pair **"same"**.

## 5. Grounding in the Six Sample Boards (`blocks` vs `track`)

**What helps reading:**
- **Colored containers and semantic edges:** In `Archboard-server-routes` and `Live-panes`, colored containers (`Board writes` orange, `Agent` magenta, `Drawing` purple, `Pane state` teal) and edge styles (blue HTTP, pink Render, dashed magenta Event) separate subsystem boundaries and event/render paths from grey calls.
- **Stacked label ladders:** In `Codex-workhorse` (`Thread start` to `Turns`) and `Semantic-renderer` (above `Layout and measuring`), vertical columns of step labels keep dense interactions tidy.
- **Separated exit ports (`track`):** Under `Page start` in `Board-viewer`, `track` gives three outgoing edges separate bottom ports, whereas `blocks` merges them into one stem above `Walkthroughs`.

**What hurts reading:**
- **Central hub congestion:** In `Archboard-server-routes` (`Reads and server health`, `Board writes`) and `Board-viewer` (`Stage and reads`, `Moves between pictures`), parallel grey lines and crossings crowd together.
- **Stranded containers (`blocks`):** In `Archboard-server-routes-blocks`, `Board writes` sits isolated bottom-left; `track` pulls it into the middle-right near its callers (`1647×2660` vs `1909×2857`).
- **Inverted hierarchy:** In `Live-panes-blocks`, storage-level `Board writes` sits at the top, whereas `Live-panes-track` places entry points (`Browser`, `Agent CLI`, `Board routes`) at the top and `Board writes` at the bottom. Conversely, in `Board-persistence-track`, turning `Board writes` into a left sidebar and moving `Board reading` top-right packs central tracks tighter than `Board-persistence-blocks`, where `Archboard server` stays top-center.

**`blocks` vs `track`:** Single- or no-container boards (`Codex-workhorse`, `Board-viewer`, `Semantic-renderer`) look identical or nearly identical; multi-container boards (`Archboard-server-routes`, `Board-persistence`, `Live-panes`) differ sharply, as `track` compacts container placement and separates ports while `blocks` spreads clusters apart.
