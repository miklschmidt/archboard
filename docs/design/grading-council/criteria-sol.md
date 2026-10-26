# Independent criteria for reading architecture boards

## The reader's job

An architect must understand a system that an agent describes, then judge a proposed change against that understanding. A reviewer or newcomer must follow the explanation without the original author beside them. The picture must answer: what does each part do, what belongs together, and who reaches whom? It must support following a consequence through several parts and finding the next subject to inspect.

This purpose comes from [PRODUCT.md](/home/msc/Projects/t3code/.t3/worktrees/archboard/t3-9428b037/PRODUCT.md) and [CONTEXT.md](/home/msc/Projects/t3code/.t3/worktrees/archboard/t3-9428b037/CONTEXT.md). The criteria below come from looking at the twelve supplied pictures. I did not consult excluded files or other graders.

## Criteria, highest weight first

1. Relationships can be read with confidence. Test: Can I follow the same connection from its source through its label to its directed destination without guessing or restarting?
2. The architecture forms an understandable whole. Test: Can I identify the main responsibilities, their memberships, and the main interactions after a brief scan?
3. Words remain usable information. Test: Can I scan names and read descriptions without confusing adjacent text or losing the part that the words describe?
4. Related work stays mentally together. Test: Can I inspect a part and its immediate collaborators without repeatedly searching across unrelated regions of the picture?
5. Space supports an overview and detail. Test: In the same desktop rectangle, can I retain the whole explanation while reading useful detail with little camera movement?

A group marks a shared concern. A container holds parts. Criterion 2 includes distinguishing these meanings where the picture shows them. A short route earns no credit if its destination becomes uncertain. Empty space earns credit when it separates explanations, but loses credit when it separates collaborators or inflates a frame around little content.

## Defects that fail outright

Any of these fails a picture regardless of its other strengths:

- A cropped, covered, or broken part name prevents identification, even at a readable enlargement.
- A connection loses its source, destination, direction, or label association, leaving two plausible architectural readings after close inspection.
- A boundary visibly makes membership contradictory, or overlapping parts prevent the reader from separating their content.

Small text at whole-picture scale is a readability cost, not an automatic failure if enlargement recovers it. An unambiguous crossing is acceptable. I cannot establish agreement with the code from pictures alone.

## Deciding a pair

I compare both pictures inside equal desktop rectangles, first fitted whole and then at matched text size. I scan the entire board for failures. I then trace the same entry relationship, onward relationship, and relationship across a visible boundary, where present.

If only one picture fails, the other wins. If both fail, I report “same” with a “both fail” explanation. Otherwise, I use the first ranked criterion with a meaningful difference. Meaningful means that the difference removes uncertainty, repeated searching, or a barrier to understanding a part of the explanation. A small cosmetic difference does not decide a higher criterion.

When criteria conflict, the meaningful difference at the higher rank decides. Within one criterion, I favor the gain that affects more of the explanation or removes the more serious reading obstacle. For a near tie, I repeat the difficult trace from the opposite end. If neither picture gives a repeatable reading advantage, I choose “same.” I name the decisive location and any cost in the winning picture. Engine identity never breaks a tie.

## Evidence from the samples

Things that help:

- Semantic-renderer, both: the lower central chain from Layout and measuring through Painting and Key and export gives the explanation a clear spine.
- Live-panes, track: Agent CLI and Browser sit above Pane connections, with their blue connections leading into it. Blocks puts the orange Board writes region above those callers, so the starting point takes more searching.
- Board-persistence, blocks: the bottom orange region puts Board lease and Atomic file replacement beside each other. Their shared concern reads as one neighborhood.

Things that hurt:

- Board-persistence, track: the orange region extends down most of the left side, with those two functions at opposite ends. Its empty middle separates collaborators.
- Board-viewer, both: tall label columns below Stage and reads separate it from Moves between pictures and Camera and pointer. Reading detail costs the overview.
- Archboard-server-routes, blocks: Board writes near the middle is far from Semantic board store at bottom left. Track brings the store closer, but moves Live panes to the bottom, so the improvement has a cost.

Codex-workhorse preserves the same readable central progression in both engines. Board-viewer also shows no substantial reading difference. Semantic-renderer changes a local turn above Layout and measuring without changing its explanatory spine.
