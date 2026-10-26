// The corpus every renderer port step is held to (ADR 0059): every board of
// the dogfood vault and of the vaults under examples/, every variant, every
// view, and the complete architecture without a default view's filter.
// Each engine, theme and comparison setting applies to the authored views.
// Whole boards are drawn without comparison. `render`
// writes the hash, size and time of each drawing; `compare` says which
// drawings differ between two runs and how their times moved.
//
// Run from the repository root:
//   bun scripts/render-corpus.ts render <out> [--engines track,blocks]
//     [--variants all|current] [--themes light,dark] [--comparison on,off]
//     [--jobs 8] [--svg]
//   bun scripts/render-corpus.ts compare <before> <after>
//
// A run's times are honest only with --jobs 1: parallel drawings wait for the
// same engine workers. --svg also writes each drawing, which the full corpus
// makes into gigabytes, so name a smaller corpus with it.

import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import type { SemanticBoard } from "@archboard/board/document";
import { locateSemanticBoard } from "@archboard/board/address";
import { readSemanticBoardAt } from "@archboard/board/store-read";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { renderArchitecture, renderBoard } from "@archboard/renderer/bun";

/** One drawing of the corpus, as a run recorded it. */
export interface Drawn {
	readonly sha256: string;
	readonly ms: number;
	readonly width: number;
	readonly height: number;
}

/** One drawing to make. */
interface Job {
	readonly key: string;
	readonly vault: string;
	readonly board: SemanticBoard;
	readonly policy: Policy;
	readonly variant: string;
	readonly view: string | undefined;
	readonly whole: boolean;
	readonly engine: z.infer<typeof LayoutEngineSchema>;
	readonly theme: "light" | "dark";
	readonly comparison: boolean;
}

type Policy = ReturnType<typeof readSemanticBoardConfiguration>["configuration"];

/** What a drawing's key names, in the order the key names it. */
export interface DrawingKey {
	readonly vault: string;
	readonly board: string;
	/** The variant's name. */
	readonly variant: string;
	/** The view's name, `overview`, or the synthetic `(whole board)`. */
	readonly view: string;
	readonly engine: string;
	readonly theme: string;
	readonly comparison: boolean;
}

/** What separates the fields of a key. */
const KEY_SEPARATOR = " | ";

/**
 * The key a run records a drawing under.
 * @param drawing What the drawing is.
 * @returns The key.
 */
export function keyOf(drawing: DrawingKey): string {
	const { vault, board, variant, view, engine, theme, comparison } = drawing;
	return [vault, board, variant, view, engine, theme, comparison ? "comparison" : "plain"].join(
		KEY_SEPARATOR,
	);
}

/**
 * What a key names.
 * @param key A key a run recorded.
 * @returns Its fields.
 */
export function drawingOf(key: string): DrawingKey {
	const [vault, board, variant, view, engine, theme, comparison] = key.split(KEY_SEPARATOR);
	return {
		vault: vault!,
		board: board!,
		variant: variant!,
		view: view!,
		engine: engine!,
		theme: theme!,
		comparison: comparison === "comparison",
	};
}

/**
 * The file `--svg` writes a drawing to, in the run's `svg` directory.
 * @param key The drawing's key.
 * @returns The file name.
 */
export function svgFileOf(key: string): string {
	return `${key.replaceAll(/[^\w-]+/gu, "_")}.svg`;
}

/**
 * The vaults of the corpus: the dogfood vault and every example's.
 * @returns Their directories, relative to the repository root.
 */
function corpusVaults(): string[] {
	return [
		".archboard/vault",
		...readdirSync("examples")
			.map((name) => join("examples", name))
			.filter((dir) => existsSync(join(dir, ".archboard", "config.yaml"))),
	];
}

/**
 * Every board of a vault, read from a copy so the vault is never touched, and its policy.
 * @param vault The vault directory.
 * @returns The boards and the policy.
 */
function readVault(vault: string): { boards: SemanticBoard[]; policy: Policy } {
	const copy = mkdtempSync(join(tmpdir(), "archboard-corpus-vault-"));
	try {
		mkdirSync(join(copy, ".archboard"), { recursive: true });
		copyFileSync(join(vault, ".archboard", "config.yaml"), join(copy, ".archboard", "config.yaml"));
		const configured = readSemanticBoardConfiguration(copy);
		const boards = readdirSync(vault)
			.filter((file) => file.endsWith(".semantic.json"))
			.toSorted()
			.flatMap((file) => {
				copyFileSync(join(vault, file), join(copy, file));
				const read = readSemanticBoardAt(
					copy,
					locateSemanticBoard(file.slice(0, -".semantic.json".length), copy),
					configured,
				);
				return read.ok ? [read.board] : [];
			});
		return { boards, policy: configured.configuration };
	} finally {
		rmSync(copy, { recursive: true, force: true });
	}
}

/**
 * Draw one job.
 * @param job The drawing.
 * @returns Its record and its SVG, or nothing when the board draws nothing there.
 */
async function draw(job: Job): Promise<{ drawn: Drawn; svg: string } | undefined> {
	const started = performance.now();
	const reply = job.whole
		? await renderArchitecture({
				content: job.board.variants.find(({ id }) => id === job.variant)!.content,
				policy: job.policy,
				theme: job.theme,
				layout: job.engine,
			})
		: await renderBoard(
				job.board,
				{
					variant: job.variant,
					...(job.view === undefined ? {} : { view: job.view }),
					comparison: job.comparison,
					theme: job.theme,
					layout: job.engine,
				},
				job.policy,
			).then((outcome) => (outcome.ok && "svg" in outcome.reply ? outcome.reply : undefined));
	const ms = Math.round(performance.now() - started);
	if (reply === undefined) return undefined;
	const { svg, width, height } = reply;
	const sha256 = createHash("sha256").update(svg).digest("hex");
	return { drawn: { sha256, ms, width, height }, svg };
}

/**
 * One option's comma-separated values.
 * @param value The option as parsed.
 * @param fallback The values when the option is absent.
 * @returns The values.
 */
function listOf(value: string | boolean | undefined, fallback: string): string[] {
	return (typeof value === "string" ? value : fallback).split(",");
}

/**
 * A run's drawings, as `render` wrote them.
 * @param dir The run's directory.
 * @returns Each drawing by its key.
 */
export function runOf(dir: string): Record<string, Drawn> {
	return JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"));
}

/** What each drawing of a board is drawn under, besides its variant and view. */
interface Axes {
	readonly engines: readonly Job["engine"][];
	readonly themes: readonly Job["theme"][];
	readonly comparisons: readonly boolean[];
	readonly every: boolean;
}

/**
 * The axes the command line asks for.
 * @param options The command line options.
 * @returns The axes.
 */
function axesOf(options: Record<string, string | boolean | undefined>): Axes {
	return {
		engines: z.array(LayoutEngineSchema).parse(listOf(options["engines"], "track,blocks")),
		themes: z.array(z.enum(["light", "dark"])).parse(listOf(options["themes"], "light,dark")),
		comparisons: listOf(options["comparison"], "on,off").map((value) => value === "on"),
		every: (options["variants"] ?? "all") === "all",
	};
}

/**
 * Every drawing of one board. Theme and comparison vary innermost, so one
 * layout serves them all.
 * @param vault The board's vault.
 * @param board The board.
 * @param policy The vault's policy.
 * @param axes What each drawing is drawn under.
 * @returns The jobs.
 */
function jobsOfBoard(vault: string, board: SemanticBoard, policy: Policy, axes: Axes): Job[] {
	const variants = board.variants.filter(({ id }) => axes.every || id === board.current);
	const views = [
		{ view: undefined, whole: true },
		{ view: undefined, whole: false },
		...board.views.map(({ name }) => ({ view: name, whole: false })),
	];
	return variants.flatMap((variant) =>
		views.flatMap(({ view, whole }) =>
			axes.engines.flatMap((engine) =>
				axes.themes.flatMap((theme) =>
					(whole ? [false] : axes.comparisons).map((comparison) => ({
						key: keyOf({
							vault,
							board: board.name,
							variant: variant.name,
							view: whole ? "(whole board)" : (view ?? "overview"),
							engine,
							theme,
							comparison,
						}),
						vault,
						board,
						policy,
						variant: variant.id,
						view,
						whole,
						engine,
						theme,
						comparison,
					})),
				),
			),
		),
	);
}

/**
 * Draw every job, a few at a time, and write the drawings that `--svg` asks for.
 * @param jobs The drawings.
 * @param parallel How many to draw at once.
 * @param svgs Where to write each drawing, if anywhere.
 * @returns Each drawing's record by its key.
 */
async function drawAll(
	jobs: readonly Job[],
	parallel: number,
	svgs: string | undefined,
): Promise<Record<string, Drawn>> {
	const drawn: Record<string, Drawn> = {};
	let next = 0;
	/** Draw jobs one after another until none is left. */
	async function worker() {
		while (next < jobs.length) {
			const job = jobs[next++]!;
			// oxlint-disable-next-line no-await-in-loop -- each worker draws one job at a time
			const result = await draw(job);
			if (next % 200 === 0) console.log(`${next} of ${jobs.length}`);
			if (result === undefined) continue;
			drawn[job.key] = result.drawn;
			if (svgs !== undefined) writeFileSync(join(svgs, svgFileOf(job.key)), result.svg);
		}
	}
	await Promise.all(Array.from({ length: parallel }, worker));
	return drawn;
}

/**
 * Render the corpus into a directory.
 * @param out The directory.
 * @param options The command line options.
 */
async function render(out: string, options: Record<string, string | boolean | undefined>) {
	const axes = axesOf(options);
	const jobs = corpusVaults().flatMap((vault) => {
		const { boards, policy } = readVault(vault);
		return boards.flatMap((board) => jobsOfBoard(vault, board, policy, axes));
	});
	const svgs = options["svg"] === true ? join(out, "svg") : undefined;
	mkdirSync(svgs ?? out, { recursive: true });
	const started = performance.now();
	const drawn = await drawAll(jobs, Number(options["jobs"] ?? 8), svgs);
	const sorted = Object.fromEntries(
		Object.entries(drawn).toSorted(([a], [b]) => a.localeCompare(b)),
	);
	writeFileSync(join(out, "corpus.json"), JSON.stringify(sorted, null, "\t"));
	const seconds = Math.round((performance.now() - started) / 1000);
	console.log(`${Object.keys(drawn).length} drawings of ${jobs.length} jobs in ${seconds} s`);
}

/**
 * Compare two runs: which drawings differ, and how the time of each engine moved.
 * @param before The earlier run's directory.
 * @param after The later run's directory.
 */
function compare(before: string, after: string) {
	const [one, other] = [runOf(before), runOf(after)];
	const keys = [...new Set([...Object.keys(one), ...Object.keys(other)])].toSorted();
	const differ = keys.filter((key) => one[key]?.sha256 !== other[key]?.sha256);
	for (const key of differ)
		console.log(
			`differs: ${key}${one[key] === undefined ? " (only after)" : other[key] === undefined ? " (only before)" : ""}`,
		);
	const engines = [...new Set(keys.map((key) => drawingOf(key).engine))];
	for (const engine of engines) {
		const shared = keys.filter(
			(key) =>
				drawingOf(key).engine === engine && one[key] !== undefined && other[key] !== undefined,
		);
		/**
		 * The time a run spent on the shared drawings.
		 * @param run The run.
		 * @returns Milliseconds.
		 */
		function total(run: Record<string, Drawn>): number {
			return shared.reduce((sum, key) => sum + run[key]!.ms, 0);
		}
		const slower = shared
			.map((key) => ({ key, by: other[key]!.ms - one[key]!.ms }))
			.toSorted((a, b) => b.by - a.by)
			.slice(0, 5);
		console.log(
			`${engine}: ${shared.length} drawings, ${total(one)} ms before, ${total(other)} ms after; most slower: ${slower
				.map(({ key, by }) => `${key} ${by > 0 ? "+" : ""}${by} ms`)
				.join("; ")}`,
		);
	}
	console.log(`${differ.length} of ${keys.length} drawings differ`);
}

/** Run the command the command line names. */
async function main() {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			engines: { type: "string" },
			variants: { type: "string" },
			themes: { type: "string" },
			comparison: { type: "string" },
			jobs: { type: "string" },
			svg: { type: "boolean" },
		},
	});
	const [command, first, second] = positionals;
	if (command === "render" && first !== undefined) await render(first, values);
	else if (command === "compare" && first !== undefined && second !== undefined)
		compare(first, second);
	else {
		console.error("Usage: render <out> [options] | compare <before> <after>");
		process.exit(2);
	}
	process.exit(0);
}

// council-pairs.ts reads a run's key format from here without running a command.
if (import.meta.main) await main();
