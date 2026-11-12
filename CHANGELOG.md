# Changelog

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
