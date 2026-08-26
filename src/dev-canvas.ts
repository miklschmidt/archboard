// The canvas, reloadable, for developing archboard itself.
//
//     bun run dev:canvas        # bun --hot src/dev-canvas.ts
//     bun run reload       # and this is what reloads it
//
// WHY THERE IS AN ENTRY AT ALL, rather than `bun --hot src/server.ts`:
//
// `bun --hot` re-evaluates the whole module graph, not the file that changed,
// and it does it whenever a watched file changes. Pointed straight at the
// server that meant every save re-ran every top-level statement in 32 modules,
// inside a process holding boards nobody has saved, panes a human arranged and
// sockets tabs are still using. Two bugs found while building TASK-057 were
// exactly that, and neither announced itself: a re-run `boards.set()` blanked
// the scratch board under an open pane, and a connection handler added rather
// than replaced answered every message twice.
//
// bun gives no way to narrow what it watches, but it does not have to. The
// only file it re-evaluates by itself is this one, and this one re-imports the
// canvas only when the reload token's generation has moved
// (src/runtime/engine/reload-token.ts). An ordinary save therefore re-runs the few
// statements below and stops. A reload happens when somebody asks for one, and
// at no other time.
//
// NOTHING AT MODULE SCOPE HERE MAY HOLD STATE, for the same reason: it runs on
// every save. The gate is in kept(), and `scripts/check-module-scope.mjs`
// checks this file along with the rest of the graph.
//
// The canvas is imported with a cache-busting query so that each reload gets a
// fresh graph rather than the copy bun is still holding. Everything that has
// to outlive it is in the kept registry on `globalThis`, which no module
// reload can reach (src/runtime/engine/hot.ts).

import { kept } from "./runtime/engine/hot.js";
import { armReloadToken } from "./runtime/engine/reload-token.js";
import {
	readFacts,
	compareFacts,
	reportBrokenReload,
	type ReloadFacts,
} from "./runtime/engine/reload-canary.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

/** Which generation is loaded, and what the canvas held when it was. */
interface Gate {
	generation: number;
	facts: ReloadFacts | null;
}

const gate = kept<Gate>("dev-gate", () => ({ generation: -1, facts: null }));

const token = armReloadToken(PORT);
const { generation } = (await import(token)) as { generation: number };

if (generation !== gate.generation) {
	const first = gate.generation === -1;
	gate.generation = generation;

	// Read before the re-evaluation, because afterwards there is nothing left to
	// compare against except what was written down here.
	const before = first ? null : readFacts();

	try {
		// `startServer` is called rather than left to server.ts's own entry-point
		// check, which looks at `process.argv[1]` and correctly says this file is
		// the entry. It is idempotent: on a reload it finds the port already bound
		// and returns.
		const canvas = (await import(`./server.js?reload=${generation}`)) as {
			startServer: () => Promise<void>;
		};
		await canvas.startServer();
	} catch (error) {
		// The old code is still running and still serving. Say so, because the
		// other reading of a stack trace on a live canvas is that it died.
		process.stderr.write(
			"\n  !! THE RELOAD FAILED TO EVALUATE. The canvas is still running the code it had.\n",
		);
		process.stderr.write(`     ${error instanceof Error ? error.stack : String(error)}\n`);
	}

	const after = readFacts();
	gate.facts = after;

	if (before) {
		const complaints = compareFacts(before, after);
		if (complaints.length > 0) {
			reportBrokenReload(complaints);
		} else {
			process.stdout.write(
				`canvas reload ${generation} cost nothing: ` +
					`${Object.keys(after.boards).length} board(s), ${Object.keys(after.panes).length} pane(s), ` +
					`${after.sockets} socket(s), feed ${after.feedId} still at cursor ${after.cursor}.\n`,
			);
		}
	} else {
		process.stdout.write(
			"canvas running under dev-canvas. Saving a file changes nothing; " +
				"reload with `bun run reload`.\n",
		);
	}
}
