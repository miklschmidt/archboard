// The blocks engine lays every container and group region out as a block of
// its own and joins the lines between blocks through ports on their edges.
// What this catches: room a block keeps for trunks that do not use it, and
// lines between blocks that turn back on themselves or run along a border.

import { expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { CONTAINER_INSET } from "@/transformers/semantic-renderer/config";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	bodyShift,
	corridorPoints,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import agentWorkbench from "./agent-workbench.json";
import oneBrowserTwoUses from "./one-browser-two-uses.json";
import durableWriteBoundary from "./durable-write-boundary.json";
import owningTheChild from "./owning-the-child.json";
import twoChains from "./two-chains.json";
import workingWithAnAgent from "./working-with-an-agent.json";

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

test("a container of blocks keeps no more room under its title than a container of cards", async () => {
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
	expect(packed).toBeLessThanOrEqual(carded);
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
 * Every route with a run longer than a lane that lies on one of a box's
 * edges, within a point.
 * @param routes Every route's points.
 * @param box The box.
 * @returns The routes' ids.
 */
function alongWalls(
	routes: ReadonlyMap<string, readonly { x: number; y: number }[]>,
	box: { x: number; y: number; width: number; height: number },
): string[] {
	const on = (at: number, low: number, high: number): boolean =>
		Math.abs(at - low) < 1 || Math.abs(at - high) < 1;
	return [...routes].flatMap(([id, points]) =>
		points.slice(1).some((point, index) => {
			const last = points[index]!;
			if (point.x === last.x && Math.abs(point.y - last.y) > 16)
				return on(point.x, box.x, box.x + box.width);
			if (point.y === last.y && Math.abs(point.x - last.x) > 16)
				return on(point.y, box.y, box.y + box.height);
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
