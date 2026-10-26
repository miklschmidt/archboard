// Blind pairs of pictures for the grading council (docs/design/grading-council.md):
// every drawing of one vault that a change draws differently, as two PNGs whose
// sides the graders cannot tell apart. Each checkout draws its own side with
// its own scripts/render-corpus.ts and its own built core; one rasterizer then
// turns both sides' SVGs into pictures at the same scale.
//
// Run inside `nix develop` (it gives Chromium), from the repository root:
//   bun scripts/council-pairs.ts <before-checkout> <after-checkout> <out>
//     [--vault .archboard/vault] [--variants current|all] [--engines track,blocks]
//     [--limit N [--sample]] [--seed 1] [--max-side 4096]
//
// <out>/pairs is what the graders get; <out>/key.json says which side of each
// pair is the change and lists the drawings only one side drew; <out>/runs
// holds each side's corpus run. Only the light theme is drawn: a theme does not
// change a layout. A comparison drawing is kept only where it differs from its
// plain drawing, because otherwise it is the same layout.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createSemanticRasterizer, RASTER_MIN_SCALE } from "@archboard/renderer/rasterizer";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no manifest imports
import { drawingOf, keyOf, runOf, svgFileOf, type Drawn } from "./render-corpus.ts";

type Run = Record<string, Drawn>;

type Rasterizer = ReturnType<typeof createSemanticRasterizer>;

/** One differing drawing, as both sides drew it. */
interface Pair {
	readonly key: string;
	readonly before: Drawn;
	readonly after: Drawn;
}

/** What the command line settles. */
interface Settings {
	readonly before: string;
	readonly after: string;
	readonly out: string;
	readonly vault: string;
	readonly variants: string;
	readonly engines: string;
	/** How many pairs to draw; every one when absent. */
	readonly limit: number | undefined;
	readonly sample: boolean;
	readonly seed: number;
	readonly maxSide: number;
}

/**
 * A seeded source of numbers in [0, 1), so a seed repeats the same sample and sides.
 * @param seed The seed.
 * @returns The next number on each call.
 */
function randomFrom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d_2b_79_f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
}

/**
 * Stop the command over something on its command line.
 * @param message What is wrong and what to give instead.
 * @returns Never.
 */
function refuse(message: string): never {
	console.error(message);
	return process.exit(2);
}

/**
 * An option that must be a whole number, or the command stops.
 * @param name The option.
 * @param value What the command line gave.
 * @returns The number.
 */
function whole(name: string, value: string): number {
	const number = Number(value);
	if (Number.isInteger(number) && number >= 0) return number;
	return refuse(`${name} takes a whole number, not ${value}.`);
}

/**
 * The three paths of the command line, or the command stops.
 * @param positionals The command line's positional arguments.
 * @returns The before checkout, the after checkout and the output directory, resolved.
 */
function checkoutsOf(positionals: readonly string[]): [string, string, string] {
	const [before, after, out] = positionals.map((path) => resolve(path));
	if (positionals.length === 3 && before && after && out) return [before, after, out];
	return refuse("Usage: council-pairs.ts <before-checkout> <after-checkout> <out> [options]");
}

/**
 * What the command line asks for.
 * @returns The settings.
 */
function settingsOf(): Settings {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: {
			vault: { type: "string", default: ".archboard/vault" },
			variants: { type: "string", default: "current" },
			engines: { type: "string", default: "track,blocks" },
			limit: { type: "string" },
			sample: { type: "boolean", default: false },
			seed: { type: "string", default: "1" },
			"max-side": { type: "string", default: "4096" },
		},
	});
	const [before, after, out] = checkoutsOf(positionals);
	if (existsSync(out))
		refuse(`${out} exists; name a new directory so no earlier pair or key is mixed in.`);
	return {
		before,
		after,
		out,
		vault: values.vault,
		variants: values.variants,
		engines: values.engines,
		limit: values.limit === undefined ? undefined : whole("--limit", values.limit),
		sample: values.sample,
		seed: whole("--seed", values.seed),
		maxSide: whole("--max-side", values["max-side"]),
	};
}

/**
 * Draw the corpus of one checkout with that checkout's own code.
 * @param checkout The checkout.
 * @param run Where the run goes.
 * @param settings The variants and engines to draw.
 * @returns The run.
 */
async function drawSide(checkout: string, run: string, settings: Settings): Promise<Run> {
	if (!existsSync(join(checkout, "scripts", "render-corpus.ts")))
		throw new Error(`${checkout} has no scripts/render-corpus.ts to draw its side with.`);
	const command = [process.execPath, "scripts/render-corpus.ts", "render", run, "--svg"];
	command.push("--variants", settings.variants, "--engines", settings.engines, "--themes", "light");
	const child = Bun.spawn(command, { cwd: checkout, stdout: "inherit", stderr: "inherit" });
	if ((await child.exited) !== 0)
		throw new Error(`The corpus render of ${checkout} failed; its output is above.`);
	return runOf(run);
}

/**
 * Every key of one vault that either side drew.
 * @param runs Both sides.
 * @param vault The vault, as the runs name it.
 * @returns The keys, sorted.
 */
function keysOf(runs: readonly Run[], vault: string): string[] {
	const all = [...new Set(runs.flatMap((run) => Object.keys(run)))];
	const keys = all.filter((key) => drawingOf(key).vault === vault).toSorted();
	if (keys.length > 0) return keys;
	const vaults = [...new Set(all.map((key) => drawingOf(key).vault))];
	throw new Error(
		`Neither side drew a board of ${vault}; the corpus vaults are ${vaults.join(", ")}.`,
	);
}

/**
 * Whether a drawing that both sides drew is a pair: the sides differ, and a
 * comparison drawing is a layout of its own, not the same picture as its
 * plain drawing on both sides.
 * @param key The drawing's key.
 * @param before The before run, which drew it.
 * @param after The after run, which drew it.
 * @returns Whether to pair it.
 */
function differs(key: string, before: Run, after: Run): boolean {
	if (before[key]!.sha256 === after[key]!.sha256) return false;
	const drawing = drawingOf(key);
	if (!drawing.comparison) return true;
	const plain = keyOf({ ...drawing, comparison: false });
	return [before, after].some((run) => run[key]!.sha256 !== run[plain]?.sha256);
}

/**
 * The drawings of one vault that differ, and the keys only one side drew.
 * @param before The before run.
 * @param after The after run.
 * @param vault The vault, as the runs name it.
 * @returns The pairs in key order and the one-sided keys.
 */
function differing(before: Run, after: Run, vault: string) {
	const keys = keysOf([before, after], vault);
	const onlyBefore = keys.filter((key) => after[key] === undefined);
	const onlyAfter = keys.filter((key) => before[key] === undefined);
	const pairs = keys
		.filter((key) => before[key] !== undefined && after[key] !== undefined)
		.filter((key) => differs(key, before, after))
		.map((key): Pair => ({ key, before: before[key]!, after: after[key]! }));
	return { pairs, onlyBefore, onlyAfter };
}

/**
 * The pairs to draw: all of them, the first `limit`, or `limit` at random.
 * @param pairs Every differing drawing, in key order.
 * @param settings The limit and whether to sample.
 * @param random The seeded source.
 * @returns The chosen pairs, in key order.
 */
function choose(pairs: readonly Pair[], settings: Settings, random: () => number): Pair[] {
	const limit = settings.limit ?? pairs.length;
	if (!settings.sample) return pairs.slice(0, limit);
	const order = pairs.map((pair) => ({ pair, at: random() })).toSorted((a, b) => a.at - b.at);
	const keys = new Set(order.slice(0, limit).map(({ pair }) => pair.key));
	return pairs.filter((pair) => keys.has(pair.key));
}

/**
 * The scale both pictures of a pair share: native size, shrunk so the longest
 * side of either picture fits `maxSide`.
 * @param pair The pair.
 * @param maxSide The longest side a picture may have, in pixels.
 * @returns Bitmap pixels per diagram pixel.
 */
function scaleOf(pair: Pair, maxSide: number): number {
	const { before, after } = pair;
	const longest = Math.max(before.width, before.height, after.width, after.height);
	return Math.max(RASTER_MIN_SCALE, Math.min(1, maxSide / longest));
}

/**
 * Write one pair: A and B in the order given, and what the pair shows.
 * Nothing written here says which side is which.
 * @param rasterizer The rasterizer.
 * @param pair The pair.
 * @param order The side drawn as A, then the side drawn as B.
 * @param runs The directory of both sides' runs.
 * @param dir The pair's directory.
 * @param scale The scale of both pictures.
 */
async function writePair(
	rasterizer: Rasterizer,
	pair: Pair,
	order: readonly ["before" | "after", "before" | "after"],
	runs: string,
	dir: string,
	scale: number,
) {
	mkdirSync(dir, { recursive: true });
	for (const [index, side] of order.entries()) {
		const svg = readFileSync(join(runs, side, "svg", svgFileOf(pair.key)), "utf8");
		const { width, height } = pair[side];
		// oxlint-disable-next-line no-await-in-loop -- the rasterizer draws one capture at a time
		const capture = await rasterizer.rasterize({ svg, width, height, scale });
		writeFileSync(join(dir, `${index === 0 ? "A" : "B"}.png`), capture.png);
	}
	const { board, view, engine } = drawingOf(pair.key);
	writeFileSync(
		join(dir, "about.json"),
		`${JSON.stringify({ board, view, engine }, null, "\t")}\n`,
	);
}

/**
 * Write every chosen pair, each with its sides in a random order.
 * @param chosen The pairs.
 * @param settings Where they go and their largest size.
 * @param random The seeded source.
 * @returns Which side of each pair is before, for the key.
 */
async function writePairs(chosen: readonly Pair[], settings: Settings, random: () => number) {
	mkdirSync(join(settings.out, "pairs"), { recursive: true });
	const rasterizer = createSemanticRasterizer();
	const keyed = [];
	try {
		for (const [index, pair] of chosen.entries()) {
			const name = String(index + 1).padStart(3, "0");
			const scale = scaleOf(pair, settings.maxSide);
			const beforeIsA = random() < 0.5;
			const order = beforeIsA ? (["before", "after"] as const) : (["after", "before"] as const);
			const dir = join(settings.out, "pairs", name);
			// oxlint-disable-next-line no-await-in-loop -- the rasterizer draws one capture at a time
			await writePair(rasterizer, pair, order, join(settings.out, "runs"), dir, scale);
			keyed.push({ pair: name, before: beforeIsA ? "A" : "B", key: pair.key, scale });
		}
	} finally {
		await rasterizer.stop();
	}
	return keyed;
}

/** Make the pairs the command line asks for. */
async function main() {
	const settings = settingsOf();
	const random = randomFrom(settings.seed);
	const runs = join(settings.out, "runs");
	const [before, after] = await Promise.all([
		drawSide(settings.before, join(runs, "before"), settings),
		drawSide(settings.after, join(runs, "after"), settings),
	]);
	const found = differing(before, after, settings.vault);
	const chosen = choose(found.pairs, settings, random);
	const started = performance.now();
	const keyed = await writePairs(chosen, settings, random);
	const seconds = ((performance.now() - started) / 1000).toFixed(1);
	const drawn = new Set(chosen.map(({ key }) => key));
	const key = {
		before: settings.before,
		after: settings.after,
		vault: settings.vault,
		seed: settings.seed,
		pairs: keyed,
		notDrawn: found.pairs.map((pair) => pair.key).filter((pair) => !drawn.has(pair)),
		onlyBefore: found.onlyBefore,
		onlyAfter: found.onlyAfter,
	};
	writeFileSync(join(settings.out, "key.json"), `${JSON.stringify(key, null, "\t")}\n`);
	for (const one of found.onlyBefore) console.log(`only before: ${one}`);
	for (const one of found.onlyAfter) console.log(`only after: ${one}`);
	const oneSided = found.onlyBefore.length + found.onlyAfter.length;
	console.log(
		`${found.pairs.length} drawings of ${settings.vault} differ; ${chosen.length} pairs in ` +
			`${join(settings.out, "pairs")} (${seconds} s to rasterize); ${oneSided} drawn on one side only; ` +
			`key in ${join(settings.out, "key.json")}`,
	);
}

await main();
