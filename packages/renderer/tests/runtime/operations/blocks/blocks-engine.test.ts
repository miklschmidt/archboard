// The blocks engine lays every container and group region out as a block of its own and
// joins the lines between blocks through ports on their edges. What this catches: room a
// block keeps for trunks that do not use it, lines between blocks that turn back on
// themselves or run along a border, and lines that join on the way to a card and part again.
import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import {
	bodyShift,
	corridorPoints,
	routeCrosses,
	routesCross,
	routeEnds,
	routePoints,
	sharedStretches,
	turnsOf,
} from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import agentWorkbench from "#tests/runtime/support/fixtures/agent-workbench.json";
import archboardServer from "#tests/runtime/support/fixtures/archboard-server.json";
import browserApplication from "#tests/runtime/support/fixtures/browser-application.json";
import oneBrowserTwoUses from "#tests/runtime/support/fixtures/one-browser-two-uses.json";
import oneCommand from "#tests/runtime/support/fixtures/one-command.json";
import durableWriteBoundary from "#tests/runtime/support/fixtures/durable-write-boundary.json";
import owningTheChild from "#tests/runtime/support/fixtures/owning-the-child.json";
import recordingAWalkthrough from "#tests/runtime/support/fixtures/recording-a-walkthrough.json";
import requestPath from "#tests/runtime/support/fixtures/request-path.json";
import theTwoThreads from "#tests/runtime/support/fixtures/the-two-threads.json";
import tightWallPort from "#tests/runtime/support/fixtures/tight-wall-port.json";
import twoChains from "#tests/runtime/support/fixtures/two-chains.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

/** The room a container keeps round its members: archboard_layout::constants::CONTAINER_INSET. */
const CONTAINER_INSET = 20;

/** The vocabulary of the fixtures, in the dogfood vault's order; some are reduced from its boards. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		service: { name: "Service", icon: "RiServerLine" },
		route: { name: "Route", icon: "RiRouteLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
		function: { name: "Function", icon: "RiCodeLine" },
		system: { name: "System", icon: "RiApps2Line" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		state: { name: "Server state", color: "teal" },
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
		agent: { name: "Agent", color: "fuchsia" },
	},
});

/**
 * A group region's band, read from the drawn document.
 * @param svg The document.
 * @param group The group.
 * @returns Its box.
 */
function regionBox(
	svg: string,
	group: string,
): { x: number; y: number; width: number; height: number } {
	const markup = new RegExp(
		`<g data-semantic-kind="group-region" data-group="${group}"[^>]*>([\\s\\S]*?)</g>`,
		"u",
	).exec(svg)![1]!;
	const [x, y, width, height] = ["x", "y", "width", "height"].map((name) =>
		Number(new RegExp(`<rect[^>]* ${name}="([^"]+)"`, "u").exec(markup)![1]),
	);
	const shift = bodyShift(svg);
	return { x: x! + shift.x, y: y! + shift.y, width: width!, height: height! };
}

test("a container of blocks keeps as much room under its title as a container of cards", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "grouped", name: "Board server", kind: "service" },
			{ id: "store", name: "Board store", kind: "module", parent: "grouped", groups: ["state"] },
			{ id: "lease", name: "Board lease", kind: "module", parent: "grouped", groups: ["state"] },
			{ id: "plain", name: "Board worker", kind: "service" },
			{ id: "queue", name: "Work queue", kind: "module", parent: "plain" },
			{ id: "runner", name: "Work runner", kind: "module", parent: "plain" },
		],
		edges: [
			{ id: "e1", from: "store", to: "lease", kind: "call" },
			{ id: "e2", from: "queue", to: "runner", kind: "call" },
		],
	});
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { nodes } = drawn.atlas;
	const packed = regionBox(drawn.svg, "state").y - nodes["grouped"]!.y;
	const carded = nodes["queue"]!.y - nodes["plain"]!.y;
	expect(carded).toBe(packed);
});

test("a container a line leaves by its bottom keeps its inset under its lowest card", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "child", name: "Codex child", kind: "service" },
			{ id: "wire", name: "Codex transport", kind: "module", parent: "child" },
			{ id: "server", name: "Archboard server", kind: "service" },
		],
		edges: [{ id: "e1", from: "wire", to: "server", kind: "call" }],
	});
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { child, wire } = drawn.atlas.nodes;
	expect(child!.y + child!.height - (wire!.y + wire!.height)).toBe(wire!.x - child!.x);
});

test("a container's cards stand under its title, not beside it", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "cli", name: "Agent CLI", kind: "module" },
			{
				id: "pool",
				name: "Platform.Common",
				kind: "service",
				responsibility: "Shared helpers every service links against, kept in one library",
			},
			{ id: "pipe", name: "Table query pipeline", kind: "module", parent: "pool" },
		],
		edges: [{ id: "e1", from: "cli", to: "pipe", kind: "call", label: "filter, sort, paginate" }],
	});
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { nodes } = drawn.atlas;
	expect(nodes["pipe"]!.x - nodes["pool"]!.x).toBeLessThanOrEqual(CONTAINER_INSET + 1);
});

test("a group region holds the lines it draws beside its cards", async () => {
	const content = orderedFixture(agentWorkbench);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const band = regionBox(drawn.svg, "workhorse");
	// The Data line from Thread link runs up the region's right side to leave it.
	const inside = routePoints(drawn.svg)
		.get("SRifquBt")!
		.filter(({ y }) => y > band.y && y < band.y + band.height);
	expect(inside.length).toBeGreaterThan(0);
	for (const { x } of inside) expect(x).toBeLessThan(band.x + band.width);
});

test("blocks are packed the way their trunks run, not only the way the page fits", async () => {
	const content = orderedFixture(owningTheChild);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { nodes } = drawn.atlas;
	// Codex process spawns Codex app-server: packed beside the container, the
	// line would climb back over it; packed below, it drops straight.
	const workbench = nodes["7TAwfrZF"]!;
	expect(nodes["giL6EI28"]!.y).toBeGreaterThan(workbench.y + workbench.height);
});

/**
 * Whether a coordinate lies on either of two edges, within some distance.
 * @param at The coordinate.
 * @param edges The two edges.
 * @param within How near counts as on one.
 * @returns True when it does.
 */
function on(at: number, edges: readonly [number, number], within: number): boolean {
	return edges.some((edge) => Math.abs(at - edge) < within);
}

/**
 * Every route with a run longer than a lane that lies on one of a box's
 * edges, within a point or some other distance.
 * @param routes Every route's points.
 * @param box The box.
 * @param within How near counts as on an edge.
 * @returns The routes' ids.
 */
function alongWalls(
	routes: ReadonlyMap<string, readonly { x: number; y: number }[]>,
	box: { x: number; y: number; width: number; height: number },
	within = 1,
): string[] {
	return [...routes].flatMap(([id, points]) =>
		points.slice(1).some((point, index) => {
			const last = points[index]!;
			if (point.x === last.x && Math.abs(point.y - last.y) > 16)
				return on(point.x, [box.x, box.x + box.width], within);
			if (point.y === last.y && Math.abs(point.x - last.x) > 16)
				return on(point.y, [box.y, box.y + box.height], within);
			return false;
		})
			? [id]
			: [],
	);
}

/**
 * Every pair of different routes with runs side by side, closer than a
 * lane but not on one trunk: 3.5 to 12 points apart for 20 points or more.
 * @param routes Every route's points.
 * @returns Each pair's ids.
 */
function squeezed(routes: ReadonlyMap<string, readonly { x: number; y: number }[]>): string[] {
	const runs = [...routes].flatMap(([id, points]) =>
		points.slice(1).flatMap((point, index) => {
			const last = points[index]!;
			if (point.x === last.x && Math.abs(point.y - last.y) >= 20)
				return [
					{
						id,
						upright: true,
						at: point.x,
						low: Math.min(point.y, last.y),
						high: Math.max(point.y, last.y),
					},
				];
			if (point.y === last.y && Math.abs(point.x - last.x) >= 20)
				return [
					{
						id,
						upright: false,
						at: point.y,
						low: Math.min(point.x, last.x),
						high: Math.max(point.x, last.x),
					},
				];
			return [];
		}),
	);
	return runs.flatMap((one, index) =>
		runs
			.slice(index + 1)
			.filter(
				(other) =>
					other.id !== one.id &&
					other.upright === one.upright &&
					Math.abs(other.at - one.at) > 3.5 &&
					Math.abs(other.at - one.at) < 12 &&
					Math.min(one.high, other.high) - Math.max(one.low, other.low) >= 20,
			)
			.map((other) => `${one.id}/${other.id}`),
	);
}

test("trunks between packed blocks keep a lane apart however many share a gap", async () => {
	const content = orderedFixture(agentWorkbench);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(squeezed(corridorPoints(drawn.svg))).toEqual([]);
});

/**
 * How far a drawn route steps between each of its straight runs and the
 * next one running the same way: sideways for upright runs, up or down for
 * level ones.
 * @param points The route's points, control points included.
 * @returns The steps, in order.
 */
function steps(points: readonly { x: number; y: number }[]): number[] {
	const [uprights, levels] = [true, false].map((upright) =>
		points.slice(1).flatMap((point, index) => {
			const last = points[index]!;
			const along = upright ? point.x === last.x : point.y === last.y;
			const moves = upright ? point.y !== last.y : point.x !== last.x;
			return along && moves ? [upright ? point.x : point.y] : [];
		}),
	);
	return [uprights!, levels!].flatMap((runs) =>
		runs.slice(1).map((at, index) => Math.abs(at - runs[index]!)),
	);
}

// Reduced from a dogfood view: a trunk round the leftmost block of a container
// ran four points inside the container's left wall, as it keeps from the right.
test("a trunk round a container's leftmost block keeps the container's inset from its wall", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const inset = alongWalls(routePoints(drawn.svg), drawn.atlas.nodes["yAFyqal3"]!, CONTAINER_INSET);
	expect(inset).toEqual([]);
});

// Taken from a board of this repository: parting two lines that read as one
// moved only the lanes of one, and the line then ran round the far side of
// the block, down the container's wall at its inset, where it read as the
// container's outline.
test("a line parted from another keeps off its container's wall", async () => {
	const content = orderedFixture(recordingAWalkthrough);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const frame = drawn.atlas.nodes["yAFyqal3"]!;
	expect(alongWalls(routePoints(drawn.svg), frame, CONTAINER_INSET + 4)).toEqual([]);
});

test("a trunk between blocks side by side runs straight from wall to wall", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const routes = corridorPoints(drawn.svg);
	// Lines from Application composition and Voice session into the Agent region.
	for (const id of ["WchncnH1", "md5cpNZV", "rcSUaP1b"]) {
		const notches = steps(routes.get(id)!).filter((step) => step > 0.5 && step < 16);
		expect(notches, id).toEqual([]);
	}
});

test("two chains leaving a block through its bottom start on one row", async () => {
	const content = orderedFixture(twoChains);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { nodes } = drawn.atlas;
	// The chain into the Platform is a card shorter; it stays level with the
	// other rather than hanging from the block's bottom between its rows.
	expect(nodes["preview"]!.y).toBe(nodes["dns"]!.y);
	expect(nodes["platlb"]!.y).toBe(nodes["legacy"]!.y);
});

test("a trunk into a port too close to a block for a pin still runs round the block", async () => {
	const content = orderedFixture(tightWallPort);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	// The line from the outside card enters the outer container by its wall,
	// a few points from the nested container, and runs on to a card beside it.
	const route = routePoints(drawn.svg).get("f3lzoqzb")!;
	expect(routeCrosses(route, drawn.atlas.nodes["H69iTtH7"]!)).toBeFalse();
});

test("trunks reach a container's own ports from inside it, not along its border", async () => {
	const content = orderedFixture(agentWorkbench);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(alongWalls(routePoints(drawn.svg), drawn.atlas.nodes["7TAwfrZF"]!)).toEqual([]);
});

/**
 * A drawn route as its straight runs, each upright or level with its signed
 * length; the short slants of rounded corners are left out.
 * @param points The route's points, control points included.
 * @returns The runs, a run continuing the one before it merged into it.
 */
function runsOf(
	points: readonly { x: number; y: number }[],
): { upright: boolean; length: number }[] {
	const runs: { upright: boolean; length: number }[] = [];
	for (const [index, point] of points.slice(1).entries()) {
		const [dx, dy] = [point.x - points[index]!.x, point.y - points[index]!.y];
		if (Math.abs(dx) > 0.5 && Math.abs(dy) > 0.5) continue;
		const run = { upright: Math.abs(dx) <= 0.5, length: Math.abs(dx) <= 0.5 ? dy : dx };
		const last = runs.at(-1);
		if (last?.upright === run.upright && Math.sign(last.length) === Math.sign(run.length))
			last.length += run.length;
		else runs.push(run);
	}
	return runs;
}

/**
 * Whether a route runs one way, steps across, and runs back the other way
 * beside itself: two opposite runs of at least 30 points joined by a step of
 * at most 100.
 * @param points The route's points, control points included.
 * @returns True when it turns back.
 */
function turnsBack(points: readonly { x: number; y: number }[]): boolean {
	const runs = runsOf(points);
	return runs.slice(2).some((last, index) => {
		const [first, step] = [runs[index]!, runs[index + 1]!];
		return (
			first.upright === last.upright &&
			step.upright !== first.upright &&
			Math.sign(first.length) === -Math.sign(last.length) &&
			Math.min(Math.abs(first.length), Math.abs(last.length)) >= 30 &&
			Math.abs(step.length) <= 100
		);
	});
}

test("a trunk between blocks meets ports placed where both its ends are known", async () => {
	const content = orderedFixture(durableWriteBoundary);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const turning = [...corridorPoints(drawn.svg)].filter(([, points]) => turnsBack(points));
	expect(turning.map(([id]) => id)).toEqual([]);
});

test("lines from different cards leave a region by their own ports, not along its wall", async () => {
	const content = orderedFixture(oneBrowserTwoUses);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(alongWalls(routePoints(drawn.svg), regionBox(drawn.svg, "drawing"))).toEqual([]);
});

// Taken from a dogfood view: two RPC lines from cards in the container reach
// Codex session in its region. Joined at the region's port, each parted again
// to its label beside the card; with its label before the join instead, the
// joined line left the container along its bottom border. Ports of their own
// keep the two lines apart all the way, which here reads better.
test("lines that join on the way to a card stay joined, without running along a border", async () => {
	const content = orderedFixture(oneCommand);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [routes, ends] = [corridorPoints(drawn.svg), routeEnds(drawn.svg)];
	const [queue, typed] = [routes.get("b9HU99hH")!, routes.get("Qh7VZ9MQ")!];
	const [one, other] = [ends.get("b9HU99hH")!, ends.get("Qh7VZ9MQ")!];
	const together = Math.hypot(one.x - other.x, one.y - other.y) < 1;
	expect(together || sharedStretches(queue, typed).length === 0).toBeTrue();
	expect(alongWalls(routePoints(drawn.svg), drawn.atlas.nodes["7TAwfrZF"]!)).toEqual([]);
});

// Taken from a board of this repository: in its channels a line wanted a
// track above most of the lines it shares the channel with and was given one
// above lines it then crossed, where another order crosses fewer: 'agent
// bar, conversation, Talk' crossed 'the listing, read again on pane news'.
// And with its block's ports settled where the drawing read better in the
// order of ADR 0039, rather than where it scores better, 'the pane socket:
// registration and news' ran round Voice to a wall of Browser client and
// crossed 'one per socket generation' and 'the step to show'.
test("the lines of one channel take the track order that crosses least, its ports settled on their score", async () => {
	const content = orderedFixture(browserApplication);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "blocks", policy });
	const routes = corridorPoints(drawing.svg);
	expect(routesCross(routes.get("WchncnH1")!, routes.get("ep2NF6Z5")!)).toBe(false);
	for (const id of ["rcSUaP1b", "Gxh1Pbx3"])
		expect(routesCross(routes.get("PuILGsjg")!, routes.get(id)!), id).toBe(false);
});

// Taken from a board of this repository: with its groups packed as blocks of
// their own it crossed fewer lines, but 'one batch under the board's lease'
// turned four times round the blocks and crossed five lines, three of them by
// a corner. A board's groups stay inline where packing reads worse somewhere.
test("a board's groups stay inline where packing them reads worse somewhere", async () => {
	const content = orderedFixture(archboardServer);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const routes = [...corridorPoints(drawing.svg)];
	const batch = routes.find(([id]) => id === "iG4T44Pd")![1];
	expect(turnsOf(batch)).toBe(0);
	expect(routes.filter(([id, points]) => id !== "iG4T44Pd" && routesCross(batch, points))).toEqual(
		[],
	);
});

// Taken from the IIS migration board: a line into a container itself ends on a
// port no line inside the container runs through, which stood wherever the
// container's block put it, and settling the trunk pulled the line off the
// middle of the card it leaves toward that meaningless place.
test("a line into a container itself leaves its card on the card's own column", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "lb", name: "Legacy load balancer", kind: "service" },
			{ id: "pool", name: "Windows VM pool", kind: "system" },
			...["vm1", "vm2", "vm3", "vm4"].map((id) => ({
				id,
				name: `IIS ${id}`,
				kind: "service",
				parent: "pool",
				groups: ["state"],
			})),
		],
		edges: [{ id: "e1", from: "lb", to: "pool", kind: "call", label: "L4 forwarding" }],
	});
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const card = drawn.atlas.nodes["lb"]!;
	const route = routePoints(drawn.svg).get("e1")!;
	for (const { x } of route) expect(x).toBeCloseTo(card.x + card.width / 2, 0);
});

// Reduced from a board of a work vault, names replaced: a line from a card
// beside a container into a card standing high in it ran round the
// container's inner block and entered its card from below, arrow up, since
// the relationship back out of the container made it run upward, and only
// blocks standing side by side took ports on their facing walls.
test("a line into a container enters the card from the side its source stands on", async () => {
	const content = orderedFixture(requestPath);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [card, source] = [drawn.atlas.nodes["42C5lYne"]!, drawn.atlas.nodes["KpJL9Y0f"]!];
	const end = routeEnds(drawn.svg).get("f3lzoqzb")!;
	expect(end.y < card.y + card.height / 2).toBe(source.y < card.y);
});

// Taken from a board of this repository: packed into a column, the region a
// line comes from stands below the one it enters, though Graphviz ranked the
// line downward, and the line ran round the page to enter its card from above.
test("a line into a block that stands above its source's block enters from below", async () => {
	const content = orderedFixture(theTwoThreads);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const card = drawn.atlas.nodes["tlC2W839"]!;
	expect(routeEnds(drawn.svg).get("mhknqBOz")!.y).toBeGreaterThan(card.y + card.height / 2);
});

// Reduced from the same board: a container's own port on its wall stood
// level with the middle of the block inside it, not with that block's port
// on the same wall, so the line out stepped between the two.
test("a line out of nested containers by their walls runs level between them", async () => {
	const content = orderedFixture(requestPath);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const route = corridorPoints(drawn.svg).get("FOrXU78u")!;
	const levels = new Set(
		route.slice(1).flatMap((point, index) => (point.y === route[index]!.y ? [point.y] : [])),
	);
	expect(levels.size).toBeLessThanOrEqual(2);
});
