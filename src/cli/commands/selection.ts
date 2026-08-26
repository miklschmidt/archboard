import { parseArgs } from "./args.js";
import { printJson } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import { getPanes, getSelection } from "../../runtime/engine/canvas-client.js";

// Read what a human currently has picked on the board.
//
// This does not require a browser round-trip: the browser pushes selection to
// the server on change, so reading it is a plain server read that never
// re-transmits the scene.
export async function selection(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, {
		text: { takesValue: false },
	});

	await ensureCanvasRunning();
	const report = await getSelection();

	if (flags.text) {
		process.stdout.write(report.text + "\n");
		return;
	}

	const { success, text, ...rest } = report;
	printJson(rest);
}

// What the human is currently looking at, pane by pane.
//
// The companion to `selection`: that one answers "what do they mean by *this*",
// this one answers "what is on screen, and where" — which is what makes "the
// left one" and "move that box over there" resolvable for a model that cannot
// see the scene. View state only; `describe` is where contents live.
export async function panes(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, {
		text: { takesValue: false },
	});

	await ensureCanvasRunning();
	const report = await getPanes();

	if (flags.text) {
		process.stdout.write(report.text + "\n");
		return;
	}

	const { success, text, ...rest } = report;
	printJson(rest);
}
