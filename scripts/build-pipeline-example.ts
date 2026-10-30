// Build the tracked pipeline example into a vault.
//
// The statements in `docs/design/semantic-pipeline/` are the source; the boards
// are what this makes of them. Running it twice does not change a board it has
// already built — identities are minted once and never rewritten, and a second
// run that reminted them would break every drill-down and every comparison that
// points at them (ADR 0023).
//
// It writes through the same boundary every other write uses: the board-global
// lease, the coherence checks, one atomic write, one version. There is no
// special path for an example.
//
// The vault it builds into is the directory named on the command line, and a
// vault that already holds these two boards is left exactly as it is.

import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
	BoardBranchInputSchema,
	BoardCreateInputSchema,
	VariantEditInputSchema,
} from "@archboard/board/commands";
import { wasDrawn } from "@archboard/board/render-reply";
import {
	branchVariantTransition,
	createBoardTransition,
	editVariantTransition,
	writeSemanticBoard,
} from "@archboard/board/store-write";
import { readSemanticBoard } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { renderBoard } from "@archboard/renderer/bun";

const [named] = process.argv.slice(2);
if (named === undefined) {
	throw new Error(
		"Name the vault directory to build the example into, then run this again: bun scripts/build-pipeline-example.ts <vault>.",
	);
}

/** The vault the example is built into. */
const vault = path.resolve(named);

/** Where the statements live, relative to the checkout. */
const STATED = "docs/design/semantic-pipeline";

/** Where the drawn artifacts go. */
const DRAWN = "docs/design/generated/pipeline-example";

/** The two boards this example is made of, in the order they must be built. */
const BOARDS = ["write-path", "system"] as const;

/**
 * One stated board, read off disk.
 * @param name The file's name, without its extension.
 * @returns What it states.
 */
function stated(name: string): Record<string, unknown> {
	const read: unknown = JSON.parse(readFileSync(path.join(STATED, `${name}.json`), "utf8"));
	if (typeof read !== "object" || read === null || Array.isArray(read)) {
		throw new Error(`${name}.json does not state a board`);
	}
	return { ...read };
}

/**
 * Build one board, or leave it alone when the vault already has it.
 * @param name The file's name, without its extension.
 * @returns What happened, in a line.
 */
async function build(name: string): Promise<string> {
	const says = stated(name);
	const board = String(says["name"]);
	if (readSemanticBoard(vault, board).ok) {
		return `${board}: already built, left alone`;
	}
	const written = await writeSemanticBoard({
		vault,
		board,
		writer: { kind: "agent", reason: "building the tracked pipeline example" },
		transition: createBoardTransition(BoardCreateInputSchema.parse(says)),
	});
	if (written.outcome !== "applied") {
		throw new Error(`${board}: ${written.problem}`);
	}
	return `${board}: built at version ${written.board.version}`;
}

/**
 * Derive the tracked proposal and say what it proposes.
 *
 * Two writes rather than one, because that is what an agent does and what the
 * contract is shaped for: a branch carries its predecessor over whole, and what
 * it proposes is said afterwards as an ordinary edit to it.
 * @returns What happened, in a line.
 */
async function propose(): Promise<string> {
	const says = stated("proposal");
	const board = String(says["board"]);
	const name = String(says["name"]);
	const read = readSemanticBoard(vault, board);
	if (!read.ok) {
		throw new Error(`${board}: ${read.problem}`);
	}
	if (read.board.variants.some((variant) => variant.name === name)) {
		return `${board}: "${name}" already proposed, left alone`;
	}
	const branched = await writeSemanticBoard({
		vault,
		board,
		writer: { kind: "agent", reason: "building the tracked pipeline example" },
		expectedVersion: read.board.version,
		transition: branchVariantTransition(
			BoardBranchInputSchema.parse({
				from: says["from"],
				name,
				...(says["summary"] === undefined ? {} : { summary: says["summary"] }),
			}),
		),
	});
	if (branched.outcome !== "applied") {
		throw new Error(`${board}: ${branched.problem}`);
	}
	const edited = await writeSemanticBoard({
		vault,
		board,
		writer: { kind: "agent", reason: "building the tracked pipeline example" },
		expectedVersion: branched.board.version,
		transition: editVariantTransition(
			VariantEditInputSchema.parse({ variant: name, ...asEdit(says) }),
		),
	});
	if (edited.outcome !== "applied") {
		throw new Error(`${board}: ${edited.problem}`);
	}
	return `${board}: "${name}" proposed at version ${edited.board.version}`;
}

/**
 * What the tracked proposal says it changes.
 * @param says The statement read off disk.
 * @returns The edit it states.
 */
function asEdit(says: Record<string, unknown>): Record<string, unknown> {
	const edit: unknown = says["edit"];
	if (typeof edit !== "object" || edit === null || Array.isArray(edit)) {
		throw new Error("proposal.json states no edit");
	}
	return { ...edit };
}

/**
 * Draw every view of every variant of one board, into the artifact directory.
 * @param board The board's name.
 * @returns What was drawn, one line each.
 */
async function draw(board: string): Promise<string[]> {
	const read = readSemanticBoard(vault, board);
	if (!read.ok) {
		throw new Error(`${board}: ${read.problem}`);
	}
	const policy = readSemanticBoardConfiguration(vault).configuration;
	const pictures = await Promise.all(
		read.board.variants.flatMap((variant) =>
			read.board.views.map(async (view) => {
				// The render route draws the artifact, so the two cannot differ.
				const drawn = await renderBoard(
					read.board,
					// The file outlives the server that drew it, so it carries its faces.
					{ variant: variant.id, view: view.id, theme: "light" },
					policy,
				);
				if (!drawn.ok) throw new Error(`${board}: ${drawn.error}`);
				if (!wasDrawn(drawn.reply)) throw new Error(`${board}: ${view.name} draws nothing`);
				return { variant, view, picture: drawn.reply };
			}),
		),
	);
	return pictures.map(({ variant, view, picture }) => {
		const file = path.join(DRAWN, `${fileName(board, variant.name, view.name)}.svg`);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, picture.svg);
		return `${file} (${picture.width}x${picture.height})`;
	});
}

/**
 * A file name for one view of one variant of one board.
 * @param board The board's name.
 * @param variant The variant's name.
 * @param view The view's name.
 * @returns The name, with nothing in it that needs escaping.
 */
function fileName(board: string, variant: string, view: string): string {
	return `${board}-${variant}-${view}`
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, "-")
		.replace(/^-|-$/gu, "");
}

/**
 * Build every board, one at a time and in this order.
 *
 * Sequential on purpose: the board a drill-down points at has to exist before
 * the board that points at it, and two writes to one vault at once would be two
 * writers racing for the same lease — which the boundary would serialise anyway,
 * more slowly and less legibly.
 * @returns What happened, one line each.
 */
async function buildAll(): Promise<string[]> {
	const built: string[] = [];
	for (const name of BOARDS) {
		// oxlint-disable-next-line no-await-in-loop -- one writer at a time, by design
		built.push(await build(name));
	}
	return built;
}

const lines = await buildAll();
lines.push(await propose());
for (const name of BOARDS) {
	// oxlint-disable-next-line no-await-in-loop -- artifacts stay in board order
	lines.push(...(await draw(String(stated(name)["name"]))));
}
for (const line of lines) {
	process.stdout.write(`${line}\n`);
}
