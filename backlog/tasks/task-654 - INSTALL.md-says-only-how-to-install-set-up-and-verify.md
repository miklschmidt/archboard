---
id: TASK-654
title: INSTALL.md says only how to install, set up and verify
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T16:57:00Z'
updated_date: '2026-11-19T17:14:00Z'
labels:
  - ready-for-agent
dependencies: []
ordinal: 1120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner: INSTALL.md is 947 lines and 'it can't be that complicated'. It mixes the install path with reference material: how a command finds its vault, application and infrastructure checkouts, history, code bindings, per-language server setup, rendering, recording, telemetry and machine state. A person installing Archboard has to wade through all of it. The site's docs (site/src/content/docs/) are where reference material lives for readers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 INSTALL.md is under 200 lines and covers, in order: what you need, installing (release, clone, build tools), putting the CLI on PATH, setting up a repository, starting the server and signing in, checking that it works, running the check as a gate, and updating or removing
- [x] #2 Each reference section that leaves INSTALL.md is either already covered by a page under site/src/content/docs/ (link to it) or moved there; nothing a user needs is lost, and the task notes list where each section went
- [x] #3 Every link and error message that points into INSTALL.md still resolves: the telemetry notice's #usage-telemetry anchor (packages/telemetry), 'the tools INSTALL.md names' (packages/renderer, scripts/build-core.ts), site/src/lib/links.ts, README.md and AGENTS.md
- [x] #4 The site builds and its audit passes (site/README.md#audit-the-site), and bun run check passes apart from check:model's known INTERFACE_WIDE and MODULE_SHALLOW findings
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite INSTALL.md as the install path only (needs, install release/clone/build tools, PATH, set up, server and sign-in, make sure it works, gate, update and remove, Usage telemetry), under 200 lines, commands checked against CLI help.
2. Move each reference section to the site page that covers it, or add it briefly to site/src/content/docs/install.mdx or concepts.mdx.
3. Repoint links into old INSTALL.md anchors (README, TESTING, PRODUCT, platform.mdx, QuickStart.astro).
4. Build the site, audit the changed pages with agent-browser, run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Where each INSTALL.md section went (INSTALL.md is now 197 lines):
- What you need, 1 Install (release, clone, Nix, rustup, after the build), 2 PATH, 3 Set up a repository (init, without init), 5 Server and Codex sign-in, 6 Make sure that it works, 7 Gate, Update and remove, Usage telemetry: stay in INSTALL.md, shortened. The build tools stay named (C compiler, ar, rustup, wasm-bindgen, Bun, Node.js, flake.nix).
- Set up the language servers (steps): already on site install.mdx#set-up-the-language-servers; INSTALL.md links it.
- 4 How a command finds its vault: install.mdx#find-the-vault-from-another-directory already had -C and VAULT_NOT_FOUND; added the vault-above-root rule, untracked vaults and archive-init, -C vs relative paths, first-command registration, ARCHBOARD_VAULT refusal. Several repositories: home-repo.mdx covers it. Claims: the archboard skill covers them.
- Server details (clone port, ARCHBOARD_URL, loopback-only autostart, several servers share one sign-in, navigator lists known repositories): added to install.mdx#start-the-server.
- Application and infrastructure checkouts: platform.mdx covers all of it (relay example, CI, every hop limit); cut.
- Migrate an existing vault: added install.mdx#a-vault-from-an-earlier-version, linking the skill's legacy-migration reference.
- Retain and share history: the skill's canonical-models reference covers the recipes; added the Archive term (model publish / model fetch) to concepts.mdx#sharing; the untracked vault's history in the state directory is in install.mdx (machine state, update and remove).
- Code bindings: concepts.mdx defines binding and repository identity; added install.mdx#checkouts-on-this-machine (chosen checkout, repo add/use/forget/list, vault-checkout rule, browser show, branch/commit refs, opener).
- Language servers for the code check (TypeScript, the other languages, global file, what the check does, Python, C/C++/ObjC, C#, Swift, Rust, Go): added install.mdx#what-each-language-needs, a table of language keys and commands plus one short item per language; measured timings and protocol internals cut; CLI reference (repo language-server help) holds the rest.
- Rendering to a bitmap and Recording a walkthrough: added install.mdx#pictures-and-recordings (Chromium, ARCHBOARD_RENDERER_CHROMIUM, ffmpeg and ARCHBOARD_FFMPEG, Codex for voice, kept talks, model replay, gh attach); flags are in the CLI reference; embeds are in gate.mdx#keep-the-pictures-current.
- Machine state and logs: added install.mdx#machine-state-and-logs.
- Notes for macOS: realpath stays in INSTALL.md step 2; the Chromium sandbox guard and managed Chrome go to install.mdx#pictures-and-recordings; the /proc note (no user action) and the misplaced note on qualified identities (the skill covers it) are cut.
- Links into old anchors now point at the site: README (platform limits, language servers, install guide), TESTING.md (pictures, machine state), PRODUCT.md (discovery), platform.mdx (vault lookup), QuickStart.astro and install.mdx's closing line. #usage-telemetry still resolves.
- Verified commands against archboard --help for init, start, restart, status, stop, telemetry, repo add/use/language-server, model init/read/render/rasterize/record/replay/archive-init/publish/fetch/recover, check, check code. The site build's guides.ts and links.ts pass.

Verification: site build (reference.ts, guides.ts, astro check, links.ts) passes; the changed install, concepts and home pages read in agent-browser at 1280 and 390 wide, and no table leaves the text column (the site is dark only). bun run check: every stage passes and check:model fails only on INTERFACE_WIDE and MODULE_SHALLOW, which stops the run; the remaining lanes then pass: test:modules 5324, test:solo 15, test:serial-browser 1, test:system 227 (one run had a flaky WebSocket close timing failure in workbench-example.test.ts that passed 3 of 3 alone and on a full lane rerun).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
INSTALL.md went from 947 to 197 lines and now holds only the install path: what you need, installing the release or a clone with its build tools, PATH, archboard init, the server and Codex sign-in, the checks, the gate, update and remove, and Usage telemetry (the #usage-telemetry anchor stays). Reference material moved into the site's install guide in short form (vault lookup, server details, checkouts, what each language server needs, pictures and recordings, machine state, an older vault) and the archive term into Concepts. Application and infrastructure checkouts were already on the platform page and were cut. Links to old INSTALL.md anchors in README, TESTING.md, PRODUCT.md, platform.mdx and QuickStart now point at the site. Verified with the site build and its guides and links scripts, a browser read of the changed pages, and bun run check (only the known check:model findings). Risk: the README links to usearchboard.dev/docs/install anchors that go live at the next release; /docs/next/ has them now.
<!-- SECTION:FINAL_SUMMARY:END -->
