// The corpus every renderer port step is held to (ADR 0059): the canonical
// model of the dogfood vault and of the vaults under examples/, its current
// state and every proposal, the whole model, each module that holds parts, and
// each flow as a sequence and a flowchart.
// Each engine, theme and comparison setting applies to every reading. `render`
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
// same engine workers. --svg also writes each drawing and its painting, which
// the full corpus makes into gigabytes, so name a smaller corpus with it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { LayoutEngineSchema } from "@archboard/model/render-reply";
import { projectFlow, projectModel, type Model } from "@archboard/model/content";
import { readArchitectureModel } from "@archboard/model/store-read";
import { renderArchitecture } from "@archboard/renderer/bun";

/** One drawing of the corpus, as a run recorded it. */
interface Drawn {
	readonly sha256: string;
	readonly ms: number;
	readonly width: number;
	readonly height: number;
}

/** One state of a model, and the model it compares against when it has one. */
interface State {
	readonly name: string;
	readonly model: Model;
	readonly reference: Model | undefined;
}

/** What a drawing reads of a state. */
interface Reading {
	readonly view: string;
	readonly grammar: "architecture" | "sequence" | "flowchart";
	readonly scope: string | null;
	readonly flow: Model["collections"][number]["flows"][number] | undefined;
}

/** One drawing to make. */
interface Job {
	readonly key: string;
	readonly state: State;
	readonly reading: Reading;
	readonly engine: z.infer<typeof LayoutEngineSchema>;
	readonly theme: "light" | "dark";
	readonly comparison: boolean;
}

/** What a drawing's key names, in the order the key names it. */
interface DrawingKey {
	readonly vault: string;
	readonly board: string;
	/** The state's name. */
	readonly variant: string;
	/** The reading: `(whole model)`, a module's id, or a flow's id and grammar. */
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
function keyOf(drawing: DrawingKey): string {
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
function drawingOf(key: string): DrawingKey {
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
function svgFileOf(key: string): string {
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
			.filter((dir) => existsSync(join(dir, "model.json"))),
	];
}

/**
 * The base a state compares against.
 * @param vault The vault directory.
 * @param comparison The state's comparison.
 * @returns The base, or nothing when it does not read.
 */
async function readReference(
	vault: string,
	comparison: NonNullable<Model["comparison"]>,
): Promise<Model | undefined> {
	const reference = await readArchitectureModel(vault, undefined, undefined, {
		...(comparison.checkpoint === undefined
			? { state: comparison.against?.id }
			: { checkpoint: comparison.checkpoint }),
		compare: false,
	});
	return reference.success ? reference : undefined;
}

/**
 * One state of a vault's model, with its comparison base when it has one.
 * @param vault The vault directory.
 * @param state The state's id; the current state when absent.
 * @returns The state, or nothing when it does not read.
 */
async function readState(vault: string, state?: string): Promise<State | undefined> {
	const model = await readArchitectureModel(vault, undefined, undefined, { state });
	if (!model.success) return undefined;
	const name = model.selectedState?.name ?? "current";
	const { comparison } = model;
	const reference = comparison && (await readReference(vault, comparison));
	return { name, model, reference };
}

/**
 * The states of a vault's model that the run asks for. A read never writes, so
 * the vault is never touched.
 * @param vault The vault directory.
 * @param every Whether every proposal is drawn beside the current state.
 * @returns The states.
 */
async function readVault(vault: string, every: boolean): Promise<State[]> {
	const directory = join(vault, "proposals");
	const proposals =
		every && existsSync(directory)
			? readdirSync(directory)
					.filter((file) => file.endsWith(".proposal.json"))
					.toSorted()
					.map((file) => file.slice(0, -".proposal.json".length))
			: [];
	const states = await Promise.all(
		[undefined, ...proposals].map((proposal) => readState(vault, proposal)),
	);
	return states.flatMap((state) => (state === undefined ? [] : [state]));
}

/**
 * Every reading of a model: the whole of it, each module that holds parts, and
 * each flow in both of its grammars.
 * @param model The model.
 * @returns The readings.
 */
function readingsOf(model: Model): Reading[] {
	const scopes = model.modules
		.filter((module) => model.modules.some((child) => child.parent === module.id))
		.map((module) => module.id);
	return [
		{ view: "(whole model)", grammar: "architecture", scope: null, flow: undefined },
		...scopes.map((scope) => ({
			view: scope,
			grammar: "architecture" as const,
			scope,
			flow: undefined,
		})),
		...model.collections
			.flatMap((collection) => collection.flows)
			.flatMap((flow) =>
				(["sequence", "flowchart"] as const).map((grammar) => ({
					view: `${flow.id} ${grammar}`,
					grammar,
					scope: null,
					flow,
				})),
			),
	];
}

/**
 * Draw one job.
 * @param job The drawing.
 * @returns Its record and its SVG, or nothing when the reading draws nothing.
 */
async function draw(
	job: Job,
): Promise<{ drawn: Drawn; svg: string; painting: string } | undefined> {
	const { model, reference } = job.state;
	const { scope, flow, grammar } = job.reading;
	const architecture = projectModel(model, scope, null, {}, job.comparison ? reference : undefined);
	const reading = flow === undefined ? architecture : projectFlow(architecture, flow);
	if (reading.content.nodes.length === 0) return undefined;
	const started = performance.now();
	const { svg, painting, width, height } = await renderArchitecture({
		content: reading.content,
		variant: reading.complete,
		held: reading.held,
		standing: reading.standing,
		unsettled: reading.unsettled,
		grammar,
		policy: model.policy,
		theme: job.theme,
		layout: job.engine,
	});
	const ms = Math.round(performance.now() - started);
	const sha256 = createHash("sha256").update(svg).digest("hex");
	return { drawn: { sha256, ms, width, height }, svg, painting };
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
function runOf(dir: string): Record<string, Drawn> {
	return JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"));
}

/** What each drawing of a model is drawn under, besides its state and reading. */
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
 * Every drawing of one state. Theme and comparison vary innermost, so one
 * layout serves them all. A state with no comparison base draws no comparison.
 * @param vault The state's vault.
 * @param state The state.
 * @param axes What each drawing is drawn under.
 * @returns The jobs.
 */
function jobsOfState(vault: string, state: State, axes: Axes): Job[] {
	const comparisons = axes.comparisons.filter(
		(comparison) => !comparison || state.reference !== undefined,
	);
	return readingsOf(state.model).flatMap((reading) =>
		axes.engines.flatMap((engine) =>
			axes.themes.flatMap((theme) =>
				comparisons.map((comparison) => ({
					key: keyOf({
						vault,
						board: state.model.manifest.name,
						variant: state.name,
						view: reading.view,
						engine,
						theme,
						comparison,
					}),
					state,
					reading,
					engine,
					theme,
					comparison,
				})),
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
			if (svgs !== undefined) {
				const file = join(svgs, svgFileOf(job.key));
				writeFileSync(file, result.svg);
				writeFileSync(`${file}.painting.json`, result.painting);
			}
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
	const vaults = await Promise.all(
		corpusVaults().map(async (vault) => ({ vault, states: await readVault(vault, axes.every) })),
	);
	const jobs = vaults.flatMap(({ vault, states }) =>
		states.flatMap((state) => jobsOfState(vault, state, axes)),
	);
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

await main();
