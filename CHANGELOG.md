# Changelog

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
