// A line from a card up and off to the side dropped down the gutter beside its
// target, past the target's top corner, and turned into its side a few points
// below it: the top face's only pin was its channel's seed, far along the face,
// so the router took the side (Renderer layout's "measure every word", Codex
// session's "decode parameters and answer"). Offered the top face just inside
// the corner it passed, the line enters there with one bend fewer, far
// enough in to read as meeting the face rather than the corner; a card that
// wears a standing pin keeps it further off (standing-pin.test.ts). A
// finished drawing is routed so only where it has such a hook (Renderer
// layout's "Responsibilities"). A settlement that saves crossings may not buy
// them with hooks either: evened pins hooked both lines into Former names'
// sides past its top, where plain pins enter the top, and ran two unrelated
// lines half a lane apart (Board persistence's "Durable write boundary").
// Plain and evened settlements are each finished before one is chosen: the
// plain one chosen before finishing kept five hooks in Renderer layout's
// proposal where the evened one, finished, keeps none.

import { expect, test } from "bun:test";
import type { ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { DEFAULT_SEMANTIC_POLICY, SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import type { StatedStandings } from "@/transformers/semantic-renderer/index";
import { requestOptions, routeGraph } from "@/runtime/semantic-renderer/layout";
import {
	cornersOf,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import type { AvoidEngine } from "@/transformers/semantic-renderer/engine";
import formerNames from "./former-names.json";
import rendererLayout from "./renderer-layout-proposal.json";

/** The dogfood vault's vocabulary as far as the fixtures use it. */
const policy = SemanticPolicySchema.parse({
	...DEFAULT_SEMANTIC_POLICY,
	groups: {
		writes: { name: "Board writes", color: "orange" },
		grading: { name: "Grading", color: "purple" },
	},
});

/**
 * How far inside a card's corner a line meets a face and still reads as
 * meeting the face: its nudging distance and half the widest arrowhead.
 */
const FACE_INSET = 20;

/** The longest side stub a hook has: a card's own corridor and a lane. */
const HOOK_STUB = 36;

/** A card's box on the page. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Whether a drawn line end hooks into its card's side: a short side stub
 * turned from a run that comes from beyond the card's top or bottom.
 * @param box The card.
 * @param route The drawn line, ordered away from the card.
 * @returns True for a hook.
 */
function hooksInto(box: Box, route: readonly DrawnPoint[]): boolean {
	const [tip, bend, after] = [route[0]!, route[1]!, route[2]];
	if (after === undefined || Math.abs(tip.y - bend.y) >= 0.01) return false;
	if (Math.abs(tip.x - bend.x) > HOOK_STUB) return false;
	return after.y < box.y || after.y > box.y + box.height;
}

test("a line passing its target's top corner enters the top instead of hooking into the side", async () => {
	await AvoidLib.load();
	const target = { id: "target", x: 20, y: 232, width: 340, height: 88 };
	// Offered on every card, or on the hooked card alone.
	for (const request of [{ cornerPins: true }, { cornerCards: ["target"] }]) {
		const graph: ElkNode = {
			id: "root",
			width: 1200,
			height: 400,
			layoutOptions: requestOptions(request),
			children: [
				{ id: "source", x: 700, y: 20, width: 340, height: 88 },
				target,
				{ id: "neighbour", x: 402, y: 232, width: 340, height: 88 },
			],
			edges: [
				{
					id: "call",
					sources: ["source"],
					targets: ["target"],
					layoutOptions: { "archboard.relationship.kind": "call" },
				},
			],
		};
		const section = routeGraph(AvoidLib.getInstance() as AvoidEngine, graph).edges![0]!
			.sections![0]!;
		expect(section.endPoint.y).toBeCloseTo(target.y, 1);
		expect(section.bendPoints).toHaveLength(1);
		const fromCorner = Math.min(
			section.endPoint.x - target.x,
			target.x + target.width - section.endPoint.x,
		);
		expect(fromCorner).toBeGreaterThanOrEqual(FACE_INSET);
	}
});

/**
 * The lines of a finished drawing that hook into a card's side.
 * @param fixture The board, and how its subjects stand in the proposal it draws.
 * @returns The ids of the hooked lines, once for each hooked end.
 */
async function hookedLines(
	fixture: Parameters<typeof orderedFixture>[0] & { readonly standing: object },
): Promise<string[]> {
	const { standing, ...board } = fixture;
	const content = orderedFixture(board);
	const drawing = await renderArchitecture({
		content,
		standing: standing as StatedStandings,
		policy,
		theme: "light",
		layout: "graphviz",
	});
	const cards = drawing.atlas.nodes;
	const routes = routePoints(drawing.svg);
	const hooks = content.edges.flatMap(({ id, from, to }) => {
		const points = cornersOf(routes.get(id)!);
		return [hooksInto(cards[from]!, points), hooksInto(cards[to]!, points.toReversed())]
			.filter(Boolean)
			.map(() => id);
	});
	return hooks;
}

test("a finished drawing has no line hooking into a card's side past its corner", async () => {
	expect(await hookedLines(rendererLayout)).toEqual([]);
});

test("lines down into a card enter its top rather than hook past it into its sides", async () => {
	const { standing, ...board } = formerNames;
	const former = board.nodes.find(({ name }) => name === "Former names")!.id;
	const drawing = await renderArchitecture({
		content: orderedFixture(board),
		standing: standing as StatedStandings,
		policy,
		theme: "light",
		layout: "graphviz",
	});
	const routes = routePoints(drawing.svg);
	const down = new Set(["a former name opens the board", "the board the name answers to"]);
	const entries = board.edges
		.filter(({ to, label }) => to === former && down.has(label))
		.map(({ id }) => {
			const [last, before] = cornersOf(routes.get(id)!).toReversed();
			return Math.abs(last!.x - before!.x) < 0.01 ? "top" : "side";
		});
	expect(entries).toEqual(["top", "top"]);
});
