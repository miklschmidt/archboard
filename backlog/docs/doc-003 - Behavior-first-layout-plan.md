---
id: doc-003
title: Behavior-first layout plan
type: specification
created_date: '2026-11-06T19:05:00Z'
updated_date: '2026-11-06T19:06:00Z'
---
# Behavior-first layout plan (TASK-582.03)

## Owner decisions (2026-11-06)

- Four layout layers in the PR stack, below the gate (TASK-585): A rules and codemod, B packages, C cli, server and web, D the remaining packages and the end of the ratchet.
- Q1 voice: cut the model along the runtime and server line (option B).
- Q2 crates: NEITHER option of the plan. Each Rust crate is its own root module, at the same level as the packages, with no additional container. The modules bound inside a crate become parts of that crate's root. Read every "Renderer core" below as "one root per crate".
- Q3 duplicates: merge (retarget the flows, remove Code findings memory 6E6hL0Zk#SmrySjjM, Code facts and Code evidence). Standing rule: the code answers every question about duplicate identities, never the owner (consumer skill, "Fix the map from the code").
- Q4 to Q7 take the plan's recommendations: move the layout research scripts into scripts/layout-investigation/, commit scripts/move-source.ts, move the three Rust legend files into paint/legend/, use the folder names proposed (legacy-boards, not legacy).

## The plan

## Findings that shape the plan

- **Areas are the top folder under `src/`, so a module whose parts sit in two areas can never be bound to one directory.** That applies to 22 of the 83 warnings: their parts span areas or workspaces, or include a file whose path is fixed (an app entry, a Rust crate, a script). Those need a model change. The other 61 are cleared by moving code inside one area. Moving files and fixing the model is not enough for 6 of the 22: they also depend on owner decisions (Q1, Q2, Q3, Q5).
- **`runtime` and `server` are treated the same by lint.** `tools/oxlint-plugin-archboard/source-layout.ts:38-44` gives both the same import denials (`cli`, `ui`). Only the docs separate them (`docs/agents/boundaries.md:633-644` for the voice package). That makes the voice package an owner decision (Q1).
- **Today only containment warnings exist.** `chk-text3.txt` has 83 warnings, all containment. Everything else is information (306 `RELATIONSHIP_UNDRAWN`, 68 `EXPOSED_UNUSED`; their total exceeds 187 because one count includes the code section). So no model edit may add `CONTAINER_PASS_THROUGH`, `ROOT_UNCONNECTED`, `CONTAINER_LINE_TO_OWN_PART` or `RELATIONSHIP_ON_CONTAINER` (`packages/model/src/runtime/operations/check/structure.ts:60-120`).
  - Consequence: never reparent a part under a module that is a leaf today. A leaf has relationships, and gaining a part would make them land on a container. Also avoid removing containers: flows and walkthroughs cite most of them.
- **The archive rule forbids a folder named `legacy`.** `layout-rules.ts:38` refuses any string literal with a `legacy` path segment, so every `#runtime/legacy/...` import would fail. New folders use `legacy-boards`.
- **A folder named after an area is confusing.** Three exist today: `apps/cli/src/cli/{clients,operations}/server` and `packages/workbench/src/ui/{components,hooks,rules}/runtime`. Rename them.
- **The vault update must happen in the same commit as each move.** `archboard check` includes the code check (187 information findings). A stale binding or anchor turns into a finding.
- **Active proposals already cite paths that no longer exist** (for example, `zFIdZB1Y` cites `packages/workbench/src/runtime/services/...`), and the code check reads no proposal states (`states: 0`). Leave proposals alone.

## 1. The target layout rule (for boundaries.md, with ADR 0075 amending ADR 0055:30,37)

**Text for boundaries.md:**

> Below `src/` the areas stay: `shared`, `runtime`, `server`, `ui`, `cli`. Inside an area, code is grouped by behavior first.
>
> A **behavior folder** holds every file of one job in one area. A sub-job is a sub-folder. Name it for the job. It is never a role name, an area name, a generic bucket name, or `legacy`.
>
> A **role folder** (`api clients components constants hooks lifecycle middleware operations processes projections protocol routes rules schemas services sockets state store wiring workers`) is always the last folder of a path, and holds files only. The path form is `src/<area>/<behavior>[/<behavior>…]/<role>/<file>`.
>
> - `src/<area>/<role>/<file>` with no behavior folder is allowed, for code that belongs to the area as a whole. Examples: `timing`, `diagnostics`, `process`, `shared/rules/ids.ts` (cited by CLAUDE.md).
> - `src/<area>/api/` stays directly under the area. It is the area's interface, and `package-api.test.ts:36-47` holds the `exports` to it.
> - Tests mirror their source under `tests/<area>/…`. `tests/<area>/support/` stays.
> - Generated and ignored trees keep their tool's shape (`shared/protocol/generated/**`).
> - The `#*` aliases do not change. Every `package.json` maps `"#*": "./src/*"`.
> - A module with parts binds its behavior folder (TASK-582).

**Lint rules and what each one becomes (AC #2):**

| Rule or policy (evidence) | Today | New form; the guarantee it keeps |
|---|---|---|
| `archboard/ui-concern-placement` (`ui-rules.ts:26-35`, `:92-98`) | Concern = the first segment below `ui/` | Concern = the one role segment of the path. While the move runs, the role may sit in either position, so both layouts pass. In the final commit the role must be the parent folder of the file. Markup only in `components/`; hooks only in `hooks/` (and re-exported from `api/`); naming rules unchanged. Add a `twoConcerns` message for a path with two role segments. |
| `archboard/assistant-ui-imports` (`assistant-ui-imports.ts:32-33`, `:103-107`) | Owner = segment `[1]` below `packages/workbench/src/ui` | Owner = any behavior segment `thread` or `assistant-runtime` before the role folder (renamed from `runtime`). Forbidden APIs unchanged. |
| `archboard/state-files-pure` (`source-layout.ts:109`) | A `state/` folder at any depth | Unchanged. Works inside behavior folders. Add new-form fixtures to `app-boundaries.test.ts:386-401`. |
| `.oxlintrc.jsonc:189-196`, frame-clock override | Canvas below each of 8 role folders; workbench `subtitles` below 4 role folders | `apps/web/src/ui/architecture-drawing/canvas/**` and `packages/workbench/src/ui/workbench-client/subtitles/**`. Keep both glob forms until each app has moved. Update `ui-lint-policy.test.ts:296-331` (lists of restricted and free files). |
| `.oxlintrc.jsonc:308-332`, vendored-file exemption list | Lists `ui/components/shadcn/*` and `ui/components/thread/*` | The same files at their new paths. The list stays exact, never a wildcard. |
| `archboard/mapped-source-paths` (`layout-rules.ts:288`) | Checks the area only | Logic unchanged. Message says "a behavior folder of an area". |
| `import-boundaries` area directions (`source-layout.ts:121`) | Area = first segment | Unchanged, because areas stay first. |
| `vite.config.ts:189-211`, `:368-375`, `:410-440`, test lanes | Names test files by path; `--path-ignore-patterns` | Every path updated in the commit that moves it. Add a repository test that every path the config names exists. Otherwise a stale ignore pattern puts capacity, benchmark or solo tests into the normal lane. |

**New checks in `workspace-layout.test.ts` (AC #1, in commit A1, before any code moves):**
- (a) Every tracked `.ts`/`.tsx` file under `packages|apps/*/{src,tests}/<area>/` has exactly one role segment, and it is the last folder.
- (b) No folder below an area is named after an area.

A **ratchet** keeps every commit green: a constant lists the `<workspace>/<src|tests>/<area>` trees that are still role-first. The test skips files in those trees, and it fails if a listed tree has no role-first file left. So each move commit must delete its entries, and the last commit deletes the constant.

## 2. Verdict for each warning

**The default move (D):** `<area>/<role>/<b…>/<f>` becomes `<area>/<b…>/<role>/<f>`. The depth stays the same, so `../` chains survive. Flat `<area>/<role>/<f>` files stay put unless listed below.

**Prefix overrides (P)** are written `old behavior → new prefix`. **File overrides (F)** name single files. Each container is then bound to its new folder with `edit-module set.binding`.

Every binding is in `github.com/miklschmidt/archboard`. Unbound files go to the new home of their old behavior folder. The codemod can propose a deeper place for one only when all its in-workspace importers sit in one sub-behavior; a person reviews those proposals.

**codex-app-server (2)**
- **#11 Codex session: code move.** Bind `src/runtime/session`.
  - `runtime/services/session{,-api,-failures,-operations,-request-identities,-reverse-requests}.ts` → `runtime/session/services/`
  - `runtime/operations/response-identity-{adoption,branding,collection}.ts` → `session/operations/`
  - `runtime/store/storage-proof.ts` → `session/store/`
  - `runtime/schemas/session-{contract,responses}.ts` → `session/schemas/`
- **#16 Codex transport: code move.** Bind `src/runtime/transport`.
  - `runtime/clients/*` (10 files) → `transport/clients/`. Rebind Frame transport there.
  - `runtime/operations/{inbound-router,late-responses,public-values,request-operations,request-settlement,reverse-ledger,reverse-request-router,reverse-responder}.ts` → `transport/operations/`
  - Evidence: these are imported only by `clients/transport.ts` (import scan).

**walkthrough (3)**
- **#32 Video encoder and #58 Video encoding: code move.** Bind both to `runtime/video-encoding`.
  - `processes/video-encoder.ts` and `services/ffmpeg.ts` → `runtime/video-encoding/{processes,services}/`
- **#57 Walkthrough video: code move.** Bind it to `runtime`.
  - `runtime/{operations/*,clients/recording-page.ts,services/recording-tools.ts,store/*}` → `runtime/recorder/<role>/`
  - Rebind both Walkthrough recorder modules to `runtime/recorder`.

**workbench (5)**
- **#12 Workbench client: code move.** Bind `src/ui/workbench-client`.
  - P: ui `dock,orb,panel,subtitles,thread,voice,surfaces` → `ui/workbench-client/<b>`
  - P: ui `runtime` → `ui/workbench-client/assistant-runtime`
- **#13 Voice session: D only.** Bind `ui/voice-session`.
- **#17 Archboard workbench host and #70 Narration host: code move.**
  - `server/services/owner/*` → `server/workbench-host/services/`. Host wiring binds there.
  - `services/host/archboard-presentation.ts` → `workbench-host/narration/services/`
  - `projections/semantic-context/walkthrough-narration.ts` → `workbench-host/narration/projections/`
  - Bind host to `server/workbench-host` and Narration host to `server/workbench-host/narration`.
- **#18 Thread tool calls: code move.** Bind `runtime/dynamic-tools`.
  - D, plus P: `dynamic-tools/{mutation,projection}` → `dynamic-tools/dispatch/<b>`. Thread tool dispatch binds `dynamic-tools/dispatch`.
  - F: `services/dynamic-tools/wait.ts` → `dynamic-tools/settlements/services/`
  - F: `services/dynamic-tools/quarantine/*` → `dynamic-tools/settlements/quarantine/services/`. Thread tool settlements binds `dynamic-tools/settlements`.

**skills (5): all code moves into `src/runtime/evaluation/`.** Skill evaluation rebinds from `src/runtime` to `src/runtime/evaluation`.
- **#28 Batch and inputs** → `evaluation/batch/{operations/{batch,pin-versions}.ts, schemas/suite.ts, services/citations.ts}`
- **#29 One run's world** → `evaluation/run-world/{operations/{author,vault,install}.ts, processes/{archboard,server,flask,isolation}.ts}`
- **#31 Run checks** → `evaluation/run-checks/{operations/{captures,reaudit}.ts, audit/rules/*, outcomes/rules/*}`
- **#35 Grading** → `evaluation/grading/{clients/*grader*.ts, operations/grading/*, store/grading-images.ts}`
- **#37 Reporting** → `evaluation/reporting/{rules/reports/*, store/records.ts}`
- Other files: Eval CLI `operations/evaluation/command.ts` → `evaluation/operations/`. Distribution (`operations/distribution`, `projections/schemas.ts`) → `runtime/distribution/`.

**model (10)**

*Model corrections first:*
- Move to the model root, because they are shared-area code and areas stay:
  - Canonical model contracts
  - Module interface
  - Shared model projection
  - Migration planning contracts (`shared/schemas/migration.ts`)
- Bound vaults → Canonical model read. Its own header says "Known canonical models" (`runtime/store/bound-vaults.ts:1`), and it is imported by `api/store-read.ts`.
- Vault configuration → Architecture runtime API. Canonical `read/model-read.ts` and `api/vault-policy.ts` import it, not only legacy code.
- Legacy board documents and Legacy addresses → Architecture runtime API. `runtime/api` exposes them (`./store-read`, `./store-write`, `./legacy-address`; boundaries.md:283-286).

*Code moves and new bindings:*

| # | Container | Moves | Bind |
|---|---|---|---|
| #76 | Canonical architecture | everything below | `runtime/canonical` |
| #65 | Canonical checkpoint operations | `operations/history/*` and `store/model-publication.ts` → `canonical/history/{operations,store}` | `canonical/history` |
| #74 | Canonical edit operations | `operations/model-edit/*` → `canonical/edit/operations` | `canonical/edit` |
| #77 | Canonical installation | `store/{model-install,model-state}.ts` → `canonical/installation/store` | `canonical/installation` |
| #80 | Canonical local news | `store/{model-news,model-history-news}.ts` → `canonical/installation/news/store` | `canonical/installation/news` |
| #67 | Canonical archive objects | `store/model-archive{,-blobs,-location}.ts` and `model-source.ts` → `canonical/archive/store` | `canonical/archive` |
| — | Canonical model read, Compact proposals | read and proposals → `canonical/{read,proposals}/operations` | their new folders |
| #68 | Legacy board documents | `store/{legacy-address,legacy-authority,migration-installation,migration-plan}.ts` → `runtime/legacy-boards/store` | `runtime/legacy-boards` |
| #44 | Legacy board reading | `store/format/*` → `legacy-boards/reading/format/store`; `operations/legacy-inventory/*` → `legacy-boards/reading/inventory/operations` | `legacy-boards/reading` |
| #64 | Canonical model contracts | `shared/schemas/{model,model-flows,model-operations}.ts` → `shared/canonical-contracts/schemas` | `shared/canonical-contracts` |
| #3 | Architecture runtime API | after the corrections above | `packages/model/src/runtime` |

Also: `store/lock` and `operations/check` get D.

**renderer (12)**

*Model corrections (Q2):* add a root, **Renderer core**, bound to `crates`. Reparent every module bound in a crate into it:
- Core render, Flowchart, Sequence layout, Measured text, Edge geometry
- Painting, Painter core, Browser painter, SVG document, Text shaping
- Orthogonal router and Graphviz, which leave Block layout because they are separate crates
- Layout and measuring, which then binds `crates/archboard-layout/src` and is better renamed "Layout"

Evidence: crates are root Cargo members (`Cargo.toml:5`, ADR 0059).

*Verdicts:*

| # | Container | Verdict | Bind |
|---|---|---|---|
| #7 | Layout engines | Model. Block engine moves in from Block layout (it asks the solver: `architecture/choosing.rs:59`). Compound graph moves in. Engine selection moves out to Block layout (`blocks/place.rs:45` is the solver side). | `crates/archboard-layout/src/architecture` |
| #26 | Block layout | Model (see #7 and the reparents above). | `crates/archboard-layout/src/blocks` |
| #47 | Layout and measuring | Model. It becomes the layout crate, holding Layout engines and Block layout. | `crates/archboard-layout/src` |
| #25 | Engine and graph | Model and code. It moves to the renderer root and Engine pool joins it. D: `shared/rules/engine` → `shared/engine/rules`. | `src/shared/engine` |
| #43 | Render entry | Model and code. Pane marks moves in. D: `shared/rules/render` → `shared/render/rules`. | `src/shared/render` |
| #53 | Legend and export | Model and a Rust move. It reparents under Painting. `paint/{export,legend_entries,legend_symbols}.rs` → `paint/legend/{export,entries,symbols}.rs` plus `legend/mod.rs`. Fix the uses at `export.rs:19`, `legend_symbols.rs:13` and `paint/mod.rs:24,31,55` (Q6). | `crates/archboard-scene/src/paint/legend` |
| #19 | Bun renderer | Code. F: `operations/render.ts`, `services/{bun-host,core}.ts`, `processes/layout-worker.ts` → `runtime/bun-renderer/<role>/`. The relative worker URL stays valid. Update `vite.config.ts:37` and `layout-workers.test.ts:61,108`. | `runtime/bun-renderer` |
| #20 | Headless browser | D | `runtime/headless-chromium` |
| #56 | Browser hosting | D | `runtime/headless-chromium` |
| #41 | Semantic rasterizer | D for `rasterizer`. PNG recipe chunk moves in the model to the renderer root, not under Render recipe, which is a leaf with relationships. Its importers are `recipe/read-recipe.ts` and `api/recipe.ts`, not the rasterizer. Rebind the duplicate Picture rasterizer too. | `runtime/rasterizer` |
| #83 | Layout investigation | Model and code (Q4). It becomes a root. `docs/design/wide-board-layout-fixtures/{measure,timing}.ts` and `scripts/{engine-gallery,render-corpus}.ts` → `scripts/layout-investigation/`. | `scripts/layout-investigation` |
| #49 | renderer | Cleared by the rows above. | — |

**cli (4)**
- **#15 Command routing: code move.** Bind `src/cli/routing`.
  - P: `invocation` and `routing` → `cli/routing`
  - Rebind Command dispatch to `routing/operations` and both Command catalogue modules to `routing/operations/run.ts`.
- **#38 Command contract: model and code.** Bind `cli/contract`.
  - Model: Status → Commands. It is imported only by the command table, `invocation/run.ts`.
  - P: `execution` and `bootstrap` → `cli/contract`. F: `clients/server/prerequisites.ts` → `contract/clients/` (its only importer is `execution.ts`).
  - `rules/{commander,contract}` and `store/artifacts` follow `execution.ts`.
- **#42 Commands: code move.** Bind `cli/commands`.
  - P: `model, vault, install-skill, pane, repo, contract-artifacts` → `cli/commands/<b>`; `server` → `cli/commands/server-control`
  - `rules/{model,semantic/draw}` → `commands/model/rules`; `{protocol,rules}/check` → `commands/vault/<role>`
  - D plus rename: `clients/server` → `cli/server-access/clients`
- **#62 Command startup: model.** Entry point moves to the Agent CLI root, because the entry path is fixed (`source-layout.ts:16-21`, boundaries.md:33). Then bind `cli/routing`.

**server (9)**
- **#59 HTTP serving** → `src/server/http`
  - `wiring/{application,http,owners}` → `http/{application,listener,owners}/wiring`
  - `store/frontend` → `http/frontend/store`
- **#6 Route handlers** → `http/handlers`
- **#46 Architecture writes** → `http/handlers/architecture-writes`
  - `routes/architecture/{model-edit,portable}-routes.ts`
  - `middleware/mutation-work`
- **#52 Code checks on request** → `http/handlers/code-checks`
  - `routes/code-check`, `state/code-findings`, `services/checkout-work`
- **#50 Reads and server health** → `http/handlers/reads/routes`
  - The other `routes/architecture/*` files, `model-response.ts` and `routes/service`
- Repository routes → `http/handlers/repositories/routes`
- **#61 Panes and the workbench** → `server/panes`; **#36 Pane connections** → `panes/connections/{routes,sockets,state}`
  - `routes/panes`, `sockets/panes`, `state/pane-vaults` → `panes/connections/`
  - `state/agent-activity` → `panes/announcements/state`
- **#60 Start and stop: model and code.** Server entry moves to the Archboard server root (its path is fixed). `lifecycle/*/*` → `server/start-stop/lifecycle/`.
- **#63 Code evidence: model (Q3).** Its two parts duplicate modules that already exist. Code findings memory `6E6hL0Zk#SmrySjjM` binds the same file as `HBlhIeSD#yYQ3AHkf`. Code facts is the server-side copy of code-intel's Fact analysis.

**codex-realtime-voice (13): Q1, option B (cut the model along the area line).**

*Model corrections:*
- These move to the package root: Voice, Workhorses, Approvals, Epoch ledger, Thread unload.
- Session workhorses and Workhorse checkouts move to Per-tab sessions. They import `#server/protocol/gateway` and `#server/services/sessions`.
- Voice session actions and Voice agent move to Voice agent backend.

*Code moves (runtime area):*
- P: `coordinator, coordinator-callbacks, realtime` → `runtime/voice/<b>`
- P: `coordinator-tools`, `spoken-approval`, `coordinator-tool-contract` → `runtime/voice/coordinator/tools-and-work/{coordinator-tools,spoken-approval,tool-contract}`
- P: `thread-context, thread-link, wait-graph, workhorse-operations, workhorse-queue, workhorse-start, instructions` → `runtime/workhorses/<b>`
- F: `server/services/voice/outcome-report.ts` → `runtime/voice/coordinator/services/`. It imports only runtime code.

*Code moves (server area):*
- P: `gateway` and `command` → `server/chat-conversations/gateway`
- F: `actions/{text-actions,browser-gateway}.ts` → `gateway/services`
- F: `actions/thread-links.ts` → `chat-conversations/conversation-start/services`
- P: `browser-state` → `chat-conversations/browser-state`
- P: `announce` → `server/sessions/announce`

*Bindings:*

| # | Container | Bind |
|---|---|---|
| #55 | Voice | `runtime/voice` |
| #14 | Voice coordinator | `runtime/voice/coordinator` |
| #33 | Tools and work | `…/coordinator/tools-and-work` |
| #23 | Coordinator callbacks | `runtime/voice/coordinator-callbacks` |
| #54 | Workhorses | `runtime/workhorses` |
| #21 | Workhorse operations | `runtime/workhorses/workhorse-operations` |
| #27 | Workhorse start | `runtime/workhorses/workhorse-start` |
| #51 | Chat conversations | `server/chat-conversations` |
| #4 | Browser gateway | `…/chat-conversations/gateway` |
| #48 | Per-tab sessions | `server/sessions` |
| #45 | Child ownership | `server/generation` |
| #66 | Voice agent backend | `src/server`, unchanged |
| #72 | Public entries | `ui/voice-client`, its one remaining part |

**apps/web (20)**

*Model corrections:*
- **#9 and #39:** Subject code marks moves to Retained reads. `code-marks.ts` is imported by `ModelDiagram.tsx` and `use-code-marks.ts`, not by `SemanticLegend.tsx`.
- Optional: Shown conversation moves to Application composition. Its only importer is `clients/application/shell-actions.ts`.

*Code moves (P):*
- `application` → `ui/application`. F: `components/architecture-model/ModelExplanationHost.tsx` → `application/components/` (its only importer is `ApplicationPane.tsx`).
- `architecture-model` → `ui/architecture-drawing/model-reader`:
  - `clients` → `model-reader/access/clients`; `use-architecture-feed.ts` → `access/hooks`
  - `components` → `model-reader/reading/components`
  - `ModuleNavigation.tsx`, `use-model-navigation.ts`, `use-reference-navigation.ts` → `reading/module-navigation/{components,hooks}`
  - `use-model-catalog.ts` → `panes/model-catalog/hooks`; `use-model-location.ts` → `panes/reading-routing/hooks`
- `components/canvas` → `architecture-drawing/canvas/presentation/components`; `state/canvas/pane-vault.ts` → `canvas/pane-vault/state`
- Other canvas code → `architecture-drawing/canvas/picture/{camera,supply,transitions,reads}/<role>/`, file by file following each part's parent. For example `reads/{local-pictures,picture-cache,picture-source}.ts` → `supply/clients`; `rules/canvas/reading/address.ts` → `picture/rules`.
- `pane-session`, `model-catalog`, `reading-routing` → `ui/panes/<b>`. F: `tab-session.ts` → `panes/tab-session/clients`.
- `walkthrough-recording` → `ui/walkthroughs/recording`; `walkthrough-replay` → `ui/walkthroughs/replay`.

*Bindings:*

| # | Container | Bind |
|---|---|---|
| #1 | Application composition | `ui/application` |
| #30 | Architecture drawing | `ui/architecture-drawing` |
| #78 | Canonical model reader | `…/model-reader` |
| #81 | Model access | `…/model-reader/access` |
| #79 | Model reading | `…/model-reader/reading` |
| #82 | Module navigation | `…/reading/module-navigation` |
| #9 | Diagram presentation components | `…/canvas/presentation` |
| #39 | Diagram legend | `…/presentation/components/SemanticLegend.tsx` |
| #2 | Picture clients | `…/canvas/picture` |
| #73 | Camera and pointer | `…/picture/camera` |
| #69 | Picture supply | `…/picture/supply` |
| #75 | Picture transitions | `…/picture/transitions` |
| #71 | Retained reads | `…/picture/reads` |
| #34 | Panes and workspace | `ui/panes` |
| #10 | Model catalogue | `…/panes/model-catalog` |
| #5 | Pane session | `…/panes/pane-session` |
| #8 | Workspace routing | `…/panes/reading-routing` |
| #40 | Walkthrough recordings | `ui/walkthroughs` |
| #22 | Walkthrough recording | `…/walkthroughs/recording` |
| #24 | Walkthrough replay | `…/walkthroughs/replay` |

**Containers where I think the model, not the code, is wrong:**
- #7 and #26: parts swapped between Layout engines and Block layout.
- #26: separate crates sit inside Block layout.
- #9 and #39: Subject code marks is not legend code.
- #41: PNG recipe chunk is recipe code, not rasterizer code.
- #38: Status is a command.
- #68: Bound vaults and Vault configuration are canonical, not legacy.
- #3, #44, #64, #76: shared-area parts sit under the runtime API.
- #60 and #62: the entry files have fixed paths.
- #63: duplicate subjects.
- #43, #47, #49, #53: Rust crates sit under a TypeScript package.

## 3. Collisions, risks and tooling

**Codemod: `scripts/move-source.ts` (Q5).**
- Input: a reviewed manifest. Plan mode builds it from D plus the overrides, and proposes places for unbound files from their importers.
- It runs `git mv` on each file, then rewrites:
  1. Every string literal that equals a mapped `#<area>/…` or `#tests/…` specifier, in the same workspace. This covers imports, `export from`, `import()`, type imports, `mock.module`, `import.meta.resolve` and CSS `@import`.
  2. Relative specifiers, `new URL("…", import.meta.url)` and `join(import.meta.dir, "..")`, in moved files and in files that point at them. It resolves the old target, maps it, and re-relativizes. Known cases: `renderer/src/runtime/services/bun-host.ts:67`, `store/assets.ts`, `store/core-sources.ts`, `tests/runtime/services/core-panic.test.ts:12`, `timing.ts:16`.
  3. Repository-path literals in:
     - `vite.config.ts` lanes and worker path
     - `.oxlintrc.jsonc`
     - `components.json` (when ui-kit moves)
     - `docs/readme/assets.json`
     - the command-owner paths in `apps/cli/.../run.ts`
     - the root `package.json` `generate:cli-contract` script
     - `docs/agents/{boundaries,frontend,test-suite}.md` and package READMEs
- Excluded: `backlog/`, `docs/design/*.md`, `docs/adr/`, proposals.
- **Vault:** it reads `archboard model read` and emits one claim plus one `model edit` intent:
  - `edit-module set.binding` (selectors kept)
  - `edit-relationship set.anchor`
  - `edit-step set.anchor` for flow steps
  - claims for every affected subject, then `model release`
- Structural corrections (`edit-module set.parent`, `add-module` for Renderer core, renames) go in a separate intent, before the rebind intent of the same commit.

**Order inside each commit:**
1. Move the files.
2. `bun run types`.
3. `archboard restart`. A running server keeps its old source, and the CLI refuses a stale one.
4. Run the vault intent.
5. `archboard check`.
6. `bun run check`.

**Specific risks:**
- **CLI:** run `bun run generate:cli-contract` to regenerate the proof and `docs/design/cli-command-audit.json`.
- **Rust:** `nix develop -c cargo test -p archboard-scene`, then `bun run build:core`.
- **Embeds:** run `archboard check embeds`. Root-level model changes (Renderer core, the Layout investigation root) can make the README architecture SVGs stale. Refresh them as `docs/agents/readme-assets.md` describes. `readme:check` is informational.
- **Walkthroughs:** a beat whose scope loses a part may need `edit-walkthrough`. Check after each model intent.
- **Rename detection:** a move commit holds no edits beyond path rewrites. Review with `git show -M40% --stat`. Keep each commit under 1000 renames (apps/web is about 580).
- **Proposals:** leave them as they are; their paths are already stale.

## 4. Order of work

Each step leaves `bun run check` green. "Warnings" means the containment warnings after the step.

| Step | Content | Warnings | Extra verification |
|---|---|---|---|
| A1 | ADR 0075; layout sections of boundaries.md and frontend.md; workspace-layout test with the ratchet; test that vite test paths exist; lint rules accept both forms; rule tests | 83 | lint tests prove both forms pass and the old guarantees hold |
| A2 | `scripts/move-source.ts`, with a dry run over apps/web | 83 | none; lint covers the script |
| B1 | codex-app-server | 81 | |
| B2 | walkthrough | 78 | |
| B3 | workbench | 73 | |
| B4 | skills | 68 | |
| B5a, B5b | model: corrections, then moves | 58 | |
| B6a, B6b | renderer: model restructure and Rust move, then TS moves | 46 | `cargo test`, `build:core` |
| B7a, B7b | voice: area cut, then moves | 33 | |
| C1 | cli | 29 | `generate:cli-contract` diff is clean |
| C2 | server | 20 | |
| C3 | web; drop the old frame-clock globs | 0 | browser lane runs inside `bun run check` |
| D | pure D moves of the packages with no warning (code-intel, code-opener, code-binding, ui-kit plus `components.json` aliases, server-requests, server-lifecycle, workspace, workbench-example); last commit empties the ratchet and switches lint to role-last only | 0 | |

**After every step:**
- `archboard check 2>&1 | grep -c '^warning'` equals the expected count, and no new warning code appears.
- `git grep -nE '<old prefixes>' -- ':!backlog' ':!docs/design' ':!docs/adr' ':!.archboard/vault/proposals'` prints nothing.

**Branches:** A, B, C and D as four layout branches. The "fail on any warning" layer stacks on C. Create the Backlog subtasks for these with the `backlog` CLI.

## 5. Open questions for the owner

- **Q1, voice package.** Option B cuts the model at the runtime/server line. Option A moves code across that line and rewrites boundaries.md:633-644. **I recommend B**, because those docs describe engine versus browser host as a deliberate split.
- **Q2, Rust crates.** Add a new root module, Renderer core, bound to `crates`, or move the crates under `packages/renderer`. **I recommend the root module.** The Cargo workspace (`Cargo.toml:5`), the flake and `rust-crates.test.ts` assume `crates/`.
- **Q3, duplicate subjects (#63).** Merging means retargeting `flows/6E6hL0Zk.flows.json`, then removing `6E6hL0Zk#SmrySjjM`, `#aqjsNyJ9` and Code evidence. That removes identities, so it needs your approval. **I recommend the merge.** The fallback binds Code evidence to `http/handlers/code-checks`.
- **Q4, layout research scripts.** Move them into `scripts/layout-investigation/`. That changes the `bun scripts/render-corpus.ts …` commands that docs/design cite. **I recommend the move**, or else take Layout investigation out of the model.
- **Q5, codemod.** **I recommend committing it**: it is reused in every step and writes the vault through the CLI. The alternative is a scratch tool, with manifests in the PR bodies.
- **Q6, Rust legend folder (#53).** **I recommend the small Rust move** (three files). The alternative binds Legend and export to the same folder as Painting.
- **Q7, folder names.** For example `architecture-drawing`, `panes`, `walkthroughs`, `workbench-client`, `start-stop`, `http/handlers`, `legacy-boards`. **I recommend these as proposed**; renaming them later is a one-line manifest change.

### Critical Files for Implementation
- /home/msc/Projects/archboard/docs/agents/boundaries.md
- /home/msc/Projects/archboard/tests/system/repository-policy/workspace-layout.test.ts
- /home/msc/Projects/archboard/tools/oxlint-plugin-archboard/ui-rules.ts
- /home/msc/Projects/archboard/.oxlintrc.jsonc
- /home/msc/Projects/archboard/vite.config.ts
