import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import { overdrawnRun } from "#tests/runtime/support/drawn-ink.ts";
import { routeLabels, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import publicApi from "../../../../../../docs/design/wide-board-layout-fixtures/public-api-independent.content.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** The gateway lanes that reproduce the live comparison's shared channels. */
const CHANNEL_EDGE_IDS = [
	"NHlWy1Yw",
	"fXPVXdiF",
	"2L2brMps",
	"SlxZ7y45",
	"kJaF9nLs",
	"HOKDAQTU",
] as const;

/**
 * The gateway lanes, alike in everything a test does not vary: the live
 * fixture draws some hero, and routes that differ in emphasis do not share.
 */
const channelContent = (() => {
	const complete = orderedFixture(publicApi);
	const edges = complete.edges.filter((edge) =>
		CHANNEL_EDGE_IDS.includes(edge.id as (typeof CHANNEL_EDGE_IDS)[number]),
	);
	for (const edge of edges) edge.emphasis = "normal";
	const ids = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
	for (const node of complete.nodes) {
		if (node.parent !== undefined && ids.has(node.id)) ids.add(node.parent);
	}
	return orderedFixture({
		nodes: complete.nodes.filter((node) => ids.has(node.id)),
		edges,
	});
})();

const OUTGOING_CHANNELS = ["kJaF9nLs", "HOKDAQTU"] as const;

type Edge = VariantContent["edges"][number];

/**
 * The channels with the first outgoing route changed.
 * @param change What makes it differ from the second.
 * @returns The content.
 */
function outgoingDiffering(change: (edge: Edge) => void): VariantContent {
	const content = structuredClone(channelContent);
	change(content.edges.find((edge) => edge.id === OUTGOING_CHANNELS[0])!);
	return content;
}

/** The engine that draws the two outgoing routes on one shared trunk here. */
const SHARING = "track";

test("routes leaving one gateway in one direction may share a run", async () => {
	// The shared trunk this engine draws here is what the overdrawn-run
	// measure below must see, so a zero from it means no run is shared.
	const plain = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: channelContent,
		theme: "dark",
		layout: SHARING,
	});
	expect(overdrawnRun(plain, OUTGOING_CHANNELS)).toBeGreaterThan(0);
});

test.each(LayoutEngineSchema.options)(
	"opposing same-kind channels do not share an overdrawn run (%s)",
	async (layout) => {
		const plain = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: channelContent,
			theme: "dark",
			layout,
		});
		// Each pair below uses the same HTTP kind but arrives at the gateway where
		// the other route leaves it. Their local direction is therefore different.
		for (const pair of [
			["NHlWy1Yw", "kJaF9nLs"],
			["NHlWy1Yw", "HOKDAQTU"],
			["fXPVXdiF", "2L2brMps"],
		] as const) {
			expect(overdrawnRun(plain, pair), pair.join(" / ")).toBe(0);
		}
		expect(routePoints(plain.svg).size).toBe(channelContent.edges.length);
		expect(routeLabels(plain.svg).size).toBe(channelContent.edges.length);
	},
);

for (const [left, right] of [
	["added", "changed"],
	["added", "removed"],
	["added", "unchanged"],
	["changed", "removed"],
	["changed", "unchanged"],
	["removed", "unchanged"],
] as const) {
	test(`different comparison standings use distinct same-kind channels (${left}/${right})`, async () => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: channelContent,
			theme: "dark",
			layout: SHARING,
			standing: { [OUTGOING_CHANNELS[0]]: left, [OUTGOING_CHANNELS[1]]: right },
		});
		expect(overdrawnRun(drawing, OUTGOING_CHANNELS), `${left}/${right}`).toBe(0);
		expect(routePoints(drawing.svg).size).toBe(channelContent.edges.length);
		expect(routeLabels(drawing.svg).size).toBe(channelContent.edges.length);
	});
}

/** What makes the first outgoing route differ from the second in one thing but its kind. */
const DIFFERENCES: Record<string, (edge: Edge) => void> = {
	emphasis: (edge) => {
		edge.emphasis = "hero";
	},
	traffic: (edge) => {
		delete edge.traffic;
	},
};

// The track engine keeps such routes apart; the blocks engine still shares a lane across them.
for (const [name, change] of Object.entries(DIFFERENCES)) {
	test(`different ${name} uses distinct same-kind channels`, async () => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: outgoingDiffering(change),
			theme: "dark",
			layout: SHARING,
		});
		expect(overdrawnRun(drawing, OUTGOING_CHANNELS)).toBe(0);
		expect(routePoints(drawing.svg).size).toBe(channelContent.edges.length);
		expect(routeLabels(drawing.svg).size).toBe(channelContent.edges.length);
	});
}
