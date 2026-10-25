// A candidate cancelled while active still finishes normally. A later join
// turn must share that solve; a cancelled queued candidate must instead be
// recreated. Ordinary engine failures must keep reaching the required turn.
import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { installBunHost } from "#runtime/services/bun-host.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

test.each(["active", "queued", "cancelling", "failed"] as const)(
	"a later join turn reuses an obsolete %s candidate according to its host outcome",
	async (mode) => {
		installBunHost();
		const host = rendererHost();
		const sources = ["one", "two", "three"];
		const content = orderedFixture({
			nodes: [
				...sources.map((id) => ({ id, name: `${id} ${mode}`, kind: "service" })),
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
		const calls: string[] = [];
		const reached = Promise.withResolvers<void>();
		const held = Promise.withResolvers<ElkNode>();
		const failure = new Error("Active candidate failed after becoming needed again");
		let heldGraph: ElkNode | undefined;
		let heldSignal: AbortSignal | undefined;
		/**
		 * Geometry whose line lengths make all-apart, then two-apart, then
		 * three alone win in that order. Its card width identifies the winner.
		 * The choice reads the reading the core tells with a drawing: this one
		 * is what it tells of one straight line that long and nothing else.
		 * @param graph The candidate graph.
		 * @param key The apart blocks, sorted.
		 * @returns The host's solved graph.
		 */
		const answer = (graph: ElkNode, key: string): ElkNode => {
			const length = { "": 1000, "one,three,two": 800, "three,two": 600, three: 400 }[key] ?? 2000;
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
			return {
				...graph,
				layoutOptions: {
					...graph.layoutOptions,
					"archboard.blocks.placed": JSON.stringify(placed),
					"archboard.blocks.reading": JSON.stringify(reading),
				},
			};
		};
		installRendererHost({
			...host,
			solve: (graph, signal) => {
				const apart = JSON.parse(
					graph.layoutOptions?.["archboard.blocks.apart"] ?? "[]",
				) as string[];
				const key = apart.toSorted().join(",");
				calls.push(key);
				if (key === "three,two") reached.resolve();
				if (key === "three" && heldGraph === undefined) {
					heldGraph = graph;
					heldSignal = signal;
					if (mode === "queued")
						signal?.addEventListener("abort", () => held.reject(signal.reason), { once: true });
					return held.promise;
				}
				return Promise.resolve(answer(graph, key));
			},
		});
		try {
			const rendering = renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				layout: "blocks",
				theme: "light",
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
			else if (mode === "active") held.resolve(answer(heldGraph!, "three"));
			if (mode === "failed") expect(await outcome).toBe(failure);
			else {
				expect((await rendering).atlas.nodes["three1"]?.width).toBe(400);
				if (mode === "cancelling") expect(calls.filter((key) => key === "three")).toHaveLength(2);
			}
		} finally {
			installRendererHost(host);
		}
	},
);
