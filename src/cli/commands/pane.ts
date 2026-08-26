// Making and unmaking the slots boards are shown in.
//
// The report of what is on screen is `panes`, plural, and it is read-only.
// This is the singular: one pane, made or taken away. They are deliberately
// different commands — reading the scene every turn is cheap and safe, and
// changing what is on it is neither.

import { parseArgs, CliUsageError } from "./args.js";
import { printJson, note, requireBrowserClient } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import { closePane, currentRequestedBoard, openPane } from "../../runtime/engine/canvas-client.js";
import { paneWords } from "../../runtime/engine/panes.js";

export const SUBCOMMANDS = ["open", "close"] as const;

export async function pane(argv: string[]): Promise<void> {
	const sub = argv[0];
	if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub)) {
		throw new CliUsageError(
			`pane needs a subcommand: ${SUBCOMMANDS.join(", ")}. ` +
				"For what is on screen right now, without changing it, run `archboard panes`.",
		);
	}
	const rest = argv.slice(1);

	await ensureCanvasRunning();

	if (sub === "open") {
		parseArgs(rest, {});
		// A pane is a piece of browser: it exists while a tab renders it and not a
		// moment longer, so there is nothing to make when nothing is open.
		await requireBrowserClient("Opening a pane");

		// `--board` is the global flag, as on every other command that names one.
		// Optional here: a pane with no board named inherits what the other pane
		// is showing, which is what a human clicking Split gets.
		const wanted = currentRequestedBoard();
		const result = await openPane((wanted ? { board: wanted } : {}));

		const place = result.pane?.place;
		const where = place ? paneWords(place) : "a new pane";
		note(
			result.board
				? `"${result.board.board}" is showing in ${where}. The other pane was not touched. ` +
						`Commands still name the board: \`--board ${result.board.board}\`.`
				: `Opened ${where}. It is showing what was already on screen — point it somewhere else ` +
						`with \`board open <name> --pane ${place ?? "<spec>"}\`.`,
		);
		printJson(result);
		return;
	}

	// close
	const { positionals } = parseArgs(rest, {});
	const spec = positionals[0];
	if (!spec) {
		throw new CliUsageError(
			"pane close needs to be told which pane: `pane close right`. " +
				"Run `archboard panes` for what is on screen.",
		);
	}
	await requireBrowserClient("Closing a pane");

	const result = await closePane(spec);
	note(
		`Closed ${paneWords(result.closed?.place ?? spec)}. ` +
			`"${result.closed?.board}" is off the screen, not gone — it is still open on the canvas, ` +
			"with whatever was drawn on it.",
	);
	printJson(result);
}
