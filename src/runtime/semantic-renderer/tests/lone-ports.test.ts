// A line end and a label keep clear of what is not theirs. Every
// relationship channel at a card has one slot along the whole card, and a
// port alone on its face used to keep that slot: the last of five channels
// left its face 8.8 px from the corner while the middle was free, and its
// label hung past the card. A reserved label is an obstacle the router kept
// lines only its buffer from, so another line could pass 8 px from it, where
// a label on its own run keeps 12.
// A lone port moves only where the strip its end run sweeps is clear of
// other cards, of other lines running beside it and of other lines' reserved
// labels, only while it stands at its channel's slot, and only when its lines
// turn after their end run. Once moved it keeps its face in the last solve.
// What this catches: the Graphviz engine leaving a lone port in its
// card-wide slot beside a corner, moving one across a card, a label or
// beside another line, moving one a straight channel or another pass put
// there, trading a centred port for another face's seed, and routing a line
// past a reserved label closer than a label's clearance.

import { expect, test } from "bun:test";
import { LayoutEngineSchema } from "@/shared/semantic-board/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { LABEL_ROUTE_CLEARANCE } from "@/transformers/semantic-renderer/config";
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { AvoidLib } from "libavoid-js";
import { type AvoidEngine } from "@/transformers/semantic-renderer/engine";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { centredPins, relationshipChannel, routeGraph } from "@/runtime/semantic-renderer/layout";
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
import heldPort from "./held-port.json";
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

/** How far from its face's corners a port stands to read as meeting the face, not the corner. */
const FACE_INSET = 12;

test.each(LayoutEngineSchema.options)(
	"a port alone on a card face keeps clear of the corners (%s)",
	async (layout) => {
		const content = orderedFixture(archboard);
		const drawn = await renderArchitecture({ content, theme: "light", policy, layout });
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
				corners[0]! < FACE_INSET - 0.5,
		);
		expect(crowded).toEqual([]);
	},
);

test.each(LayoutEngineSchema.options)(
	"a label keeps a label's clearance from every other line (%s)",
	async (layout) => {
		const content = orderedFixture(archboard);
		const drawn = await renderArchitecture({ content, theme: "light", policy, layout });
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
	},
);

/** The pitch of neighbouring parallel lines. */
const LANE = 16;

/** Two runs nearer than this are one stroke, a trunk the lines share. */
const SHARED_STROKE = 2;

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

// Blocks still runs two of this board's lines a part-lane apart.
test("no line runs a part-lane beside another", async () => {
	const content = orderedFixture(readingABoard);
	const drawn = await renderArchitecture({ content, theme: "light", layout: "track" });
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
							Math.abs(run.at - against.at) > SHARED_STROKE &&
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

/**
 * Where a lone port 10 px from its card's corner stands after centring, with other things in the way.
 * @param others Other cards and relationships, and how the port's own line is drawn.
 * @param others.cards Other cards.
 * @param others.edges Other relationships.
 * @param others.at Where the port stands along its face, if not at its channel's slot.
 * @param others.straight Whether its line runs straight on from the port to its target.
 * @returns The port's position along its face.
 */
function centredPort(others: {
	readonly cards?: readonly ElkNode[];
	readonly edges?: readonly ElkExtendedEdge[];
	readonly at?: number;
	readonly straight?: true;
}): number {
	const source = { id: "source", x: 0, y: 0, width: 340, height: 88 };
	const target = { id: "target", x: 500, y: 300, width: 340, height: 88 };
	const x = (others.at ?? 10 / 340) * 340;
	const line: ElkExtendedEdge = {
		id: "line",
		sources: ["source"],
		targets: ["target"],
		layoutOptions: { "archboard.relationship.kind": "call" },
		sections: [
			{
				id: "s",
				startPoint: { x, y: 88 },
				bendPoints: others.straight
					? []
					: [
							{ x, y: 120 },
							{ x: 670, y: 120 },
						],
				endPoint: others.straight ? { x, y: 300 } : { x: 670, y: 300 },
			},
		],
	};
	const channel = relationshipChannel(line, "source");
	const slot = 10 / 340;
	const channels = new Map([
		["source", [channel, ...Array.from({ length: 16 }, (_, index) => `other${index}`)]],
		["target", [relationshipChannel(line, "target")]],
	]);
	const nodes = new Map([source, target, ...(others.cards ?? [])].map((node) => [node.id, node]));
	const used = new Map([
		["source", new Map([[channel, [{ face: "SOUTH" as const, position: others.at ?? slot }]]])],
	]);
	const moved = centredPins(nodes, channels, [line, ...(others.edges ?? [])], used);
	return (moved?.pins ?? used).get("source")!.get(channel)![0]!.position;
}

test("a lone port moves to its face's middle only across a strip clear of cards and labels", () => {
	expect(centredPort({})).toBe(0.5);
	const card = { id: "card", x: 100, y: 130, width: 40, height: 40 };
	expect(centredPort({ cards: [card] })).toBeLessThan(0.5);
	const labelled: ElkExtendedEdge = {
		id: "labelled",
		sources: ["card"],
		targets: ["target"],
		layoutOptions: { "archboard.relationship.kind": "call", "archboard.route-label": "true" },
		labels: [{ x: 80, y: 95, width: 80, height: 20 }],
	};
	expect(centredPort({ edges: [labelled] })).toBeLessThan(0.5);
});

test("a lone port stays where another line runs beside the strip, off its slot, or with a line running straight on", () => {
	const far = { id: "far", x: 100, y: 500, width: 40, height: 40 };
	const beside: ElkExtendedEdge = {
		id: "beside",
		sources: ["far"],
		targets: ["target"],
		layoutOptions: { "archboard.relationship.kind": "data" },
		sections: [
			{
				id: "b",
				startPoint: { x: 120, y: 500 },
				bendPoints: [
					{ x: 120, y: 100 },
					{ x: 600, y: 100 },
				],
				endPoint: { x: 600, y: 300 },
			},
		],
	};
	expect(centredPort({ cards: [far], edges: [beside] })).toBeLessThan(0.5);
	expect(centredPort({ at: 12 / 340 })).toBeLessThan(0.5);
	expect(centredPort({ straight: true })).toBeLessThan(0.5);
});

/**
 * The routes of the placed view above, with the router refusing from one solve on.
 * @param refused Which solve the router first refuses, counting from one; none when omitted.
 * @returns Each route's section, as text.
 */
async function routesRefusing(refused = Infinity): Promise<string> {
	await AvoidLib.load();
	const avoid = AvoidLib.getInstance() as AvoidEngine;
	let solves = 0;
	const Router = function (flag: number) {
		const router = new avoid.Router(flag);
		const solve = router.processTransaction.bind(router);
		router.processTransaction = () => {
			solves += 1;
			if (solves >= refused) throw new Error("NativeRouteUnavailable: refused");
			return solve();
		};
		return router;
	};
	const refusing = Object.assign(Object.create(avoid) as AvoidEngine, { Router });
	const routed = routeGraph(refusing, structuredClone(heldPort) as ElkNode);
	return JSON.stringify(routed.edges!.map(({ sections }) => sections));
}

test("a later solve the router refuses keeps the last complete routing", async () => {
	// The view is solved three times: routed, refined, then with its lone port centred.
	const [refined, first] = [await routesRefusing(3), await routesRefusing(2)];
	expect(refined).not.toBe(first);
	expect(await routesRefusing()).not.toBe(refined);
});
