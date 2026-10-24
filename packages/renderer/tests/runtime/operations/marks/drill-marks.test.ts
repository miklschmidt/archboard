// A part that opens another board is marked with which way that board lies,
// read from the part's kind against the level of the board drawn (ADR 0029),
// and the mark takes room beside the name without cutting it.
//
// What is guarded: the direction each part's mark says, in both grammars and
// near and far alike, and a name drawn whole beside its mark. A participant of
// a sequence once kept the room for the mark only when it was painted, so a
// name its card had been widened to hold was cut with an ellipsis. And the mark
// stands at one centre near and far, as far in from the top as from the right,
// on its card and clear of the warning badge in the same corner. The two views
// once placed it each by a rule of its own, so the swap between them moved the
// mark (TASK-434). Before that, the far mark stood a radius and a half from the
// corner whatever the corner held, so the badge of an unsettled part sat inside
// its ring. A frame's name drawn from far away once kept no room for the
// frame's far mark, so a long name ran under it.
import { expect, test } from "bun:test";
import type { DiagramBox, LayoutEngineName } from "@archboard/board/render-reply";
import type { DiagramGrammar } from "@archboard/board/views";
import { renderSemanticView } from "#runtime/operations/render.ts";
import {
	bodyShift,
	distanceToRoute,
	type DrawnPoint,
} from "#tests/runtime/support/drawn-routes.ts";
import { subjectGroups, type DrawnGroup } from "#tests/runtime/support/drawn-subjects.ts";
import { drawnSpan, drawnTexts, registeredFaces } from "#tests/runtime/support/drawn-text.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const OPENS = { board: "elsewhere", variant: { kind: "current" } };

/** Each part, and the way the board it opens lies from a board at the service level. */
const PARTS = [
	{ id: "whole", name: "The platform as a whole", kind: "system", drill: "up" },
	{ id: "peer", name: "A neighbouring service with a long name", kind: "service", drill: "across" },
	{ id: "inner", name: "A module inside it", kind: "module", drill: "down" },
	{ id: "other", name: "A part of no listed level", kind: "datastore", drill: "elsewhere" },
	{ id: "plain", name: "Opens nothing", kind: "service", drill: undefined },
] as const;

const content = orderedFixture({
	nodes: PARTS.map(({ id, name, kind, drill }) => ({
		id,
		name,
		kind,
		...(drill === undefined ? {} : { drillDown: OPENS }),
	})),
	flows: [
		{
			id: "f",
			name: "Asked along",
			participants: PARTS.map(({ id }) => id),
			steps: PARTS.slice(1).map(({ id }, index) => ({
				id: "s" + String(index),
				from: PARTS[index]!.id,
				to: id,
				label: "asks",
				kind: "sync",
			})),
		},
	],
});

/**
 * The directions the marks drawn for one part say, near and far.
 * @param svg The drawing.
 * @param id The part.
 * @returns Every direction drawn in the groups of the part.
 */
function marksOf(svg: string, id: string): string[] {
	return svg
		.split("data-semantic-id=" + JSON.stringify(id))
		.slice(1)
		.map((group) => group.split("data-semantic-id=")[0]!)
		.flatMap((group) => [...group.matchAll(/data-drill=.([a-z]+)/gu)].map(([, way]) => way!));
}

for (const grammar of ["architecture", "sequence"] satisfies DiagramGrammar[]) {
	test(
		grammar + " marks each part that opens a board with the way it lies, and draws its name whole",
		async () => {
			const { svg } = await renderSemanticView({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				grammar,
				theme: "light",
				level: "service",
			});
			const near = drawnTexts(svg);
			for (const { id, name, drill } of PARTS) {
				const marks = marksOf(svg, id);
				if (drill === undefined) expect(marks).toEqual([]);
				else expect(marks).toEqual([drill, drill]);
				const title = near.filter((run) => run.subject.id === id && run.weight !== 400);
				expect(title.map((run) => run.text).join(" ")).toBe(name);
			}
		},
	);
}

/** Each part that opens a board, on a small card and on a large one. */
const SIZED = PARTS.filter(({ drill }) => drill !== undefined).flatMap(({ id, name, kind }) => [
	{ id, name: kind, kind },
	{
		id: id + "2",
		name,
		kind,
		responsibility: "Says enough about what it is responsible for to take more than one line",
	},
]);

/** Those parts in a frame that opens a board too, asked along in order. */
const FRAMED = orderedFixture({
	nodes: [
		{ id: "frame", name: "What they make up", kind: "system", drillDown: OPENS },
		...SIZED.map((part) => ({ ...part, drillDown: OPENS, parent: "frame" })),
	],
	flows: [
		{
			id: "f",
			name: "Asked along",
			participants: SIZED.map(({ id }) => id),
			steps: SIZED.slice(1).map(({ id }, index) => ({
				id: "s" + String(index),
				from: SIZED[index]!.id,
				to: id,
				label: "asks",
				kind: "sync",
			})),
		},
	],
});

/** The mark a part draws in one view: its centre, and how far the ink of its ring reaches. */
interface Ring extends DrawnPoint {
	readonly reach: number;
}

const RING =
	/class="ab-drill"[^>]*transform="translate\((-?[\d.]+),(-?[\d.]+)\)(?: scale\(([\d.]+)\))?"><circle r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/u;

/** The warning badge: a translated group whose first shape is its triangle. */
const BADGE =
	/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)" pointer-events="none"><path d="M(-?[\d.]+),(-?[\d.]+) L(-?[\d.]+),(-?[\d.]+) H(-?[\d.]+) Z"/u;

/** A card's own box, or a frame's: the first shape that is not its halo. */
const BOX = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/u;
/** A slab's body: its whole box, drawn first at a card's corner radius. */
const SLAB = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="8"/u;

/**
 * The mark a subject draws in one view, if it draws one there. The near view
 * comes before the far view in a subject's markup.
 * @param group The subject group.
 * @param view Which view.
 * @returns Its ring, or undefined.
 */
function ringOf(group: DrawnGroup, view: "near" | "far"): Ring | undefined {
	const markup = group.markup.split('class="ab-far"')[view === "near" ? 0 : 1];
	const found = markup === undefined ? null : RING.exec(markup);
	if (found === null) return undefined;
	const [x, y, scale, radius, stroke] = found.slice(1).map((value) => Number(value ?? 1));
	return { x: x!, y: y!, reach: scale! * (radius! + stroke! / 2) };
}

/**
 * The corners of a subject's warning badge, closed, if it wears one.
 * @param group The subject group.
 * @returns The triangle's outline, or undefined.
 */
function badgeOf(group: DrawnGroup): DrawnPoint[] | undefined {
	const found = BADGE.exec(group.markup);
	if (found === null) return undefined;
	const [x, y, apexX, apexY, rightX, baseY, leftX] = found.slice(1).map(Number);
	const apex = { x: x! + apexX!, y: y! + apexY! };
	return [apex, { x: x! + rightX!, y: y! + baseY! }, { x: x! + leftX!, y: y! + baseY! }, apex];
}

/**
 * The box a subject's corner marks belong to: a card's own, or a frame's
 * header slab, the slab its name stands on.
 * @param groups Every subject group of the drawing.
 * @param group The subject group that draws the marks.
 * @returns The box.
 */
function boxOf(groups: readonly DrawnGroup[], group: DrawnGroup): DiagramBox {
	const header = /^<g[^>]*data-semantic-part="header"/u.test(group.markup);
	const body = header
		? groups.find((one) => one.kind === group.kind && one.id === group.id && one !== group)
		: group;
	const [x, y, width, height] = (header ? SLAB : BOX).exec(body!.markup)!.slice(1).map(Number);
	return { x: x!, y: y!, width: width!, height: height! };
}

/** Each grammar, and for an architecture each engine that lays it out. */
const DRAWINGS: readonly (readonly [DiagramGrammar, LayoutEngineName | undefined])[] = [
	["architecture", "track"],
	["architecture", "blocks"],
	["sequence", undefined],
];

for (const [grammar, layout] of DRAWINGS) {
	test(`${[grammar, layout].filter(Boolean).join(" ")} keeps each mark at one centre near and far, on its card and clear of the warning badge`, async () => {
		const parts = SIZED.map(({ id }) => id);
		const drilled = grammar === "architecture" ? [...parts, "frame"] : parts;
		const drawings = await Promise.all(
			[[], [...parts, "frame"]].map(async (unsettled) => {
				const { svg } = await renderSemanticView({
					policy: DEFAULT_SEMANTIC_POLICY,
					content: FRAMED,
					grammar,
					theme: "light",
					level: "service",
					layout,
					unsettled,
				});
				return { unsettled, svg };
			}),
		);
		for (const { unsettled, svg } of drawings) {
			const groups = subjectGroups(svg);
			const marked = groups.flatMap((group) => {
				const near = ringOf(group, "near");
				const far = ringOf(group, "far");
				return near === undefined && far === undefined ? [] : [{ group, near, far }];
			});
			expect(marked.map(({ group }) => group.id).toSorted()).toEqual(drilled.toSorted());
			for (const { group, near, far } of marked) {
				const box = boxOf(groups, group);
				const where = `${group.id}, ${unsettled.length === 0 ? "settled" : "unsettled"}`;
				expect(near, where).toBeDefined();
				expect(far, where).toBeDefined();
				// One centre in both views, so the swap between them does not move
				// the mark, and as far in from the top edge as from the right edge.
				expect(far!.x, where).toBeCloseTo(near!.x, 2);
				expect(far!.y, where).toBeCloseTo(near!.y, 2);
				expect(box.x + box.width - near!.x, where).toBeCloseTo(near!.y - box.y, 2);
				const badge = badgeOf(group);
				expect(badge !== undefined, where).toBe(unsettled.length > 0);
				for (const ring of [near!, far!]) {
					expect(ring.x - ring.reach, where).toBeGreaterThanOrEqual(box.x);
					expect(ring.x + ring.reach, where).toBeLessThanOrEqual(box.x + box.width);
					expect(ring.y - ring.reach, where).toBeGreaterThanOrEqual(box.y);
					expect(ring.y + ring.reach, where).toBeLessThanOrEqual(box.y + box.height);
					// Further from the triangle's outline than its ink reaches, the ring
					// neither crosses the badge nor holds it. It cannot sit inside the
					// badge, which is smaller than the ring.
					const centre = { x: ring.x, y: ring.y, width: 0, height: 0 };
					if (badge !== undefined) {
						expect(distanceToRoute(centre, badge), where).toBeGreaterThan(ring.reach);
					}
				}
			}
		}
	});
}

test("an architecture keeps a frame's far name clear of its far mark", async () => {
	const { svg } = await renderSemanticView({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture({
			nodes: [
				{
					id: "frame",
					name: "the frame that holds every part of the board store",
					kind: "system",
					drillDown: OPENS,
				},
				{
					id: "part",
					name: "Part",
					kind: "service",
					parent: "frame",
					responsibility:
						"Keeps every write it answers on disk before it answers, and tells each watcher once",
				},
			],
		}),
		grammar: "architecture",
		theme: "light",
		level: "service",
	});
	const ring = subjectGroups(svg)
		.filter(({ id }) => id === "frame")
		.map((group) => ringOf(group, "far"))
		.find((found) => found !== undefined)!;
	const shift = bodyShift(svg);
	const faces = registeredFaces(svg);
	const name = drawnTexts(svg, "far").filter(({ subject }) => subject.id === "frame");
	expect(name.length).toBeGreaterThan(0);
	for (const line of name) {
		expect(drawnSpan(line, faces).right, line.text).toBeLessThan(shift.x + ring.x - ring.reach);
	}
});
