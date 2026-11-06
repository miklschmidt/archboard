import { instantiateBrowserCore } from "#ui/clients/core.ts";
import { serveLayoutEngine } from "#shared/engine/rules/layout-engine.ts";

// The page's layout worker. It instantiates the core the page fetched and
// compiled (ADR 0059), so it fetches and compiles nothing itself, and solves
// one graph at a time.
serveLayoutEngine(self, async (core) => (await instantiateBrowserCore(core)).layOutPicture);
