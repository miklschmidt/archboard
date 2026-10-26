# Grading criteria (opus)

## 1. What the reader is trying to do

An architect who did not draw the board wants to understand the system from the picture alone. They ask three questions, in this order:

1. **Where does it start and end?** The callers, and the parts everything leans on.
2. **Who talks to whom, and why?** They follow each line of a card to the other card and read its label.
3. **What belongs together?** Each group is one concern.

The reader follows lines with the eye. If the eye can follow each line to its end without help, the picture reads well.

## 2. Criteria, by weight

1. **Every line can be followed (weight 5).** No line is lost at a crossing, a merge or a long parallel run. _Test: trace the lines of the three busiest cards in A and in B. Count the lines that you lost or were unsure about._
2. **Every label belongs to one line (weight 4).** A label stack sits on its line, near its ends, not beside another line. _Test: for each label stack, can you name its two cards at once?_
3. **Direction of reading (weight 3).** Callers and entry points are at the top. Shared foundations are at the bottom. Most arrows point the same way. _Test: count the arrows that point up or that loop back across the picture._
4. **Short, direct relationships (weight 3).** Cards that talk are near each other. Few lines go around the edge. _Test: count the lines that travel more than about half the height or width of the picture._
5. **Groups are compact and honest (weight 2).** A group frame holds its members close together and holds nothing else. _Test: compare the size of each frame with the size of its members._
6. **Calm density (weight 1).** Space is spread evenly, with no dense knots beside empty fields. The aspect suits a 1920×1080 pane. _Test: which picture can you show without an apology?_

## 3. Defects that fail a picture outright

- A line passes through a card, or a label or card covers text.
- A label sits on the wrong line, or it is equally near two lines. Then its meaning attaches to the wrong relationship.
- A junction joins lines that go to **different** targets. Then the reader cannot tell which source reaches which target. A fan-in to one shared target is not a defect.
- An arrowhead is hidden or missing, so the direction cannot be seen.
- A card is outside its group, or a group frame encloses a card that is not a member.

## 4. How I decide

- First, apply section 3. If only one picture has a fail defect, the other reads better. If both have one, I compare their count and harm, then use the criteria.
- Then I score each criterion as A better, B better or even, with the weights above. If the weighted lead of a side is 3 points or more, that side wins.
- **Trade-offs.** The higher weight wins: when A is better on criterion 2 and B on criterion 4, A wins. Lines that can be followed and labels that belong come first. They decide whether the facts are right; direction and length decide only speed.
- **Near tie** (a lead under 3): I do the reader task. I name every neighbour of the two most connected cards, with labels. If I do this faster and with fewer doubts in one picture, that picture wins. If I feel no difference, I grade **same**.
- If the pictures differ only in pixels that a reader does not notice, I grade **same**. Three sample pairs are almost identical.

## 5. What I saw in the samples

**Helps reading:**

- _Semantic renderer_ (both): one pipeline from top to bottom, from Archboard server to Board viewer. Teal data lines mark the main path.
- _Live panes track_: Board routes, Agent CLI and Browser are at the top, and Board writes is at the bottom. Most arrows point down. In _blocks_, the store is at the top, the callers are at mid-height, and many arrows point up. Track reads better here.
- _Board persistence_ (both): small hops at crossings keep a crossing from looking like a junction.

**Hurts reading:**

- _Board persistence track_: the Board writes frame spans almost the full height, with Board lease at its top, Atomic file replacement at its bottom and empty space between. The entry card, Archboard server, is at mid-height. In _blocks_, the server is at the top and the group is compact. Blocks reads better, but its bus into Board reading merges five lines.
- _Archboard server routes_ (both): stacks of 6 to 8 labels are far from both ends of their line. Examples are "announce the accepted write" at the lower right in track and "one batch under the board's lease" at the lower left in blocks. Both have long lines down the edges. Neither is clean, so the count of lost lines decides.
- _Board viewer_ (both): the 11-label stack into Camera and pointer stands beside the Moves between pictures card and its own stack. I hesitate to say which line owns it.
- _Codex workhorse_ (both): four RPC lines join one bus above Codex session. This is a fan-in, so it is acceptable, but you cannot see which caller sends what.
