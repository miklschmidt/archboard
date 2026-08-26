// Where a pane is looking.
//
// The camera, not the board: nothing here changes an element. It needs a
// browser, because a viewport is a fact about a rendered canvas and the server
// holds no such thing — a headless canvas has boards and no view of them.
//
// It names a pane rather than a board, for the reason ADR 0009 gives: the pane
// settles which board this concerns, because a pane holds exactly one.

import { parseArgs, CliUsageError } from "../args.js";
import { printJson, requireBrowserClient } from "../util.js";
import { ensureCanvasRunning } from "../../core/spawn.js";
import { setViewport } from "../../core/canvas-client.js";

const number = (value: string, flag: string): number => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new CliUsageError(`--${flag} needs a number, not "${value}"`);
	return parsed;
};

export async function viewport(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, {
		fit: { takesValue: false },
		ids: { takesValue: true },
		element: { takesValue: true },
		zoom: { takesValue: true },
		"offset-x": { takesValue: true },
		"offset-y": { takesValue: true },
		"zoom-factor": { takesValue: true },
		pane: { takesValue: true },
	});

	const manual =
		flags.zoom !== undefined || flags["offset-x"] !== undefined || flags["offset-y"] !== undefined;
	const modes = [
		flags.fit === true,
		flags.ids !== undefined,
		flags.element !== undefined,
		manual,
	].filter(Boolean).length;
	if (modes !== 1) {
		throw new CliUsageError(
			"Say exactly one thing to do with the camera: --fit (everything on the board), " +
				"--ids a,b,c (fit those elements), --element <id> (centre on one), " +
				"or --zoom / --offset-x / --offset-y (set explicit values).",
		);
	}
	if (flags["zoom-factor"] !== undefined && flags.fit !== true && flags.ids === undefined) {
		throw new CliUsageError("--zoom-factor is the padding on a fit, so it needs --fit or --ids.");
	}

	await ensureCanvasRunning();
	await requireBrowserClient("Moving the camera");

	const result = await setViewport({
		...(flags.fit === true ? { scrollToContent: true } : {}),
		...(flags.ids !== undefined
			? {
					scrollToElementIds: String(flags.ids)
						.split(",")
						.map((id) => id.trim())
						.filter(Boolean),
				}
			: {}),
		...(flags.element !== undefined ? { scrollToElementId: String(flags.element) } : {}),
		...(flags.zoom !== undefined ? { zoom: number(String(flags.zoom), "zoom") } : {}),
		...(flags["offset-x"] !== undefined
			? { offsetX: number(String(flags["offset-x"]), "offset-x") }
			: {}),
		...(flags["offset-y"] !== undefined
			? { offsetY: number(String(flags["offset-y"]), "offset-y") }
			: {}),
		...(flags["zoom-factor"] !== undefined
			? { viewportZoomFactor: number(String(flags["zoom-factor"]), "zoom-factor") }
			: {}),
		// Display, so it defaults where it cannot be wrong: with one pane on
		// screen that pane, with two the primary one unless a caller says which.
		...(flags.pane !== undefined ? { pane: String(flags.pane) } : {}),
	});

	printJson(result);
}
