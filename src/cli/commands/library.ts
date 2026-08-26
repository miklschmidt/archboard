import { parseArgs, CliUsageError } from "./args.js";
import { printJson } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import {
	readCatalogue,
	catalogueText,
	insertStencil,
	AmbiguousStencilError,
	UnknownStencilError,
} from "../../runtime/engine/library-catalogue.js";

// What is in the stencil palette, and — since TASK-025 — a way to drop one
// onto the board.
//
// `list` stays read-only: the library itself is edited in the browser, where
// the shapes are visible. This exists because the palette lives on the
// server rather than in a browser profile (ADR 0007), which means an agent
// can be told what is available to drag onto a board instead of guessing.
//
// Both actions are thin over src/core/library-catalogue.ts, which the server
// routes also use, so the two callers cannot answer differently.

const USAGE =
	"Usage: library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]";

export const ACTIONS = ["list", "insert"] as const;

export async function library(argv: string[]): Promise<void> {
	// The action is always the first bare token; parsing flags happens inside
	// each subcommand so each gets its own spec and unknown flags are caught
	// against the right one.
	const action = argv[0]?.startsWith("--") ? undefined : argv[0];
	const rest = action === undefined ? argv : argv.slice(1);

	if (action === "insert") return libraryInsert(rest);
	if (action === undefined || action === "list") return libraryList(rest);

	throw new CliUsageError(USAGE);
}

async function libraryList(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, { text: { takesValue: false } });

	await ensureCanvasRunning();
	const catalogue = await readCatalogue();

	if (flags.text) console.log(catalogueText(catalogue));
	else printJson(catalogue);
}

async function libraryInsert(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, {
		x: { takesValue: true },
		y: { takesValue: true },
		source: { takesValue: true },
		id: { takesValue: true },
	});
	const nameArg = positionals[0];
	const idArg = typeof flags.id === "string" ? flags.id : undefined;
	if (!nameArg && !idArg) {
		throw new CliUsageError(
			"Usage: library insert <name> --x <x> --y <y> [--source <file>] (or --id <libraryItemId> instead of a name)",
		);
	}
	if (typeof flags.x !== "string" || typeof flags.y !== "string") {
		throw new CliUsageError("library insert requires --x <number> --y <number>");
	}
	const x = Number(flags.x);
	const y = Number(flags.y);
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new CliUsageError("--x and --y must be numbers");
	}

	await ensureCanvasRunning();
	try {
		printJson(
			await insertStencil({
				name: nameArg,
				source: typeof flags.source === "string" ? flags.source : undefined,
				itemId: idArg,
				x,
				y,
			}),
		);
	} catch (error) {
		// A name in four libraries and a name in none are both the caller's to
		// answer, and both are usage rather than failure: exit 2, with the
		// candidates named and the flag that settles it.
		if (error instanceof AmbiguousStencilError) {
			throw new CliUsageError(`${error.message} Disambiguate with --source or --id.`);
		}
		if (error instanceof UnknownStencilError) {
			throw new CliUsageError(`${error.message} Use "library list" to see what is available.`);
		}
		throw error;
	}
}
