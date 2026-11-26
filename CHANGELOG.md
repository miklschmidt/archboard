# Changelog

## [0.7.0](https://github.com/miklschmidt/archboard/compare/v0.6.0...v0.7.0) (2026-11-26)


### Features

* **browser:** give agents full filtering, settings, navigation, and temporary flow controls ([#163](https://github.com/miklschmidt/archboard/issues/163)) ([f5e6b19](https://github.com/miklschmidt/archboard/commit/f5e6b199c89b193a23ea946cc17437a7a37b3ce0))
* **settings:** add Codex authentication and model selection settings ([#168](https://github.com/miklschmidt/archboard/issues/168)) ([11c8403](https://github.com/miklschmidt/archboard/commit/11c84039df9f940b721b8026be4adc0b9b9c6ae0))
* **terraform:** support depth-1 named nested-block bindings and sibling anchors ([#166](https://github.com/miklschmidt/archboard/issues/166)) ([#169](https://github.com/miklschmidt/archboard/issues/169)) ([ba51d4d](https://github.com/miklschmidt/archboard/commit/ba51d4d75be9a30f47b80b8f881cd04cf19021ad))
* **voice:** choose the language the voice speaks in the Codex settings tab ([#172](https://github.com/miklschmidt/archboard/issues/172)) ([c19c59b](https://github.com/miklschmidt/archboard/commit/c19c59bf93d991a3f31c68abf45f07c8412ebb04))
* **web:** a presented walkthrough keeps the legend in its column ([#171](https://github.com/miklschmidt/archboard/issues/171)) ([0ded818](https://github.com/miklschmidt/archboard/commit/0ded81828bead1f3bf6e8b19000021e01167da17))


### Bug Fixes

* **code-intel:** judge Terraform joining anchors per instance and add Azure rules ([#167](https://github.com/miklschmidt/archboard/issues/167)) ([19c88f9](https://github.com/miklschmidt/archboard/commit/19c88f95452c93443eec4c432b8280660b27f7c1))
* **walkthrough:** let Space pan the picture instead of stepping ([#170](https://github.com/miklschmidt/archboard/issues/170)) ([1f80fea](https://github.com/miklschmidt/archboard/commit/1f80fea580dd2d785882e3e9dc476d0644c013f2))

## [0.6.0](https://github.com/miklschmidt/archboard/compare/v0.5.0...v0.6.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* codex-realtime-voice removes 21 published names and turns 3 constants into functions.
    - `./server`: `resolveCodexExecutable` is gone; pass `codex: opts` or
    leave `codex` out. `projectCodexBrowserState` and
    `BrowserProjectionInput` are gone, with no replacement.
    - `./runtime`: `ADDITIONAL_CONTEXT_POLICY` becomes
    `additionalContextPolicy()`. `createCodexRealtimeAdapter`,
    `CodexRealtimeAdapter`, `CodexRealtimeAdapterOptions`,
    `CodexRealtimeBinding`, `EMPTY_SPOKEN_APPROVAL_SNAPSHOT` and
    `emptyManifest` are gone, with no replacement.
    - `./realtime`: `INITIAL_REALTIME_STATE`, `REALTIME_PHASES`,
    `REALTIME_TRANSITIONS`, `transitionRealtimeState`,
    `parseRealtimeCorrelationId`, `parseRealtimeItemId`,
    `parseRealtimeSessionId`, `RealtimeCorrelation` and
    `RealtimeSemanticEvent` are gone, with no replacement.
    - `./schemas`: `JsonValueSchema` becomes `parseJsonValue(value)`.
    `BROWSER_IDLE_SPOKEN_APPROVAL`,
    `BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES` and `CodexBrowserModel` are
    gone, with no replacement.
    - `./controllers`: `VOICE_OUTPUT_SPEAKING_LEVEL` becomes
    `isSpeakingLevel(level)`.

### Features

* **code-intel:** judge module depth from the code (TASK-646) ([#135](https://github.com/miklschmidt/archboard/issues/135)) ([0702694](https://github.com/miklschmidt/archboard/commit/0702694c17a3a0b6f63e7cd4517a15c5208416b7))
* **code-intel:** module-depth rules, wide and shallow findings, and archboard-deepen (TASK-650, 651, 652) ([#141](https://github.com/miklschmidt/archboard/issues/141)) ([5a4c9a7](https://github.com/miklschmidt/archboard/commit/5a4c9a7a930c0fa0679d5e92931624f94131c750))
* lines say how they travel and what they do, Blocks draws cables, and Lanes replaces Track ([#154](https://github.com/miklschmidt/archboard/issues/154)) ([2a20593](https://github.com/miklschmidt/archboard/commit/2a205930ab4e582d8dd6ef5c69301797a9227e89))
* **web:** browse a checkout's files in the navigator and read one beside the picture ([#138](https://github.com/miklschmidt/archboard/issues/138)) ([d4947be](https://github.com/miklschmidt/archboard/commit/d4947be8d0daac67d7ab3eb8a7ab008cbd1704a8))
* **web:** keep the right panel beside About, with About's outline on top ([#137](https://github.com/miklschmidt/archboard/issues/137)) ([675d6ca](https://github.com/miklschmidt/archboard/commit/675d6ca5c0a14cde964e1544ecb62fe522f53a3a))
* **web:** part the comparison interface, resize the navigator and section the panels ([#136](https://github.com/miklschmidt/archboard/issues/136)) ([3c88b1d](https://github.com/miklschmidt/archboard/commit/3c88b1d0247ab0cd802a4c92f88fa762ec1d1744))


### Bug Fixes

* **cli:** remove the hand-maintained CLI command audit ([#132](https://github.com/miklschmidt/archboard/issues/132)) ([e9be3a0](https://github.com/miklschmidt/archboard/commit/e9be3a0e9b8aad94427652a668fd736b3befb9b1))
* **code-opener:** offer the GitHub link when a canonical module's file cannot be opened ([#131](https://github.com/miklschmidt/archboard/issues/131)) ([73186e3](https://github.com/miklschmidt/archboard/commit/73186e38562b5e87dfc528d675bc2f0404ea7b56))
* **layout:** Lanes draws its own bus look on the kinds layer ([#151](https://github.com/miklschmidt/archboard/issues/151)) ([464dd22](https://github.com/miklschmidt/archboard/commit/464dd22a128885f0dddbf52c2ad60f69e266fe86))
* **layout:** settle cable crossings as whole ribbons without crosswise arc overlaps ([#161](https://github.com/miklschmidt/archboard/issues/161)) ([bef67ec](https://github.com/miklschmidt/archboard/commit/bef67ec44d233e7a518b0b408f7145a87a3c3fce))
* **model-reader:** a read during an agent's write waits for it instead of failing ([#146](https://github.com/miklschmidt/archboard/issues/146)) ([ac57863](https://github.com/miklschmidt/archboard/commit/ac57863ed5539fea55d829b6245bdff3451d82ed))
* **reader:** a hidden relationship kind takes the cards that drew only its lines off the picture ([#134](https://github.com/miklschmidt/archboard/issues/134)) ([2e21988](https://github.com/miklschmidt/archboard/commit/2e21988830b5a4f599f549383d0ceb6390eaa69a))
* **renderer:** a refused Blocks reading draws, and nested open frames compact (TASK-624, TASK-658) ([#144](https://github.com/miklschmidt/archboard/issues/144)) ([c0fa6d0](https://github.com/miklschmidt/archboard/commit/c0fa6d0988fb8792f06e7a79f457c59c03672eb7))
* **renderer:** wrap card words to the placed box width ([#159](https://github.com/miklschmidt/archboard/issues/159)) ([e49c3bb](https://github.com/miklschmidt/archboard/commit/e49c3bb86b83d4a33404dd2f19e53bd36a2aa270))
* **web:** align Navigator flows with shared ModelPanel rows ([#160](https://github.com/miklschmidt/archboard/issues/160)) ([e91e19b](https://github.com/miklschmidt/archboard/commit/e91e19b1118be8235d9bd9c14267207dfc999520))
* **web:** every section of the right panel folds, with the navigator's head ([#150](https://github.com/miklschmidt/archboard/issues/150)) ([7b9fd3d](https://github.com/miklschmidt/archboard/commit/7b9fd3d953cddac0e2e7d95320ddd7d2e2496ec7))
* **workspace:** a command handed to another checkout never hands itself off again ([#153](https://github.com/miklschmidt/archboard/issues/153)) ([d6bb411](https://github.com/miklschmidt/archboard/commit/d6bb4115c93dd93e8de708ada057cb34e48d1ef6))


### Code Refactoring

* this repository obeys the module-depth rules (TASK-646.14) ([#139](https://github.com/miklschmidt/archboard/issues/139)) ([fe4cae1](https://github.com/miklschmidt/archboard/commit/fe4cae134b6a6ebf23bd6395ea5cf11389458731))

## [0.5.0](https://github.com/miklschmidt/archboard/compare/v0.4.1...v0.5.0) (2026-11-18)


### Features

* **cli:** footprint flags modules a draft adds for existing code, and PR charts come from model flows ([#125](https://github.com/miklschmidt/archboard/issues/125)) ([6b7117d](https://github.com/miklschmidt/archboard/commit/6b7117d815ed8791f8285090d4f8ad17eb4dde5e))
* **code-intel:** keep a branch's plan in its footprint after it adopts the proposal ([#129](https://github.com/miklschmidt/archboard/issues/129)) ([2e99212](https://github.com/miklschmidt/archboard/commit/2e992120306f6f8025d648cbdf98efc167c37b8c))
* **site:** one indexed copy of each docs page, a sitemap and llms.txt ([#108](https://github.com/miklschmidt/archboard/issues/108)) ([45eab9f](https://github.com/miklschmidt/archboard/commit/45eab9f1a9a5c65c5df0454226c00a15e66e73d3))
* **telemetry:** send anonymous usage as wide events ([#115](https://github.com/miklschmidt/archboard/issues/115)) ([8c0a88c](https://github.com/miklschmidt/archboard/commit/8c0a88c8b366433a5ed9ae20c2587aef7cd23d90))
* **web:** mark the words that moved in a changed field ([#112](https://github.com/miklschmidt/archboard/issues/112)) ([e2cbb84](https://github.com/miklschmidt/archboard/commit/e2cbb84d077151361c4f28c446cc306f832f6817))
* **web:** show a branch footprint's lists as cards ([#127](https://github.com/miklschmidt/archboard/issues/127)) ([20a01f1](https://github.com/miklschmidt/archboard/commit/20a01f1b83daf8030326501524d401a2bcd00944))
* **web:** show what a branch changed in Measures, and read the model at a branch ([#118](https://github.com/miklschmidt/archboard/issues/118)) ([fe7c85f](https://github.com/miklschmidt/archboard/commit/fe7c85f79fbdeb6da77aa45bbd2765d2308f87cb))
* **workhorse:** stop ends the whole work tree and inspection reads real work ([#116](https://github.com/miklschmidt/archboard/issues/116)) ([277e096](https://github.com/miklschmidt/archboard/commit/277e0967f302a59e88f0b7c2538fc5cce6f49175))


### Bug Fixes

* **code-intel:** count a footprint module as changed only when the branch changes it ([#121](https://github.com/miklschmidt/archboard/issues/121)) ([dc6c72f](https://github.com/miklschmidt/archboard/commit/dc6c72f61eb600305a15ec5e7c2d326e3deb099b))
* **deps:** update the packages that bun audit flags ([#114](https://github.com/miklschmidt/archboard/issues/114)) ([3d987a2](https://github.com/miklschmidt/archboard/commit/3d987a21e0e068fb0a44ee13d6fbdff921c44ede))
* **release:** keep bun.lock at the versions a release raises ([#111](https://github.com/miklschmidt/archboard/issues/111)) ([01dc319](https://github.com/miklschmidt/archboard/commit/01dc319974dcb47b10ee25742bb2ec3191ce50e0))
* **renderer:** an exported legend keys each kind once with the panel's chip ([#124](https://github.com/miklschmidt/archboard/issues/124)) ([7f6f798](https://github.com/miklschmidt/archboard/commit/7f6f798be6afdd7c7f0811dadd7b4974a24dae87))
* **site:** the hero starts still and moves only where the GPU is quick ([#122](https://github.com/miklschmidt/archboard/issues/122)) ([5f195c2](https://github.com/miklschmidt/archboard/commit/5f195c2ba5607af83ae1978f1219a8ea56af00e2))
* **voice:** a recorded walkthrough narrates each beat instead of answering it ([#123](https://github.com/miklschmidt/archboard/issues/123)) ([babfdc6](https://github.com/miklschmidt/archboard/commit/babfdc65d49045af498c432db1b10c45d367511e))
* **walkthrough:** authors prove each claim and check every recording before using it ([#126](https://github.com/miklschmidt/archboard/issues/126)) ([c98d9da](https://github.com/miklschmidt/archboard/commit/c98d9da1d1e3921d2c87356923625fdd37d31a2a))
* **web:** name the shown proposal at the head of its root reading ([#110](https://github.com/miklschmidt/archboard/issues/110)) ([45daf9e](https://github.com/miklschmidt/archboard/commit/45daf9e700bd76f8f721c64aebe1af0a9c39c88d))

## [0.4.1](https://github.com/miklschmidt/archboard/compare/v0.4.0...v0.4.1) (2026-11-12)


### Bug Fixes

* **actions:** report a first vault, fail without one, and install the Action's own CLI version ([#101](https://github.com/miklschmidt/archboard/issues/101)) ([7195d7b](https://github.com/miklschmidt/archboard/commit/7195d7b0520ecc1d49e78f4677b37419800d5708))
* **footprint:** fail a directory module that changed a file only it binds ([#100](https://github.com/miklschmidt/archboard/issues/100)) ([e3956c4](https://github.com/miklschmidt/archboard/commit/e3956c4c321619ce83051a3e7e911e225c0d467b))
* **site:** the hero draws its full resolution again once frames are quick ([#107](https://github.com/miklschmidt/archboard/issues/107)) ([81d7acc](https://github.com/miklschmidt/archboard/commit/81d7accaaae3787cc13fc1fc1065d637a80059ed))
* **walkthrough:** stop the replay page's document timeline so slow machines draw the same frames ([#98](https://github.com/miklschmidt/archboard/issues/98)) ([cfc5dc0](https://github.com/miklschmidt/archboard/commit/cfc5dc0ad100a804c6d5f4e33b137893545d3289))

## [0.4.0](https://github.com/miklschmidt/archboard/compare/v0.3.0...v0.4.0) (2026-11-11)


### Features

* **actions:** the pull-request Action can write its report to a file ([#85](https://github.com/miklschmidt/archboard/issues/85)) ([faaebfe](https://github.com/miklschmidt/archboard/commit/faaebfe55e3bf4360bd998123f0eea9024388a20))
* **cli:** archboard model snapshot writes a state and its comparison state to one file ([#87](https://github.com/miklschmidt/archboard/issues/87)) ([665acf1](https://github.com/miklschmidt/archboard/commit/665acf1cd9746c17d38ee7d3d1537b6676878fa5))
* **cli:** browser show and browser open open a browser when none is connected ([#91](https://github.com/miklschmidt/archboard/issues/91)) ([12d2750](https://github.com/miklschmidt/archboard/commit/12d2750bd93868c79a6e30aed0bfdaa11058c43a))
* **readme:** draw the banner and social card from the site's hero table ([#92](https://github.com/miklschmidt/archboard/issues/92)) ([82546b4](https://github.com/miklschmidt/archboard/commit/82546b49387ca99300e3b2b74f5b4849b66fbc10))
* **site:** serve the site and every version of the docs at usearchboard.dev ([#94](https://github.com/miklschmidt/archboard/issues/94)) ([36c188e](https://github.com/miklschmidt/archboard/commit/36c188e1cf56762c63e8f7990c449e33b444473b))
* **skills:** archboard-plan carries a proposal from spec to merge, and model footprint --fail-outside gates a branch ([#89](https://github.com/miklschmidt/archboard/issues/89)) ([36865dc](https://github.com/miklschmidt/archboard/commit/36865dc62290fe970073142cbab1f13363da4875))
* **web:** serve the browser build under any base path ([#86](https://github.com/miklschmidt/archboard/issues/86)) ([d9cfda0](https://github.com/miklschmidt/archboard/commit/d9cfda0d3a0291fd0bd3beedcc082abab94bc6ab))


### Bug Fixes

* **blocks:** place dense readings by one stated cost, keep the pane's shape, and solve across workers ([#73](https://github.com/miklschmidt/archboard/issues/73)) ([4c74957](https://github.com/miklschmidt/archboard/commit/4c74957ccba788c723197f330a64f5530539df12))
* **process:** settle a Git that Bun reaped before its group was captured ([#93](https://github.com/miklschmidt/archboard/issues/93)) ([7895c80](https://github.com/miklschmidt/archboard/commit/7895c808ce9b66311f65af85c6ef6e2850fa1eba))

## [0.3.0](https://github.com/miklschmidt/archboard/compare/v0.2.0...v0.3.0) (2026-11-09)


### Features

* **shell:** the chrome frames the picture, the agent card and the claim marks ([#74](https://github.com/miklschmidt/archboard/issues/74)) ([f87168c](https://github.com/miklschmidt/archboard/commit/f87168c937576a227b5af24461b660eec128ade3))
* **site:** each release has its own docs, and examples pin Actions to a release commit ([#78](https://github.com/miklschmidt/archboard/issues/78)) ([59b96b0](https://github.com/miklschmidt/archboard/commit/59b96b068290a6ffd603c12eb0e8a69d7938d3ee))


### Bug Fixes

* **model:** the containment rule leaves out a container bound to a runner ([#81](https://github.com/miklschmidt/archboard/issues/81)) ([dd49939](https://github.com/miklschmidt/archboard/commit/dd499395d4a515e4c74fef26c3fa753349ecc569))
* **render:** a rendered or rasterized picture carries its legend unless asked to leave it out ([#80](https://github.com/miklschmidt/archboard/issues/80)) ([173c2bb](https://github.com/miklschmidt/archboard/commit/173c2bb1cc957a6fbee682afcc964ed7db6df198))

## [0.2.0](https://github.com/miklschmidt/archboard/compare/v0.1.0...v0.2.0) (2026-11-08)


### ⚠ BREAKING CHANGES

* **cli:** `archboard install-skill` and its options `--agent`, `--target`, `--dir`, `--no-setup` and `--print-source` are gone. Run `archboard init` in the repository instead.

### Features

* **cli:** archboard init, committed language servers and a global --text ([#67](https://github.com/miklschmidt/archboard/issues/67)) ([56a7824](https://github.com/miklschmidt/archboard/commit/56a78248ee8b1d333435b6cfbdf9c6365cf66ad9))
* **model:** hold each container to one directory, and follow the merged proposals ([#49](https://github.com/miklschmidt/archboard/issues/49)) ([69f3bc2](https://github.com/miklschmidt/archboard/commit/69f3bc28e628c8302e94248fce956d5594d7dc0e))
* **model:** warn when two modules bind the same code or two relationships repeat each other ([#59](https://github.com/miklschmidt/archboard/issues/59)) ([5b85a98](https://github.com/miklschmidt/archboard/commit/5b85a98369a5fdf7e28705831906ae97b347a4e6))
* **release:** Archboard installs from npm as one compiled executable for each platform ([#46](https://github.com/miklschmidt/archboard/issues/46)) ([7382abf](https://github.com/miklschmidt/archboard/commit/7382abffe45f534e8c3b3f16a1d5dc4dbf85cc5a))
* **shell:** the shell takes the site's lit-table language in both themes ([#66](https://github.com/miklschmidt/archboard/issues/66)) ([edf5a9e](https://github.com/miklschmidt/archboard/commit/edf5a9eee897d6f53bf19215f730834f485a5e74))


### Bug Fixes

* **code-intel:** a file that a #[cfg(test)] mod declares is test code ([#50](https://github.com/miklschmidt/archboard/issues/50)) ([300732c](https://github.com/miklschmidt/archboard/commit/300732c61345a541dac9c9fddf173bf6f12aa17a))
* **layout:** a target fan joins a visible run before the box it enters ([#61](https://github.com/miklschmidt/archboard/issues/61)) ([ee634dc](https://github.com/miklschmidt/archboard/commit/ee634dc2128712cf2efd78ac48fc49db19e800fb))
* **layout:** the corpus benchmark passes on this repository's model again ([#68](https://github.com/miklschmidt/archboard/issues/68)) ([5a39bdd](https://github.com/miklschmidt/archboard/commit/5a39bdded2d1c459b6796166bf12645eaecaec9a))
