// Records the solves of first renders, for measuring where a render's time
// goes and for replaying the core's layout natively without Graphviz
// (`crates/archboard-layout/examples/replay.rs`, docs/design/first-render-critical-path.md).
//
// Each board of `timing.ts` is drawn once, the way its first render draws it,
// with a host that solves here, one solve at a time, on Graphviz as loaded
// (`loadLayoutEngine`), and times each solve and each Graphviz call in it.
// The host answers the core on a clock of its own: a solve asked at time t
// answers at t plus what it took, as if every solve had a worker of its own,
// and the earliest answer is given first. So the clock at the end is the
// render's critical path of solves, and each solve names the solve whose
// answer it was asked after.
//
// Writes `<out>/<board>.json` for each board: every solve's graph, what it
// answered, each Graphviz call with its answer, its times and its place on
// the clock. Prints one line per board.
//
// Run from the repository root, inside `nix develop`, after `bun run build:core`:
//   bun packages/renderer/tests/runtime/support/capture-solves.ts <out> [board ...]

import fs from "node:fs";
import path from "node:path";
import { instance, type Viz } from "@viz-js/viz";
import { parseSemanticBoard } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@archboard/board/policy";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { renderArchitecture } from "@archboard/renderer/bun";
import { iconPaths } from "#runtime/operations/icon-paths.ts";
import { loadCore } from "#runtime/services/core.ts";
import { THEME_STYLESHEET } from "#runtime/store/assets.ts";
import { readThemeColors } from "#runtime/store/theme/read.ts";
import { loadLayoutEngine } from "#shared/rules/engine/layout-engine.ts";
import { installRendererHost } from "#shared/rules/render/host.ts";
import { orderedFixture } from "./ordered-fixture.ts";

/** One graph a solve's Graphviz laid out, what it answered, and how long it took. */
interface Render {
	readonly graph: string;
	readonly answer: string;
	readonly ms: number;
}

/** One solve a render asked for. */
interface Solve {
	readonly graph: string;
	readonly answer: string;
	readonly renders: Render[];
	/** What the solve took, Graphviz included. */
	readonly ms: number;
	/** What its Graphviz calls took. */
	readonly graphvizMs: number;
	/** When it was asked, on the host's clock. */
	readonly asked: number;
	/** The solve whose answer it was asked after, if any. */
	readonly after: number | undefined;
	/** When it answered, on the host's clock. */
	answered?: number;
	calledOff: boolean;
}

const out = process.argv[2];
if (out === undefined) throw new Error("Name the directory to write to.");
const only = new Set(process.argv.slice(3));
fs.mkdirSync(out, { recursive: true });

const fixtures = "docs/design/wide-board-layout-fixtures";
const vault = ".archboard/vault";
const items: { name: string; content: unknown; policy: SemanticPolicy }[] = [];
for (const file of fs
	.readdirSync(fixtures)
	.filter((name) => name.endsWith(".content.json"))
	.toSorted()) {
	items.push({
		name: file.replace(".content.json", ""),
		content: JSON.parse(fs.readFileSync(path.join(fixtures, file), "utf8")),
		policy: DEFAULT_SEMANTIC_POLICY,
	});
}
const { configuration: policy } = readSemanticBoardConfiguration(vault);
for (const file of fs
	.readdirSync(vault)
	.filter((name) => name.endsWith(".semantic.json"))
	.toSorted()) {
	const parsed = parseSemanticBoard(JSON.parse(fs.readFileSync(path.join(vault, file), "utf8")));
	if (!parsed.ok) continue;
	const current = parsed.board.variants.find((variant) => variant.id === parsed.board.current);
	if (current !== undefined) items.push({ name: parsed.board.name, content: current.content, policy });
}

/** The Graphviz calls of the solve under way. */
let renders: Render[] = [];

/**
 * A Graphviz that keeps each graph it lays out, its answer and its time.
 * @param viz Graphviz.
 * @returns The same Graphviz, keeping.
 */
function keeping(viz: Viz): Viz {
	return new Proxy(viz, {
		/**
		 * The Graphviz's own member, its rendering keeping what it renders.
		 * @param target The Graphviz.
		 * @param name The member.
		 * @returns The member.
		 */
		get(target, name) {
			if (name !== "renderString") return Reflect.get(target, name);
			const render: Viz["renderString"] = (graph, options) => {
				const started = performance.now();
				const answer = target.renderString(graph, options);
				renders.push({ graph, answer, ms: performance.now() - started });
				return answer;
			};
			return render;
		},
	});
}

// Warm the Bun host once, so that it is installed before this one replaces it.
await renderArchitecture({
	policy: DEFAULT_SEMANTIC_POLICY,
	content: orderedFixture({
		nodes: ["warm-a", "warm-b"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [{ id: "warm-ab", from: "warm-a", to: "warm-b", kind: "call" }],
	}),
	theme: "light",
});

const engine = await loadLayoutEngine(async () => keeping(await instance()));
const core = loadCore();
let clock = 0;
let solves: Solve[] = [];
/** The solves asked and not yet answered, with when each answers. */
let waiting: { at: number; index: number; answer: () => void }[] = [];
/** The solve answered last. */
let last: number | undefined;

installRendererHost({
	core: () => core,
	solve: (graph, signal) => {
		const index = solves.length;
		renders = [];
		const started = performance.now();
		const answer = engine(graph);
		const ms = performance.now() - started;
		const solve: Solve = {
			graph,
			answer,
			renders,
			ms,
			graphvizMs: renders.reduce((sum, render) => sum + render.ms, 0),
			asked: clock,
			after: last,
			calledOff: false,
		};
		solves.push(solve);
		signal?.addEventListener("abort", () => (solve.calledOff = true), { once: true });
		return new Promise((resolve) => {
			waiting.push({ at: clock + ms, index, answer: () => resolve(answer) });
		});
	},
	themeColors: readThemeColors(fs.readFileSync(THEME_STYLESHEET, "utf8")),
	iconPaths,
});

for (const item of items) {
	if (only.size > 0 && !only.has(item.name)) continue;
	clock = 0;
	solves = [];
	waiting = [];
	last = undefined;
	const started = performance.now();
	let done = false;
	const rendered = renderArchitecture({
		policy: item.policy,
		content: orderedFixture(item.content),
		theme: "light",
	}).finally(() => (done = true));
	while (!done) {
		await new Promise((resolve) => setImmediate(resolve));
		if (done || waiting.length === 0) continue;
		waiting.sort((one, other) => one.at - other.at || one.index - other.index);
		const next = waiting.shift();
		if (next === undefined) continue;
		clock = next.at;
		last = next.index;
		const solve = solves[next.index];
		if (solve !== undefined) solve.answered = clock;
		next.answer();
	}
	await rendered;
	const wall = performance.now() - started;
	const solveMs = solves.reduce((sum, solve) => sum + solve.ms, 0);
	const graphvizMs = solves.reduce((sum, solve) => sum + solve.graphvizMs, 0);
	fs.writeFileSync(
		path.join(out, `${item.name.replaceAll(/[^\w-]+/gu, "-")}.json`),
		JSON.stringify({ name: item.name, wall, clock, solves }),
	);
	console.log(
		`${item.name.padEnd(22)} solves ${String(solves.length).padStart(3)}  cpu ${Math.round(solveMs).toString().padStart(5)} ms (graphviz ${Math.round(graphvizMs).toString().padStart(5)})  critical path ${Math.round(clock).toString().padStart(5)} ms  render outside solves ${Math.round(wall - solveMs)} ms`,
	);
}
process.exit(0);
