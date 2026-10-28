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
	routeEnds,
	routePoints,
	sharedStretches,
} from "#tests/runtime/support/drawn-routes.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { headerCards, endsOffCards } from "#tests/runtime/support/drawn-parents.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import agentWorkbench from "#tests/runtime/support/fixtures/agent-workbench.json";
import oneBrowserTwoUses from "#tests/runtime/support/fixtures/one-browser-two-uses.json";
import oneCommand from "#tests/runtime/support/fixtures/one-command.json";
import durableWriteBoundary from "#tests/runtime/support/fixtures/durable-write-boundary.json";
import owningTheChild from "#tests/runtime/support/fixtures/owning-the-child.json";
import recordingAWalkthrough from "#tests/runtime/support/fixtures/recording-a-walkthrough.json";
import requestPath from "#tests/runtime/support/fixtures/request-path.json";
import theTwoThreads from "#tests/runtime/support/fixtures/the-two-threads.json";
import tightWallPort from "#tests/runtime/support/fixtures/tight-wall-port.json";
import twoChains from "#tests/runtime/support/fixtures/two-chains.json";
import wallPortKinds from "#tests/runtime/support/fixtures/wall-port-kinds.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

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
	const header = headerCards(drawn).get("pool")!;
	expect(nodes["pipe"]!.y).toBeGreaterThanOrEqual(header.y + header.height);
	expectDrawingIntact(drawn, content, "blocks");
});

test("a group region exports its relationships through clear owned channels", async () => {
	const content = orderedFixture(agentWorkbench);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expectDrawingIntact(drawn, content, "blocks");
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

// Reduced from a dogfood view: a trunk round the leftmost block of a container
// ran four points inside the container's left wall, as it keeps from the right.
test("a reserved trunk stays distinct from its container wall", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const inset = alongWalls(routePoints(drawn.svg), drawn.atlas.nodes["yAFyqal3"]!);
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
	expect(alongWalls(routePoints(drawn.svg), frame)).toEqual([]);
});

test("a reserved trunk between adjacent blocks preserves its labels and endpoints", async () => {
	const content = orderedFixture(workingWithAnAgent);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expectDrawingIntact(drawn, content, "blocks");
});

test("two chains leaving a block preserve their forward reading", async () => {
	const content = orderedFixture(twoChains);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const { nodes } = drawn.atlas;
	// The chain into the Platform is a card shorter; it stays level with the
	// other rather than hanging from the block's bottom between its rows.
	for (const [from, to] of [
		["preview", "platlb"],
		["dns", "legacy"],
	] as const) {
		const source = nodes[from]!,
			target = nodes[to]!;
		expect(target.y >= source.y + source.height || target.x >= source.x + source.width).toBe(true);
	}
	expectDrawingIntact(drawn, content, "blocks");
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

test("a nested write boundary keeps its complete reserved channels", async () => {
	const content = orderedFixture(durableWriteBoundary);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expectDrawingIntact(drawn, content, "blocks");
});

test("lines from different cards leave a region by their own ports, not along its wall", async () => {
	const content = orderedFixture(oneBrowserTwoUses);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expect(alongWalls(routePoints(drawn.svg), regionBox(drawn.svg, "drawing"))).toEqual([]);
});

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

// Parent relationships attach to the visible header through any feasible wall.
test("a line into a container itself keeps its header endpoint and its private label", async () => {
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
	expect(headerCards(drawn).has("pool")).toBe(true);
	expect(endsOffCards(drawn, content)).toEqual([]);
	expectDrawingIntact(drawn, content, "blocks");
});

test("a line into a container enters the card from the side its source stands on", async () => {
	const content = orderedFixture(requestPath);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const [card, source] = [drawn.atlas.nodes["42C5lYne"]!, drawn.atlas.nodes["KpJL9Y0f"]!];
	const end = routeEnds(drawn.svg).get("f3lzoqzb")!;
	expect(end.y < card.y + card.height / 2).toBe(source.y < card.y);
});

// This nested arrival keeps its label and header clear regardless of the chosen face.
test("a line into a block above its source preserves its header and source label", async () => {
	const content = orderedFixture(theTwoThreads);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	expectDrawingIntact(drawn, content, "blocks");
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

/**
 * Where a route crosses a box's walls.
 * @param route The route.
 * @param box The box.
 * @returns Each crossing, as its wall and where along it.
 */
function wallCrossings(
	route: readonly { x: number; y: number }[],
	box: { x: number; y: number; width: number; height: number },
): string[] {
	return route.slice(1).flatMap((end, index) => {
		const start = route[index]!;
		if (start.y === end.y && start.y > box.y && start.y < box.y + box.height) {
			const [low, high] = [Math.min(start.x, end.x), Math.max(start.x, end.x)];
			return [box.x, box.x + box.width]
				.filter((x) => low < x && x < high)
				.map((x) => `${x === box.x ? "left" : "right"}:${start.y}`);
		}
		if (start.x === end.x && start.x > box.x && start.x < box.x + box.width) {
			const [low, high] = [Math.min(start.y, end.y), Math.max(start.y, end.y)];
			return [box.y, box.y + box.height]
				.filter((y) => low < y && y < high)
				.map((y) => `${y === box.y ? "top" : "bottom"}:${start.x}`);
		}
		return [];
	});
}

test("lines of two kinds out of a container cross its walls apart", async () => {
	const content = orderedFixture(wallPortKinds);
	const drawn = await renderArchitecture({ content, theme: "light", policy, layout: "blocks" });
	const routes = corridorPoints(drawn.svg);
	const [rpc, call] = ["MZtuHuMT", "o63C7KPd"].map((id) =>
		wallCrossings(routes.get(id)!, drawn.atlas.nodes["Fvl3uDPi"]!),
	);
	expect(rpc!.length * call!.length).toBeGreaterThan(0);
	expect(rpc!.filter((crossing) => call!.includes(crossing))).toEqual([]);
});
