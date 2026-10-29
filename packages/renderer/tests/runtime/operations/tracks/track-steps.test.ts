import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { SemanticPolicySchema } from "@archboard/board/policy";
import { bodyShift, corridorPoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { scorecardOf } from "#tests/runtime/support/drawn-scorecard.ts";
import onePointPort from "#tests/runtime/support/fixtures/one-point-port.json";
import regionPortTurnBack from "#tests/runtime/support/fixtures/region-port-turn-back.json";
import agentWorkbench from "#tests/runtime/support/fixtures/agent-workbench.json";
import boardRasterizer from "#tests/runtime/support/fixtures/board-rasterizer.json";
import browserApplication from "#tests/runtime/support/fixtures/browser-application.json";
import codexWorkhorse from "#tests/runtime/support/fixtures/codex-workhorse.json";
import commandGroups from "#tests/runtime/support/fixtures/command-groups.json";
import commandInterface from "#tests/runtime/support/fixtures/command-interface.json";
import durableWriteBoundary from "#tests/runtime/support/fixtures/durable-write-boundary.json";
import oneCommand from "#tests/runtime/support/fixtures/one-command.json";
import oneCommandPath from "#tests/runtime/support/fixtures/one-command-path.json";
import staircase from "#tests/runtime/support/fixtures/staircase.json";
import voiceCoordinator from "#tests/runtime/support/fixtures/voice-coordinator.json";
import walkthroughStair from "#tests/runtime/support/fixtures/walkthrough-stair.json";

/** The vocabulary the fixtures reduced from dogfood boards draw with, its groups in the vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
		system: { name: "System", icon: "RiApps2Line" },
		service: { name: "Service", icon: "RiServerLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
		http: { name: "HTTP", color: "sky", dash: "solid", arrowhead: "filled" },
		event: { name: "Event", color: "fuchsia", dash: "dashed", arrowhead: "open" },
		dependency: { name: "Dependency", dash: "dotted", arrowhead: "open" },
		data: { name: "Data", color: "teal", dash: "solid", arrowhead: "filled" },
		render: { name: "Render", color: "pink", dash: "solid", arrowhead: "filled" },
	},
	groups: {
		writes: { name: "Board writes", color: "orange" },
		drawing: { name: "Drawing", color: "violet" },
		panes: { name: "Live panes", color: "teal" },
		walkthrough: { name: "Walkthroughs", color: "cyan" },
		voice: { name: "Voice", color: "yellow" },
		workhorse: { name: "Workhorse", color: "sky" },
		child: { name: "Codex child", color: "indigo" },
		agent: { name: "Agent", color: "fuchsia" },
		checks: { name: "Vault checks", color: "pink" },
	},
});

/**
 * The heights a drawn route runs sideways at.
 * @param points The route's corridor, hops taken out.
 * @returns Each distinct height.
 */
function sidewaysLevels(points: readonly DrawnPoint[]): Set<number> {
	return new Set(
		points
			.slice(1)
			.filter((point, index) => point.y === points[index]!.y && point.x !== points[index]!.x)
			.map(({ y }) => y),
	);
}

/**
 * How many times a drawn route doubles back: runs sideways one way, then,
 * after going down, the other way, each farther than a lane.
 * @param points The route's corridor, hops taken out.
 * @returns How many times it turns back.
 */
function turnBacks(points: readonly DrawnPoint[]): number {
	const runs: number[] = [];
	points.slice(1).forEach((point, index) => {
		const step = point.y === points[index]!.y ? point.x - points[index]!.x : 0;
		if (step === 0) return;
		if (Math.sign(runs.at(-1) ?? 0) === Math.sign(step)) runs[runs.length - 1]! += step;
		else runs.push(step);
	});
	return runs.slice(1).filter((run, index) => Math.abs(run) > 16 && Math.abs(runs[index]!) > 16)
		.length;
}

// Reduced from a dogfood board: a long line's lanes drift a little from band
// to band where Graphviz drew it, no one column was free for all of them, and
// each lane kept its own x, so the line stepped in almost every channel.
test("a long line no one column holds takes as few columns as hold it", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(staircase),
		theme: "light",
		layout: "track",
		policy,
	});
	for (const [id, points] of corridorPoints(drawing.svg))
		expect(sidewaysLevels(points).size, id).toBeLessThanOrEqual(4);
});

// Reduced from a dogfood board: two lines leave a group region through its one
// port, one of them straight down into it. Read as two lines lined up end to
// end, the other was stepped a lane aside just before the port they share,
// where they are drawn joined anyway.
test("a line into a port another line drops into is not stepped aside from it", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(onePointPort),
		theme: "light",
		layout: "track",
		policy,
	});
	const points = corridorPoints(drawing.svg).get("mxl6bmYW")!;
	expect(sidewaysLevels(points).size).toBeLessThanOrEqual(2);
});

// Reduced from a dogfood board: a line leaves a group region for a card far
// below it. Its lanes were held to the region Graphviz drew the first one in,
// so the line stepped down to a second track in the same empty channel
// before running on outside the region.
test("a line leaving a group region runs on the track it is already on", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(walkthroughStair),
		theme: "light",
		layout: "track",
		policy,
	});
	const points = corridorPoints(drawing.svg).get("P1XYQl8l")!;
	expect(sidewaysLevels(points).size).toBeLessThanOrEqual(1);
});

test.each([
	["browser application", browserApplication, "md5cpNZV", 3],
	["command interface", commandInterface, "REIYPxdO", 2],
] as const)(
	"a line steps once where one step joins the columns above and below (%s)",
	async (_, fixture, id, levels) => {
		const drawing = await renderArchitecture({
			content: orderedFixture(fixture),
			theme: "light",
			layout: "track",
			policy,
		});
		const points = corridorPoints(drawing.svg).get(id)!;
		expect(sidewaysLevels(points).size).toBeLessThanOrEqual(levels);
	},
);

// Taken from a board of this repository: a line into a card stacked under
// another in a group region went round the upper card, then stepped to its
// label and again, a lane, from the label to the lower card's port, a
// staircase just above its arrowhead. It steps once, above its label.
test("a line steps to its label's column once, not again between label and card", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(browserApplication),
		theme: "light",
		layout: "track",
		policy,
	});
	const points = corridorPoints(drawing.svg).get("x9gy2EYu")!;
	expect(sidewaysLevels(points).size).toBeLessThanOrEqual(3);
});

// Reduced from a dogfood board: two lines leave a group region through one
// port on its bottom, placed between its two cards before the board around
// the region was routed. Outside, their line goes on to the right, so the one
// from the left card ran along the region's track past its turn and back.
test("a line through a group region's port does not double back at it", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(regionPortTurnBack),
		theme: "light",
		layout: "track",
		policy,
	});
	for (const [id, points] of corridorPoints(drawing.svg)) expect(turnBacks(points), id).toBe(0);
});

// Taken from a board of this repository: a line out of Voice's top stepped
// aside round a label inside the region, then back to the port the board
// had settled on the region's wall, and on out the way it had come.
test("a line out of a group region meets its port where it runs inside", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(agentWorkbench),
		theme: "light",
		layout: "track",
		policy,
	});
	expect(turnBacks(corridorPoints(drawing.svg).get("mhknqBOz")!)).toBeLessThanOrEqual(1);
});

/** A group region's box as drawn: its left and right walls, its top and bottom. */
interface Walls {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

/**
 * Every group region a drawing draws.
 * @param svg The drawing.
 * @returns Each region's walls.
 */
function regionWalls(svg: string): Walls[] {
	const shift = bodyShift(svg);
	return [
		...svg.matchAll(
			/data-semantic-kind="group-region"[^>]*>\s*<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu,
		),
	].map(([, x, y, width, height]) => ({
		left: Number(x) + shift.x,
		right: Number(x) + Number(width) + shift.x,
		top: Number(y) + shift.y,
		bottom: Number(y) + Number(height) + shift.y,
	}));
}

/**
 * The columns where a line runs down beside a region's wall for more than a
 * lane, nearer it than a lane and a half.
 * @param points The line's corridor.
 * @param regions Every region's walls.
 * @returns Those columns.
 */
function besideWalls(points: readonly DrawnPoint[], regions: readonly Walls[]): number[] {
	return points.slice(1).flatMap((to, index) => {
		const from = points[index]!;
		if (Math.abs(from.x - to.x) > 0.5) return [];
		const [top, bottom] = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
		const beside = regions.some(
			(walls) =>
				Math.min(bottom, walls.bottom) - Math.max(top, walls.top) > 16 &&
				[walls.left, walls.right].some((wall) => {
					const apart = Math.abs(from.x - wall);
					return apart > 0.5 && apart < 24;
				}),
		);
		return beside ? [from.x] : [];
	});
}

test("a line keeps a lane and a half from a group region's wall it runs beside", async () => {
	for (const fixture of [durableWriteBoundary, oneCommand, commandGroups, browserApplication]) {
		const drawing = await renderArchitecture({
			content: orderedFixture(fixture),
			theme: "light",
			layout: "track",
			policy,
		});
		const regions = regionWalls(drawing.svg);
		for (const [id, points] of corridorPoints(drawing.svg))
			expect(besideWalls(points, regions), id).toEqual([]);
	}
});

/**
 * Every container frame a drawing draws, read from its halo, which stands
 * its stroke's width outside the frame.
 * @param svg The drawing.
 * @returns Each frame's walls.
 */
function frameWalls(svg: string): Walls[] {
	const shift = bodyShift(svg);
	return [
		...svg.matchAll(
			/data-depiction="container"[^>]*>(?:(?!<\/g>)[\s\S])*?<rect class="ab-halo" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu,
		),
	].map(([, x, y, width, height]) => ({
		left: Number(x) + 3 + shift.x,
		right: Number(x) + Number(width) - 3 + shift.x,
		top: Number(y) + 3 + shift.y,
		bottom: Number(y) + Number(height) - 3 + shift.y,
	}));
}

// Taken from boards of this repository: a line ran down just outside a
// container's wall, 16 px off it, where nothing stood between them. Inside a
// container its inset keeps what it holds off the wall; outside, a line keeps
// a group region's clearance from it where it has the room.
test("a line keeps a lane and a half outside a container's wall it runs beside", async () => {
	for (const fixture of [voiceCoordinator, walkthroughStair]) {
		const drawing = await renderArchitecture({
			content: orderedFixture(fixture),
			theme: "light",
			layout: "track",
			policy,
		});
		const frames = frameWalls(drawing.svg);
		expect(frames.length).toBeGreaterThan(0);
		for (const [id, points] of corridorPoints(drawing.svg))
			for (const walls of frames)
				expect(
					besideWalls(points, [walls]).filter((x) => x < walls.left || x > walls.right),
					id,
				).toEqual([]);
	}
});

/**
 * How long each upright run of a line left of every card is: a lap down the
 * page's left margin, round everything.
 * @param drawing The drawing.
 * @param id The line.
 * @returns The runs' lengths, the short ones too.
 */
function leftOfEverything(drawing: RenderedDiagram, id: string): number[] {
	const left = Math.min(...Object.values(drawing.atlas.nodes).map(({ x }) => x));
	const points = corridorPoints(drawing.svg).get(id)!;
	return points
		.slice(1)
		.flatMap((to, index) =>
			to.x === points[index]!.x && to.x < left ? [Math.abs(to.y - points[index]!.y)] : [],
		);
}

/**
 * Whether a point stands inside a region, its walls moved out by some amount.
 * @param point The point.
 * @param walls The region's walls.
 * @param by How far out; less than none moves them in.
 * @returns True when it is inside.
 */
function within(point: DrawnPoint, walls: Walls, by: number): boolean {
	return (
		point.x > walls.left - by &&
		point.x < walls.right + by &&
		point.y > walls.top - by &&
		point.y < walls.bottom + by
	);
}

/**
 * The runs of a line through a group region neither of its ends stands in.
 * @param points The line's corridor.
 * @param regions Every region's walls.
 * @returns Each such run's middle.
 */
function throughForeign(points: readonly DrawnPoint[], regions: readonly Walls[]): DrawnPoint[] {
	const foreign = regions.filter(
		(walls) => !within(points[0]!, walls, 2) && !within(points.at(-1)!, walls, 2),
	);
	return points.slice(1).flatMap((to, index) => {
		const from = points[index]!;
		const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
		return foreign.some((walls) => within(middle, walls, -1)) ? [middle] : [];
	});
}

test("a line runs inside the drawing rather than round it", async () => {
	for (const [fixture, id] of [
		[boardRasterizer, "P1XYQl8l"],
		[codexWorkhorse, "FWJMAVKj"],
	] as const) {
		const drawing = await renderArchitecture({
			content: orderedFixture(fixture),
			theme: "light",
			layout: "track",
			policy,
		});
		expect(
			leftOfEverything(drawing, id).filter((length) => length > 200),
			id,
		).toEqual([]);
		const points = corridorPoints(drawing.svg).get(id)!;
		expect(throughForeign(points, regionWalls(drawing.svg)), id).toEqual([]);
	}
});

test("a line squeezed between a card and a region's wall passes on one column", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(codexWorkhorse),
		theme: "light",
		layout: "track",
		policy,
	});
	expect(sidewaysLevels(corridorPoints(drawing.svg).get("FWJMAVKj")!).size).toBeLessThanOrEqual(2);
});

test("a packed group's pin stands where the board's line turns to it", async () => {
	const content = orderedFixture(commandGroups);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const crossings = scorecardOf(drawing, content).find(({ name }) => name === "crossings")!;
	expect(crossings.value).toBeLessThanOrEqual(3);
});

// Taken from a board of this repository: Graphviz ranked a line's label beside
// a card that blocks the one column both of the line's cards reach, so the
// line stepped aside just below its source. The band above had room for the
// label on that column, and the line runs straight with its label there.
test.each(["track"] as const)(
	"a labelled line runs straight when its label fits on a neighbouring band (%s)",
	async (layout) => {
		const drawing = await renderArchitecture({
			content: orderedFixture(oneCommandPath),
			theme: "light",
			layout,
			policy,
		});
		const points = corridorPoints(drawing.svg).get("lkwXJ78e")!;
		expect(sidewaysLevels(points).size).toBe(0);
	},
);
