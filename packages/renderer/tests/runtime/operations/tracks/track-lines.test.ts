// How the track engine's lines run through a drawing (visual polish): each
// test is a defect a visual review found in real boards, reduced to a fixture.
// What this catches: a line that steps sideways by less than its two bends
// need, a line rising into the card above whose arrowhead sits on its last
// bend, labels on a crowded band shifted together until every line through
// them jogs, a labelled fan whose trunk turns once and whose labels then turn
// it a second time, two labelled lines entering one card unevenly, a line
// crossing a container's heading through its painted words, lanes put where
// they cross another line that a free column would have left alone, a line
// through a card entering and leaving it a few points apart, a run of lanes
// left where a label stood before it slid aside, a container ending 12 px
// above another opening under it, two lines lined up end to end across a
// channel so that they read as one, lines into one card that join on the way
// and then part again, to their own ends or to join once more, a line
// run round the outside of the drawing where a short free route ran through
// it, and a labelled line stepping sideways both above and below its label
// where one column ran free from its label to its card.

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { SemanticPolicySchema, DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import {
	corridorPoints,
	routeLabels,
	routePoints,
	sharedStretches,
	type DrawnPoint,
} from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";
import commandGroups from "#tests/runtime/support/fixtures/command-groups.json";
import headingCrossing from "#tests/runtime/support/fixtures/heading-crossing.json";
import laneOrder from "#tests/runtime/support/fixtures/lane-order.json";
import marginLap from "#tests/runtime/support/fixtures/margin-lap.json";
import readAsOne from "#tests/runtime/support/fixtures/read-as-one.json";
import risingLine from "#tests/runtime/support/fixtures/rising-line.json";
import shortStep from "#tests/runtime/support/fixtures/short-step.json";
import throughCard from "#tests/runtime/support/fixtures/through-card.json";
import throughLabel from "#tests/runtime/support/fixtures/through-label.json";
import trunkFan from "#tests/runtime/support/fixtures/trunk-fan.json";
import twinLines from "#tests/runtime/support/fixtures/twin-lines.json";
import voiceCoordinator from "#tests/runtime/support/fixtures/voice-coordinator.json";
import workingWithAnAgent from "#tests/runtime/support/fixtures/working-with-an-agent.json";

/** The room a container keeps around what it holds, and between it and a container it stands over. */
const CONTAINER_INSET = 20;
/** The straight run an arrowhead sits on after a line's last bend. */
const APPROACH = 12;
/** The sideways room a line's two fixed 8 px bends need to step aside and on. */
const TWO_BENDS = 16;

/** The vocabulary the fixtures reduced from dogfood boards draw with, its groups in the vault's order. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		module: { name: "Module", icon: "RiBox3Line" },
		function: { name: "Function", icon: "RiCodeSSlashLine" },
		external: { name: "External", icon: "RiExternalLinkLine" },
		service: { name: "Service", icon: "RiServerLine" },
		system: { name: "System", icon: "RiApps2Line" },
		ui: { name: "User interface", icon: "RiLayoutLine" },
	},
	relationshipKinds: {
		call: { name: "Call", dash: "solid", arrowhead: "filled" },
		rpc: { name: "RPC", color: "violet", dash: "solid", arrowhead: "filled" },
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
 * How far a drawn route steps sideways between each of its upright runs and the next.
 * @param points The route's path points, control points included.
 * @returns The steps, in order.
 */
function sidewaysSteps(points: readonly DrawnPoint[]): number[] {
	const uprights = points
		.slice(1)
		.flatMap((point, index) =>
			point.x === points[index]!.x && point.y !== points[index]!.y ? [point.x] : [],
		);
	return uprights.slice(1).map((x, index) => Math.abs(x - uprights[index]!));
}

// Reduced from dogfood boards, names replaced in the first: lines leaving one
// shared port stepped a few points aside where a lane or a label stood just
// off their column; and a lane held a few points off its label's column by
// the box beside the label, where no move could close the step.
test.each([
	["short step", shortStep],
	["working with an agent", workingWithAnAgent],
])(
	"a line steps sideways by no less than its two bends need, or runs straight (%s)",
	async (_, fixture) => {
		const drawing = await renderArchitecture({
			content: orderedFixture(fixture),
			theme: "light",
			layout: "track",
			policy,
		});
		for (const [id, points] of routePoints(drawing.svg))
			for (const step of sidewaysSteps(points))
				expect(step > 0.5 && step < TWO_BENDS, `${id} steps ${step}`).toBe(false);
	},
);

// Reduced from a dogfood board, names replaced: a line rising into the card
// above turned on the channel's first track, 8 px under that card.
test("every line's arrowhead sits on a straight run, rising lines' too", async () => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(risingLine),
		theme: "light",
		layout: "track",
	});
	for (const [id, points] of routePoints(drawing.svg)) {
		const [before, end] = [points.at(-2)!, points.at(-1)!];
		expect(Math.hypot(end.x - before.x, end.y - before.y), id).toBeGreaterThanOrEqual(APPROACH);
	}
});

// Shaped like a real ingress board's band, names replaced: four labelled lines
// between two rows, whose label boxes cannot all stand where their lines run
// straight. Sharing the displacement out made every line but one jog.
test("labels crowding one band leave as many of their lines straight as fit", async () => {
	const band = orderedFixture({
		nodes: [
			["dns", "Name service", "Names one balancer's public address for the whole traffic cutover"],
			["probe", "Probe", "Synthetic requests from engineers"],
			["old", "Old balancer", "Forwards traffic to the old pool without opening it"],
			["new", "New balancer", "Separate balancer with its own public address"],
		].map(([id, name, responsibility]) => ({ id, name, kind: "module", responsibility })),
		edges: [
			["fallback", "dns", "old", "event", "If the proxy is down: falls back here"],
			["today", "dns", "old", "call", "Today: points here"],
			["stage2", "dns", "new", "call", "Stage 2: points here instead"],
			["stage1", "probe", "new", "call", "Stage 1: plain HTTP on a preview port"],
		].map(([id, from, to, kind, label]) => ({ id, from, to, kind, label })),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: band,
		theme: "light",
		layout: "track",
	});
	const jogging = [...routePoints(drawing.svg)].filter(([, points]) =>
		points.some((point, index) => index > 0 && Math.abs(point.x - points[index - 1]!.x) > 0.5),
	);
	expect(jogging.length).toBeLessThanOrEqual(1);
});

// Reduced from a dogfood board, names replaced: labelled lines leaving one
// card through a shared trunk. Each label stood over the edge of the source's
// face, so each line ran sideways on the trunk's track and again below its label.
test("a labelled line leaving through a trunk runs sideways on one level only", async () => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(trunkFan),
		theme: "light",
		layout: "track",
	});
	for (const [id, points] of routePoints(drawing.svg)) {
		const levels = points
			.slice(1)
			.filter((point, index) => point.y === points[index]!.y && point.x !== points[index]!.x)
			.map(({ y }) => y);
		expect(new Set(levels).size, id).toBeLessThanOrEqual(1);
	}
});

// Reduced from a dogfood board: the run of lanes above a line's label and the
// run below it were each straightened on their own, so the line stepped
// sideways on both sides of its label although one column ran free from the
// label down to its card.
test("a labelled line steps sideways on one side of its label at most", async () => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(throughLabel),
		theme: "light",
		layout: "track",
	});
	const labels = routeLabels(drawing.svg);
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const box = labels.get(id);
		if (box === undefined) continue;
		const sideways = points
			.slice(1)
			.flatMap((point, index) =>
				Math.abs(point.x - points[index]!.x) > 0.5 ? [(point.y + points[index]!.y) / 2] : [],
			);
		const above = sideways.some((y) => y < box.y);
		const below = sideways.some((y) => y > box.y + box.height);
		expect(above && below, id).toBe(false);
	}
});

// Shaped like a real board, names replaced: two hosts side by side each send a
// labelled line into the store under them. Where Graphviz stood a label is
// arbitrary, and one line entered 20 px from the store's corner.
test("two labelled lines into one card enter it evenly", async () => {
	const fork = orderedFixture({
		nodes: [
			["left", "Host three", "Legacy services"],
			["right", "Host four", "Legacy services"],
			["store", "Shared store", "Existing shared production database."],
		].map(([id, name, responsibility]) => ({ id, name, kind: "module", responsibility })),
		edges: ["left", "right"].map((from) => ({
			id: from,
			from,
			to: "store",
			kind: "data",
			label: "Database connection",
		})),
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: fork,
		theme: "light",
		layout: "track",
	});
	const store = drawing.atlas.nodes["store"]!;
	const routes = routePoints(drawing.svg);
	const [left, right] = ["left", "right"].map((id) => routes.get(id)!.at(-1)!.x);
	expect(Math.abs(left! - store.x - (store.x + store.width - right!))).toBeLessThanOrEqual(2);
});

/**
 * Where a container's heading words are painted: each line of its title and
 * summary, from its x to a width no narrower than its characters at 0.4 em.
 * @param svg The drawing.
 * @returns Each line's box, top to bottom.
 */
function headingLines(svg: string): { x: number; end: number; top: number; bottom: number }[] {
	return drawnTexts(svg)
		.filter(({ subject }) => subject.kind === "region")
		.map(({ x, y, size, text }) => ({
			x,
			end: x + text.length * size * 0.4,
			top: y - size,
			bottom: y,
		}));
}

// Reduced from a dogfood board, names replaced: Graphviz stands a frame's
// heading row wherever it likes and runs lines beside it, but the words are
// painted from the frame's left edge, where those lines ran.
test("a line crossing a container's heading passes beside its words", async () => {
	const content = orderedFixture(headingCrossing);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const lines = headingLines(drawing.svg);
	expect(lines.length).toBeGreaterThan(0);
	for (const [id, points] of routePoints(drawing.svg))
		points.slice(1).forEach((point, index) => {
			const previous = points[index]!;
			if (previous.x !== point.x) return;
			const struck = lines.some(
				(line) =>
					point.x >= line.x &&
					point.x <= line.end &&
					Math.min(previous.y, point.y) < line.bottom &&
					Math.max(previous.y, point.y) > line.top,
			);
			expect(struck, `${id} through a heading`).toBe(false);
		});
});

/**
 * Whether a value lies strictly between two others, more than a unit inside.
 * @param value The value.
 * @param one One bound.
 * @param other The other.
 * @returns True when it is inside.
 */
function inside(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 1 && value < Math.max(one, other) - 1;
}

/**
 * How many times one drawn route crosses another, from their corridors with
 * the hops taken out.
 * @param svg The drawing.
 * @returns The count.
 */
function crossingsOf(svg: string): number {
	const segments = [...corridorPoints(svg)].flatMap(([id, points]) =>
		points.slice(1).map((end, index) => ({ id, start: points[index]!, end })),
	);
	const level = segments.filter(({ start, end }) => start.y === end.y && start.x !== end.x);
	const upright = segments.filter(({ start, end }) => start.x === end.x && start.y !== end.y);
	return level.reduce(
		(count, across) =>
			count +
			upright.filter(
				(down) =>
					down.id !== across.id &&
					inside(down.start.x, across.start.x, across.end.x) &&
					inside(across.start.y, down.start.y, down.end.y),
			).length,
		0,
	);
}

// Reduced from a dogfood board, names replaced: the longest run of lanes took
// its column first and passed a sibling line's lanes that still stood where
// Graphviz left them, so the sibling crossed it on its way to its label.
test("a run of lanes takes the free column that crosses fewest other lines", async () => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(laneOrder),
		theme: "light",
		layout: "track",
	});
	expect(crossingsOf(drawing.svg)).toBe(0);
});

/**
 * Every frame's and group region's drawn box.
 * @param svg The drawing.
 * @returns The boxes.
 */
function containerBoxes(svg: string): { x: number; y: number; width: number; height: number }[] {
	const opens =
		/<g data-semantic-kind="(?:region"[^>]*data-depiction="container|group-region)"[^>]*>\s*(?:<rect class="ab-halo"[^>]*>\s*)?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/gu;
	return [...svg.matchAll(opens)].map(([, x, y, width, height]) => ({
		x: Number(x),
		y: Number(y),
		width: Number(width),
		height: Number(height),
	}));
}

// Shaped like a real ingress board, names replaced: two gateways each take a
// labelled line in on top and send one out at the bottom, and where Graphviz
// stood each label put the line in and the line out 10 px apart.
test("a line into a card and one out of it run through it on one column", async () => {
	const content = orderedFixture(throughCard);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const routes = routePoints(drawing.svg);
	for (const { id } of content.nodes) {
		const box = drawing.atlas.nodes[id]!;
		const ends = (edges: typeof content.edges, at: "from" | "to", y: number): number[] =>
			edges.flatMap((edge) => {
				const points = routes.get(edge.id)!;
				const point = at === "to" ? points.at(-1)! : points[0]!;
				return edge[at] === id && Math.abs(point.y - y) < 1.5 ? [point.x] : [];
			});
		const ins = ends(content.edges, "to", box.y);
		const outs = ends(content.edges, "from", box.y + box.height);
		for (const into of ins)
			for (const out of outs)
				expect(Math.abs(into - out) <= 0.5 || Math.abs(into - out) >= TWO_BENDS, id).toBe(true);
	}
});

// The workhorse fixture again: one line's run of lanes was blocked by a label
// that later slid aside, and the run stayed where it was, turning twice more.
test("a run of lanes a label blocked moves onto its end's column once the label slides", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(readAsOne),
		theme: "light",
		layout: "track",
		policy,
	});
	for (const [id, points] of corridorPoints(drawing.svg)) {
		const levels = points
			.slice(1)
			.filter((point, index) => point.y === points[index]!.y && point.x !== points[index]!.x)
			.map(({ y }) => y);
		expect(new Set(levels).size, id).toBeLessThanOrEqual(2);
	}
});

// The heading fixture again: its Drawing region ended one band above a frame
// that opened under it, and the channel between kept 12 px, not an inset.
test("a container standing over another keeps a container's inset from it", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(headingCrossing),
		theme: "light",
		layout: "track",
		policy,
	});
	const boxes = containerBoxes(drawing.svg);
	expect(boxes.length).toBeGreaterThan(1);
	for (const upper of boxes)
		for (const lower of boxes) {
			const across = upper.x < lower.x + lower.width && lower.x < upper.x + upper.width;
			const gap = lower.y - (upper.y + upper.height);
			if (across && gap >= 0) expect(gap).toBeGreaterThanOrEqual(CONTAINER_INSET);
		}
});

// Reduced from a dogfood board, names replaced: a line came down onto its track
// and turned where another turned off the track below and went on down, one
// lane over, and the two read as one line with a kink. The second, taken from
// a board of this repository, had the two parted, and a later pass closing a
// short step moved one back onto the other's column. In the third, the one
// line's run of lanes stepped round a label above, so no move of the whole
// run was free.
test.each([
	["read-as-one", readAsOne],
	["command-groups", commandGroups],
	["voice-coordinator", voiceCoordinator],
] as const)(
	"a line ending on a track and another leaving the track below stand apart (%s)",
	async (_, fixture) => {
		const drawing = await renderArchitecture({
			content: orderedFixture(fixture),
			theme: "light",
			layout: "track",
			policy,
		});
		const routes = corridorPoints(drawing.svg);
		// Lines drawn joined, on one trunk, are one line where they meet.
		const joined = (one: string, other: string): boolean =>
			sharedStretches(routes.get(one)!, routes.get(other)!).length > 0;
		const uprights = [...routes].flatMap(([id, points]) =>
			points.slice(1).flatMap((end, index) => {
				const start = points[index]!;
				const upright = start.x === end.x && Math.abs(start.y - end.y) > 0.5;
				return upright
					? [{ id, x: end.x, top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) }]
					: [];
			}),
		);
		for (const one of uprights)
			for (const other of uprights.filter(({ id }) => id !== one.id && !joined(id, one.id))) {
				const gap = other.top - one.bottom;
				const lined = Math.abs(one.x - other.x) < TWO_BENDS && gap > 0 && gap <= 2 * TWO_BENDS + 8;
				expect(lined, `${one.id} runs on into ${other.id}`).toBe(false);
			}
	},
);

// Reduced from a dogfood board, names replaced: under Blocks, lines of one
// kind from one block reach a card in another through one port. Each carrying
// its own label inside the card's block, they split through their labels
// after the port, and either joined again at the card, a ladder of loops, or
// ended apart on it. Once joined, lines stay one line into the card.
test("lines of one kind that join on the way to a card stay one line into it", async () => {
	const content = orderedFixture(twinLines);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "blocks", policy });
	const routes = corridorPoints(drawing.svg);
	const parted = content.edges.flatMap((one, index) =>
		content.edges
			.slice(index + 1)
			.filter(({ to, kind }) => to === one.to && kind === one.kind)
			.flatMap((other) => {
				const [a, b] = [routes.get(one.id)!, routes.get(other.id)!];
				const shared = sharedStretches(a, b);
				const [end, otherEnd] = [a.at(-1)!, b.at(-1)!];
				const together = Math.hypot(end.x - otherEnd.x, end.y - otherEnd.y) < 1;
				const joined = shared.reduce((sum, length) => sum + length, 0) > TWO_BENDS;
				return joined && (!together || shared.length > 1) ? [`${one.id}/${other.id}`] : [];
			}),
	);
	expect(parted).toEqual([]);
});

// Reduced from a dogfood board, names replaced: Graphviz stood a long line's
// label, and so its lanes, beyond the cards on one side, and the line ran out
// round the edge of the drawing and back in, where a free route ran between
// its two ends.
test("a line runs between its ends rather than round the drawing when a free route does", async () => {
	const content = orderedFixture(marginLap);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "track", policy });
	const edge = content.edges.find(({ id }) => id === "FWJMAVKj")!;
	const ends = [drawing.atlas.nodes[edge.from]!, drawing.atlas.nodes[edge.to]!];
	const low = Math.min(...ends.map(({ x }) => x));
	const high = Math.max(...ends.map(({ x, width }) => x + width));
	for (const { x } of routePoints(drawing.svg).get(edge.id)!)
		expect(x >= low && x <= high, `${x} outside ${low}..${high}`).toBe(true);
});
