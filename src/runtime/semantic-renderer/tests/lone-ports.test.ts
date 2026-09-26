// A line end and a label keep clear of what is not theirs. Every
// relationship channel at a card has one slot along the whole card, and a
// port alone on its face used to keep that slot: the last of five channels
// left its face 8.8 px from the corner while the middle was free, and its
// label hung past the card. A reserved label is an obstacle the router kept
// lines only its buffer from, so another line could pass 8 px from it, where
// a label on its own run keeps 12.
// What this catches: the Graphviz engine leaving a lone port in its
// card-wide slot beside a corner, and routing a line past a reserved label
// closer than a label's clearance.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import {
	LABEL_ROUTE_CLEARANCE,
	ROUTE_NUDGE_DISTANCE,
	ROUTE_OPEN_CORRIDOR,
} from "@/transformers/semantic-renderer/config";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	cornersOf,
	corridorPoints,
	distanceToRoute,
	routeLabels,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import archboard from "./archboard.json";
import readingABoard from "./reading-a-board.json";

/** The vocabulary of the fixture, in the dogfood vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine" },
		datastore: { name: "Data store", icon: "RiDatabase2Line" },
		external: { name: "External", icon: "RiExternalLinkLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
	},
	groups: { agent: { name: "Agent", color: "fuchsia" } },
});

/** A card's box on the page. */
interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * The face a line end lies on, and how far it stands from that face's nearer corner.
 * @param box The card.
 * @param end The end.
 * @returns The face's name and the distance.
 */
function portOf(box: Box, end: DrawnPoint): readonly [string, number] {
	const sides = [
		["WEST", Math.abs(end.x - box.x)],
		["EAST", Math.abs(end.x - box.x - box.width)],
		["NORTH", Math.abs(end.y - box.y)],
		["SOUTH", Math.abs(end.y - box.y - box.height)],
	] as const;
	const [face] = sides.reduce((near, side) => (side[1] < near[1] ? side : near));
	const upright = face === "WEST" || face === "EAST";
	const along = upright ? end.y - box.y : end.x - box.x;
	return [face, Math.min(along, (upright ? box.height : box.width) - along)];
}

test("a port alone on a card face keeps its nudging distance from the corners", async () => {
	const content = orderedFixture(archboard);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "graphviz" });
	const routes = routePoints(drawn.svg);
	const ports = new Map<string, number[]>();
	for (const edge of content.edges) {
		const points = routes.get(edge.id)!;
		for (const [card, end] of [
			[edge.from, points[0]!],
			[edge.to, points.at(-1)!],
		] as const) {
			const [face, corner] = portOf(drawn.atlas.nodes[card]!, end);
			ports.set(`${card}:${face}`, [...(ports.get(`${card}:${face}`) ?? []), corner]);
		}
	}
	const crowded = [...ports].filter(
		([, corners]) =>
			corners.every((corner) => Math.abs(corner - corners[0]!) < 1) &&
			corners[0]! < ROUTE_NUDGE_DISTANCE - 0.5,
	);
	expect(crowded).toEqual([]);
});

test("a reserved label keeps a label's clearance from every other line", async () => {
	const content = orderedFixture(archboard);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "graphviz" });
	const routes = corridorPoints(drawn.svg);
	const crowded = [...routeLabels(drawn.svg)].flatMap(([label, box]) =>
		[...routes]
			.filter(
				([line, points]) =>
					line !== label && distanceToRoute(box, points) < LABEL_ROUTE_CLEARANCE - 0.5,
			)
			.map(([line]) => `${label}<-${line}`),
	);
	expect(crowded).toEqual([]);
});

/** The pitch of neighbouring parallel lines. */
const LANE = 16;

/**
 * The straight runs of a drawn line, as the axis each keeps and the stretch it spans.
 * @param points The drawn points.
 * @returns Its runs, a vertical run keeping x and a level one y.
 */
function runsOf(points: readonly DrawnPoint[]) {
	return points.slice(1).flatMap((point, index) => {
		const previous = points[index]!;
		const vertical = Math.abs(point.x - previous.x) < 0.01;
		if (!vertical && Math.abs(point.y - previous.y) >= 0.01) return [];
		const [one, other] = vertical ? [previous.y, point.y] : [previous.x, point.x];
		return [
			{
				vertical,
				at: vertical ? point.x : point.y,
				from: Math.min(one, other),
				to: Math.max(one, other),
			},
		];
	});
}

test("a port away from its face's corners stays put, so no line runs a part-lane beside another", async () => {
	const content = orderedFixture(readingABoard);
	const drawn = await renderArchitecture({ content, theme: "light", layout: "graphviz" });
	const lines = [...routePoints(drawn.svg)].map(
		([id, points]) => [id, runsOf(cornersOf(points))] as const,
	);
	const doubled = lines.flatMap(([id, runs], index) =>
		lines
			.slice(index + 1)
			.flatMap(([other, theirs]) =>
				runs.some((run) =>
					theirs.some(
						(against) =>
							run.vertical === against.vertical &&
							Math.abs(run.at - against.at) > ROUTE_OPEN_CORRIDOR &&
							Math.abs(run.at - against.at) < LANE - 0.5 &&
							Math.min(run.to, against.to) - Math.max(run.from, against.from) >= LANE,
					),
				)
					? [`${id}|${other}`]
					: [],
			),
	);
	expect(doubled).toEqual([]);
});
