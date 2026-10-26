# Independent picture-reading criteria

## Reader's task

An architect reads a system that somebody else described. The reader needs to find a part, understand its responsibility, establish membership, and follow what it sends or receives. They then use that understanding to explain the system or assess a proposed change. Reviewers and newcomers also need this understanding from a still picture or a recorded walkthrough.

A useful picture supports a quick overview and a careful answer about one relationship. Attractive spacing and compactness alone prove neither.

## Criteria, highest weight first

1. Trustworthy connections. Test: Can I follow the same relationship between named parts, determine its direction, and associate its labels without guessing at crossings or shared stretches?
2. Recognizable structure. Test: Can I identify the main participants and distinguish containment, highlighted groups, and unrelated neighbors without inferring membership from proximity alone?
3. Readable words with clear roles. Test: At equal viewing conditions, can I distinguish part names, responsibilities, and relationship labels without searching for the words or their owners?
4. A coherent journey. Test: Can I explain the same connected path through several parts without repeatedly searching the whole picture or losing where I started?
5. Useful use of space. Test: Can I keep the relevant parts and readable labels together in view, with space that separates ideas without scattering them?

These weights express reading priorities. I do not award points for symmetry, fewer bends, or fewer crossings without an observable reading benefit. Shared routes help when their common destination stays clear. A long route is acceptable when its purpose and ends remain easy to follow.

## Outright failures

An outright failure loses or misstates meaning, even after inspection at readable magnification:

- A part, relationship, or essential label disappears, is clipped, or is covered beyond recovery.
- A connection appears to terminate on an unrelated part, or its direction or endpoints remain indeterminate.
- Labels cannot be assigned to their relationships, or overlapping boundaries make membership indeterminate.

I require visible evidence, such as content in the companion picture or an unresolved attachment. I do not claim source correctness from pixels alone. Small text at whole-picture scale is a reading cost, not automatically a failure.

## Pair decision

I first view both complete pictures in equal-sized areas, then inspect details at equal text size. This distinguishes crowding from the cost of fitting a large picture. I judge still pictures without assuming that hover or selection will repair them.

Before comparing differences, I choose the same questions for both: locate a named part, establish its membership, and trace a connected path. I also inspect the hardest-looking area in each picture.

If only one picture fails outright, the other wins. If both fail, I return "same" with both failures stated. This means equally unacceptable, not approved.

Otherwise, I classify each difference as substantial, small, or negligible. Substantial means a wrong first interpretation or repeated loss of a path. Small means less effort to reach the same clear answer. Negligible means appearance changes without a reliable task benefit.

Substantial differences decide before small differences. Within the same severity, the higher-weight criterion decides, including when gains and losses conflict. I report the sacrificed benefit explicitly. In a near tie, I prefer the picture that preserves readable context at the common viewing size. If I cannot name a repeatable reading benefit, I return "same". Engine identity never breaks a tie.

## Sample observations

Three things help:

- Live panes, track: Browser and Agent CLI sit above Pane connections. Their blue connections introduce that central part directly. Blocks puts Board writes above these callers, so this reading starts midway down.
- Semantic renderer, both: Layout and measuring, Painting, Key and export, and Board viewer form a recognizable downward chain in the lower half.
- Codex workhorse, both: Purple connections converge on Codex session at the bottom. Their common destination remains apparent despite several separate callers.

Three things hurt:

- Board persistence, track: Board lease sits near the upper left, but Atomic file replacement sits at the bottom left. Their orange Board writes frame encloses a long empty stretch. Blocks keeps these two parts together along the bottom.
- Archboard server routes, track: Live panes sits at the very bottom, far from Board writes and its announcement labels. Blocks places Live panes nearer those labels. Track gives the pink connection into Semantic renderer a more direct downward route, illustrating a real tradeoff.
- Board viewer, both: Tall label columns below Stage and reads dominate the center and separate it from Camera and pointer. Reading the detail interrupts the overview.

Board viewer, Semantic renderer, and Codex workhorse look effectively unchanged between engines for these reading tasks.

Sources: PRODUCT.md, CONTEXT.md, and all twelve PNGs in /tmp/council/samples/. I consulted no excluded files, scoring code, or other grader's criteria.
