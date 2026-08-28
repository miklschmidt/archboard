// Everything here survives a reload, and the check has to stay quiet about all
// of it. A check that only ever fails is as useless as one that never does:
// this is the half that proves the rules discriminate.

import { EventEmitter } from "node:events";
import { kept } from "../../../src/runtime/engine/hot.js";

// A lookup table built from literals. Rebuilt identical on every reload, and
// nothing writes to it, so nothing is lost.
const ALIGNMENTS = new Set(["left", "center", "right"]);

// State, but behind kept(), so the callback runs once per process however many
// times this module is evaluated.
const boards = kept("safe-boards", () => new Map<string, { elements: string[] }>());

// A write that checks first, which is what makes re-running it harmless.
if (!boards.has("scratch")) {
	boards.set("scratch", { elements: [] });
}

// A handler replaced rather than added, so the reload leaves exactly one.
const bus = kept("safe-bus", () => new EventEmitter());
bus.removeAllListeners("connection");
bus.on("connection", () => {
	// whatever a connection does
});

// Something the check cannot judge, waived with the reason spelled out.
const pool = new EventEmitter(); // hot-safe: a fixture, and nothing holds it past the module

export { ALIGNMENTS, boards, bus, pool };
