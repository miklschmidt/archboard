// What the pulse tests draw: the parts, the exchanges and the pictures of them,
// and the readers of the markup that say where a pulse is.
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { VariantContent } from "@archboard/board/content";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { pointsOf } from "#tests/runtime/support/drawn-traffic.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** What a moving mark looks like in the markup, whichever grammar drew it. */
export const MOTION = /<animate(?:Motion|Transform)?\b|@keyframes|animation:/u;

/**
 * One variant, as its own contract reads it.
 * @param content The nodes, relationships and flows.
 * @returns The content.
 */
export function variant(content: Record<string, unknown>): VariantContent {
	return orderedFixture(content);
}

/** Two parts, wired every way that matters, and one exchange between them. */
export const SAMPLE = variant({
	nodes: [
		{ id: "api", name: "API", kind: "service", responsibility: "Takes requests" },
		{ id: "store", name: "Store", kind: "datastore" },
	],
	edges: [
		{ id: "hero", from: "api", to: "store", kind: "call", label: "reads", emphasis: "hero" },
		{ id: "plain", from: "store", to: "api", kind: "data", label: "rows", traffic: {} },
		{ id: "built", from: "api", to: "store", kind: "dependency", emphasis: "normal" },
		{ id: "quiet", from: "store", to: "api", kind: "http", emphasis: "muted", traffic: {} },
	],
	flows: [
		{
			id: "read",
			name: "One read",
			participants: ["api", "store"],
			steps: [
				{ id: "asks", from: "api", to: "store", label: "asks", kind: "sync" },
				{ id: "again", from: "api", to: "store", label: "retries", kind: "sync", repeat: 2 },
				{ id: "answers", from: "store", to: "api", label: "answers", kind: "return" },
			],
		},
	],
});

/** Two exchanges on one page: five turns between them, none of them shared. */
export const TWO_FLOWS = variant({
	nodes: [
		{ id: "api", name: "API", kind: "service" },
		{ id: "store", name: "Store", kind: "datastore" },
	],
	flows: [
		{
			id: "read",
			name: "One read",
			participants: ["api", "store"],
			steps: [
				{ id: "asks", from: "api", to: "store", label: "asks", kind: "sync" },
				{ id: "answers", from: "store", to: "api", label: "answers", kind: "return" },
			],
		},
		{
			id: "write",
			name: "One write",
			participants: ["api", "store"],
			steps: [
				{ id: "sends", from: "api", to: "store", label: "sends", kind: "sync" },
				{ id: "acks", from: "store", to: "api", label: "acks", kind: "return", repeat: 2 },
			],
		},
	],
});

/** Four parts in a row: each hands on to the next, and one line skips two of them. */
const CHAIN_NODES = [
	{ id: "a", name: "A", kind: "service" },
	{ id: "b", name: "B", kind: "service" },
	{ id: "c", name: "C", kind: "service" },
	{ id: "d", name: "D", kind: "service" },
];

/**
 * One picture of the sample.
 * @param grammar Which grammar to draw it in.
 * @returns The markup.
 */
export async function drawn(grammar: "architecture" | "sequence"): Promise<string> {
	return (
		await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: SAMPLE,
			grammar,
			theme: "light",
		})
	).svg;
}

/**
 * The picture of some relationships between the parts of a chain.
 * @param edges The relationships.
 * @returns The markup.
 */
export async function chain(edges: Record<string, unknown>[]): Promise<string> {
	const content = variant({ nodes: CHAIN_NODES, edges });
	return (
		await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			grammar: "architecture",
			theme: "light",
		})
	).svg;
}

/**
 * The picture of one labelled relationship between two stacked parts: a straight
 * run, long enough to carry a pulse, whichever engine draws it.
 * @param traffic The relationship's traffic.
 * @returns The markup.
 */
export async function solo(traffic: Record<string, unknown>): Promise<string> {
	const content = variant({
		nodes: SAMPLE.nodes,
		edges: [
			{ id: "e", from: "api", to: "store", kind: "call", label: "reads from the store", traffic },
		],
	});
	return (
		await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			grammar: "architecture",
			theme: "light",
		})
	).svg;
}

/**
 * How many pulses the whole picture draws.
 *
 * The groups, not the word: the stylesheet names the class too, in the rule
 * that hides them, and that rule is in every picture whether it moves or not.
 * @param svg The markup.
 * @returns How many pulses were drawn.
 */
export function pulsesIn(svg: string): number {
	return [...svg.matchAll(/<g class="ab-pulse"/gu)].length;
}

/**
 * The pulses one subject carries, in its own group or in its traffic layer.
 * @param svg The markup.
 * @param id The subject's id.
 * @returns How many pulses ride it.
 */
export function pulsesOn(svg: string, id: string): number {
	// A sequence step carries its marks; a relationship's traffic is a layer of its own that names it.
	return [`data-semantic-id="${id}"`, `data-traffic="${id}"`]
		.map((named) => (svg.split(named)[1] ?? "").split(/data-(?:semantic-id|traffic)=/u)[0]!)
		.reduce((sum, own) => sum + [...own.matchAll(/<g class="ab-pulse"/gu)].length, 0);
}

/**
 * How long a path of straight pieces is.
 * @param d The path data.
 * @returns Its length.
 */
export function lengthOf(d: string): number {
	const points = pointsOf(d);
	return points
		.slice(1)
		.reduce(
			(sum, point, index) =>
				sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
			0,
		);
}
