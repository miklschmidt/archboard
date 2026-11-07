import { serveLayoutEngine } from "#shared/engine/rules/layout-engine.ts";
import { instantiateCore } from "#runtime/bun-renderer/services/core.ts";

// The Bun host's layout worker. It instantiates the core the host's thread
// compiled and checked against the checkout's sources (ADR 0059), so it reads,
// hashes and compiles nothing itself, and solves one graph at a time.
serveLayoutEngine(self, (core) => instantiateCore(core).layOutPicture);
