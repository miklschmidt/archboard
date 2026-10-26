import { serveLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { instantiateCore } from "#runtime/services/core.ts";

// The Bun host's layout worker. It instantiates the core the host's thread
// compiled and checked against the checkout's sources (ADR 0057), so it reads,
// hashes and compiles nothing itself, and solves one graph at a time.
serveLayoutEngine(self, (core) => instantiateCore(core).layOutBoard);
