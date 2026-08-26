// The doubled-handler bug from TASK-057, kept alive so the check keeps
// catching it.
//
// `wss` is kept, so it is the same WebSocket server across a reload and it
// keeps the handlers already on it. Adding another one rather than replacing
// it made the second reload answer every message twice. The fix was the
// `wss.removeAllListeners('connection')` that is deliberately missing here.

import { kept } from "../../../src/runtime/engine/hot.js";
import { EventEmitter } from "node:events";

const wss = kept("fixture-wss", () => new EventEmitter());

wss.on("connection", () => {
	// whatever a connection does
});

export { wss };
