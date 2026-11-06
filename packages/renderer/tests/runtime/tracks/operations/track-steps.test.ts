import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { SemanticPolicySchema } from "@archboard/model/policy";
import { bodyShift, corridorPoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { scorecardOf } from "#tests/runtime/support/drawn-scorecard.ts";
import onePointPort from "#tests/runtime/support/fixtures/one-point-port.json";
import modelRasterizer from "#tests/runtime/support/fixtures/model-rasterizer.json";
import browserApplication from "#tests/runtime/support/fixtures/browser-application.json";
import codexWorkhorse from "#tests/runtime/support/fixtures/codex-workhorse.json";
import commandGroups from "#tests/runtime/support/fixtures/command-groups.json";
import commandInterface from "#tests/runtime/support/fixtures/command-interface.json";
import oneCommandPath from "#tests/runtime/support/fixtures/one-command-path.json";
import staircase from "#tests/runtime/support/fixtures/staircase.json";
import voiceCoordinator from "#tests/runtime/support/fixtures/voice-coordinator.json";
import walkthroughStair from "#tests/runtime/support/fixtures/walkthrough-stair.json";

/** The vocabulary the fixtures reduced from dogfood documents draw with, its groups in the vault's order. */
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

// Reduced from a dogfood document: a long line's lanes drift a little from band
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

// Reduced from a dogfood document: two lines leave a frame through its one
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

// Taken from a document of this repository: a line into a card stacked under
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

/** A frame's box as drawn: its left and right walls, its top and bottom. */
interface Walls {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

/**
 * The columns where a line runs down beside a frame's wall for more than a
 * lane, nearer it than a lane and a half.
 * @param points The line's corridor.
 * @param regions Every frame's walls.
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
			/data-depiction="container"[^>]*><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="10" pointer-events="all"/g,
		),
	].map(([, x, y, width, height]) => ({
		left: Number(x) + shift.x,
		right: Number(x) + Number(width) + shift.x,
		top: Number(y) + shift.y,
		bottom: Number(y) + Number(height) + shift.y,
	}));
}

// Taken from documents of this repository: a line ran down just outside a
// container's wall, 16 px off it, where nothing stood between them. Inside a
// container its inset keeps what it holds off the wall; outside, a line keeps
// the same clearance from it where it has the room.
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

test("a line runs inside the drawing rather than round it", async () => {
	for (const [fixture, id] of [
		[modelRasterizer, "P1XYQl8l"],
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
	}
});

test("a line squeezed between a card and a wall passes on one column", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(codexWorkhorse),
		theme: "light",
		layout: "track",
		policy,
	});
	expect(sidewaysLevels(corridorPoints(drawing.svg).get("FWJMAVKj")!).size).toBeLessThanOrEqual(2);
});

test("a packed group's pin stands where the document's line turns to it", async () => {
	const content = orderedFixture(commandGroups);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const crossings = scorecardOf(drawing, content).find(({ name }) => name === "crossings")!;
	expect(crossings.value).toBeLessThanOrEqual(3);
});

// Taken from a document of this repository: Graphviz ranked a line's label beside
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
