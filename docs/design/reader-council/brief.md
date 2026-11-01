# Reader redesign council: shared brief

Archboard serves software and cloud architects who work with coding agents. Agents author an architecture model through a CLI. The architect reads it in a desktop browser at 1920 by 1080. PR #19 replaced boards with one canonical model: a recursive forest of modules, each with outgoing relationships, plus flows, proposals, walkthroughs and retained history. A reading selects scope, focus, filters, grammar and optional flow. The renderer draws every line.

The owner reviewed the running branch and wrote this. It is your requirement:

> The whole UX around navigating this new data model needs redesign. It's not working as is, it also looks like the blocks renderer (which was supposed to significantly reduce area in #24) is creating obscene amounts of dead space. The UI, the starting point, and the amount of information crammed into the tiny right side bar is overwhelming the user with information. There's a lot of good ideas in terms of levers to gather the right information to compose beautiful and readable diagrams for the user, and the data model makes sense for recursive decomposition, but the UX execution is truly atrocious. This task needs redesign / reimagining by agents, focusing on the user journey.

The owner also said earlier that #19 "has killed all transitions, the navigation is janky and the UI is extremely poorly done".

Where to look:

- Code: `/home/msc/Projects/t3code/.t3/worktrees/archboard/integrate-main-2026-10-30`, branch `integrate/pr19`. `origin/main` at `396bfd9add2f` is the product before #19, with boards and the Rust renderer. Read-only.
- Start with `PRODUCT.md`, `CONTEXT.md`, `docs/design/operator-canvas-shell.md`, `docs/design/navigator-structure.md`, `docs/design/pane-sidebar-hierarchy.md`, `docs/design/grading-council/criteria.md`, `docs/design/blocks-planned-layout.md`, and `backlog/tasks/task-559*`.
- Reader code: `apps/web/src/ui/components/architecture-model/`, `apps/web/src/ui/components/semantic-board-canvas/`, `apps/web/src/ui/clients/semantic-board-canvas/picture/`, `apps/web/src/ui/components/shell/`.
- Running product: http://127.0.0.1:17842. This repository's own model has 540 modules: http://127.0.0.1:17842/?repoA=github.com/miklschmidt/archboard&modelA=vKEsyHFk
- Drive it with a headless browser: `/tmp/integrate/reader-council/ab.sh <your-session-name> <agent-browser arguments>`. For example `open <url>`, `set viewport 1920 1080`, `click <css>`, `eval <js>`, `screenshot <path>`. Wait a few seconds after opening, because the first draw takes seconds.
- Existing screenshots: `/tmp/integrate/reader-council/evidence/`. Put your own screenshots in the same directory, with your seat in the file name. Look at the pictures yourself. A claim about what a person sees must come from a picture you looked at.
- The server draws a reading: `GET /api/architecture/render?vault=<dir>/.archboard/vault&scope=<module id>`. The answer has `svg`, `width`, `height` and `placed`. Module identities come from `GET /api/architecture/model?vault=...`.

Rules:

- Do not change the repository. Do not commit, push, or edit Backlog. Scratch work goes under `/tmp/integrate/reader-council/`.
- Do not run `bun run eval:skill`. Never pipe `backlog` into `head`.
- Run everything in the foreground. Stay in one turn until your paper is written, because a background wait ends your turn and loses the work.
- You are one seat on a council. Another model writes the same lens independently, and each of you will critique the other. Take positions. Do not list options without choosing.
- Separate what you observed from what you infer. Cite `path:line`, or a screenshot path, or a measured number.
- Judge by the journey of an architect who did not draw this system. Count every element on screen against what that person needs at that moment.
- The desktop shell at 1920 by 1080 is the only target. Do not design phone layouts. The owner rejects eyebrows in UI design, filler text and clutter.
