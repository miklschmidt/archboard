// The joins choice of the Blocks engine, as the host that runs its solves sees
// it. A turn kept calls off only the candidates asked for ahead that no turn to
// come weighs. A candidate cancelled while active still finishes normally, and a
// later join turn must share that solve; a cancelled queued candidate must
// instead be recreated. Ordinary engine failures must keep reaching the
// required turn.
import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import type { VariantContent } from "@archboard/board/content";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { installBunHost } from "#runtime/services/bun-host.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { installRendererHost, rendererHost, type RendererHost } from "#shared/rules/render/host.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * Source blocks of two cards each, every card's line joining on its way into
 * one card of another block.
 * @param sources The source blocks.
 * @param tag Words that keep this board's layouts apart from another test's.
 * @returns The content.
 */
function joining(sources: readonly string[], tag: string): VariantContent {
	return orderedFixture({
		nodes: [
			...sources.map((id) => ({ id, name: `${id} ${tag}`, kind: "service" })),
			{ id: "target", name: "Target", kind: "service" },
			{ id: "dest", name: "Destination", kind: "module", parent: "target" },
			...sources.flatMap((parent) =>
				[1, 2].map((index) => ({
					id: `${parent}${index}`,
					name: `Source ${parent} ${index}`,
					kind: "module",
					parent,
				})),
			),
		],
		edges: sources.flatMap((source) =>
			[1, 2].map((index) => ({
				id: `${source}e${index}`,
				from: `${source}${index}`,
				to: "dest",
				kind: "call",
			})),
		),
	});
}

/**
 * The blocks a candidate keeps apart, sorted.
 * @param graph The candidate graph.
 * @returns Their ids, joined by commas.
 */
function apartOf(graph: ElkNode): string {
	const apart = JSON.parse(graph.layoutOptions?.["archboard.blocks.apart"] ?? "[]") as string[];
	return apart.toSorted().join(",");
}

/**
 * Geometry that reads better the shorter its one line is. Its card width
 * identifies the candidate drawn. The choice reads the reading the core tells
 * with a drawing: this one is what it tells of one straight line that long and
 * nothing else.
 * @param content The board.
 * @param graph The candidate graph.
 * @param length How long its line is.
 * @returns The host's solved graph, as the core reads it.
 */
function answer(content: VariantContent, graph: ElkNode, length: number): string {
	const placed = {
		width: 3000,
		height: 3000,
		cards: content.nodes
			.filter(({ parent }) => parent !== undefined)
			.map(({ id }, index) => ({
				id,
				depth: 1,
				box: { x: 50, y: 50 + index * 150, width: length, height: 100 },
			})),
		frames: [],
		regions: [],
		edges: [
			{
				id: "cost",
				points: [
					{ x: 0, y: 0 },
					{ x: length, y: 0 },
				],
			},
		],
	};
	const reading = {
		parted: 0,
		cost: length / 1000,
		weighed: { width: 3000, height: 3000, crossings: 0, away: 0, bends: 0, length },
		crossings: 0,
		length,
	};
	return JSON.stringify({
		...graph,
		layoutOptions: {
			...graph.layoutOptions,
			"archboard.blocks.placed": JSON.stringify(placed),
			"archboard.blocks.reading": JSON.stringify(reading),
		},
	});
}

/**
 * Draw a board on the Blocks engine with the host's solves replaced.
 * @param content The board.
 * @param solve The solves.
 * @returns The drawing, or why it failed.
 */
async function drawnWith(content: VariantContent, solve: RendererHost["solve"]) {
	installBunHost();
	const host = rendererHost();
	installRendererHost({ ...host, solve });
	try {
		return await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			layout: "blocks",
			theme: "light",
		});
	} finally {
		installRendererHost(host);
	}
}

/** One candidate the joins asked for: which blocks apart, and whether it was called off before it was solved. */
interface Asked {
	readonly apart: string;
	calledOff: boolean;
}

test.each([
	{
		// Two blocks: the turns from every join apart weigh the sets the turns
		// from none apart asked for ahead, so nothing is called off.
		blocks: ["a", "b"],
		lengths: { "": 4000, "a,b": 2000 } as Record<string, number>,
		asked: [
			{ apart: "", calledOff: false },
			{ apart: "a,b", calledOff: false },
			{ apart: "a", calledOff: false },
			{ apart: "b", calledOff: false },
		],
	},
	{
		// Three blocks: every join apart is kept, then b and c apart, so the
		// turns after each ask for sets the turns before them called off.
		blocks: ["a", "b", "c"],
		lengths: { "": 4000, "a,b,c": 3000, "b,c": 2000 } as Record<string, number>,
		asked: [
			{ apart: "", calledOff: false },
			{ apart: "a,b,c", calledOff: false },
			{ apart: "a", calledOff: true },
			{ apart: "b", calledOff: true },
			{ apart: "c", calledOff: true },
			{ apart: "b,c", calledOff: false },
			{ apart: "a,c", calledOff: true },
			{ apart: "a,b", calledOff: true },
			{ apart: "c", calledOff: false },
			{ apart: "b", calledOff: false },
		],
	},
])(
	"with $blocks joining, a turn kept calls off only the candidates asked for ahead that no turn to come weighs, and one asked for again is solved afresh",
	async ({ blocks, lengths, asked: expected }) => {
		const content = joining(blocks, "ahead");
		const asked: Asked[] = [];
		const drawing = await drawnWith(content, (written, signal) => {
			const graph = JSON.parse(written) as ElkNode;
			const one: Asked = { apart: apartOf(graph), calledOff: false };
			// The drawing kept, faced to its blocks' walls, is the walls' choice, not a join turn.
			if (graph.layoutOptions?.["archboard.blocks.facing"] !== "true") asked.push(one);
			// Solved a task later, as a worker answers, unless called off while it waits.
			return new Promise((resolve, reject) => {
				let waiting = true;
				const solving = setTimeout(() => {
					waiting = false;
					resolve(answer(content, graph, lengths[one.apart] ?? 3000));
				}, 0);
				signal?.addEventListener("abort", () => {
					if (!waiting) return;
					clearTimeout(solving);
					one.calledOff = true;
					reject(signal.reason);
				});
			});
		});
		expect(drawing.atlas.nodes["a1"]?.width).toBe(2000);
		expect(asked).toEqual([...expected]);
	},
);

test.each(["active", "queued", "cancelling", "failed"] as const)(
	"a later join turn reuses an obsolete %s candidate according to its host outcome",
	async (mode) => {
		const content = joining(["one", "two", "three"], mode);
		// All apart, then two apart, then three alone read better in that order.
		const lengths: Record<string, number> = {
			"": 1000,
			"one,three,two": 800,
			"three,two": 600,
			three: 400,
		};
		const calls: string[] = [];
		const reached = Promise.withResolvers<void>();
		const held = Promise.withResolvers<string>();
		const failure = new Error("Active candidate failed after becoming needed again");
		let heldGraph: ElkNode | undefined;
		let heldSignal: AbortSignal | undefined;
		const rendering = drawnWith(content, (written, signal) => {
			const graph = JSON.parse(written) as ElkNode;
			const key = apartOf(graph);
			calls.push(key);
			if (key === "three,two") reached.resolve();
			if (key === "three" && heldGraph === undefined) {
				heldGraph = graph;
				heldSignal = signal;
				if (mode === "queued")
					signal?.addEventListener("abort", () => held.reject(signal.reason), { once: true });
				return held.promise;
			}
			return Promise.resolve(answer(content, graph, lengths[key] ?? 2000));
		});
		const outcome = rendering.catch((error: unknown) => error);
		await reached.promise;
		// Let the resolved two-apart candidate advance selection before
		// answering the original singleton. No worker or wall clock wait.
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(heldSignal?.aborted).toBe(true);
		expect(calls.filter((key) => key === "three")).toHaveLength(mode === "queued" ? 2 : 1);
		if (mode === "cancelling") held.reject(heldSignal!.reason);
		else if (mode === "failed") held.reject(failure);
		else if (mode === "active") held.resolve(answer(content, heldGraph!, lengths["three"]!));
		// The core carries the host's failure out by its words.
		if (mode === "failed") expect(await outcome).toHaveProperty("message", failure.message);
		else {
			expect((await rendering).atlas.nodes["three1"]?.width).toBe(400);
			if (mode === "cancelling") expect(calls.filter((key) => key === "three")).toHaveLength(2);
		}
	},
);
