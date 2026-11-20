// Build the renderer core to WebAssembly (ADR 0059), with the TypeScript its hosts read beside
// it, unless a complete build of this checkout's sources is there.
//
// Run from the repository root, with the tools that INSTALL.md names:
//   bun run build:core
// When cargo or wasm-bindgen does not run and `nix` is on PATH, the build runs itself again
// inside the `nix develop` shell of this checkout.

import { buildCore } from "@archboard/renderer/core";

await buildCore();
