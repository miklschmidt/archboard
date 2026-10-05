// A part that opens another board is marked with which way that board lies,
// read from the part's kind against the level of the board drawn (ADR 0029),
// and the mark takes room beside the name without cutting it.
//
// What is guarded: the direction each part's mark says, in both grammars and
// near and far alike, and a name drawn whole beside its mark. A participant of
// a sequence once kept the room for the mark only when it was painted, so a
// name its card had been widened to hold was cut with an ellipsis. And the mark
// drawn from far away stays on its card and clear of the warning badge in the
// same corner: it once stood a radius and a half from the corner whatever the
// corner held, so the badge of an unsettled part sat inside its ring.
import { expect, test } from "bun:test";
import type { DiagramBox, DiagramGrammar } from "@/shared/semantic-board/index";
import { renderSemanticView } from "@/runtime/semantic-renderer/index";
import { distanceToRoute, type DrawnPoint } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { subjectGroups, type DrawnGroup } from "@/runtime/semantic-renderer/tests/drawn-subjects";
import { drawnTexts } from "@/runtime/semantic-renderer/tests/drawn-text";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";

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

for (const grammar of ["architecture", "data-flow"] satisfies DiagramGrammar[]) {
	test(
		grammar + " marks each part that opens a board with the way it lies, and draws its name whole",
		async () => {
			const { svg } = await renderSemanticView({
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

/** The mark a part draws from far away: its centre, and how far the ink of its ring reaches. */
interface FarRing extends DrawnPoint {
	readonly reach: number;
}

const FAR_RING =
	/class="ab-drill"[^>]*transform="translate\((-?[\d.]+),(-?[\d.]+)\)(?: scale\(([\d.]+)\))?"><circle r="([\d.]+)"[^>]*stroke-width="([\d.]+)"/u;

/** The warning badge: a translated group whose first shape is its triangle. */
const BADGE =
	/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)" pointer-events="none"><path d="M(-?[\d.]+),(-?[\d.]+) L(-?[\d.]+),(-?[\d.]+) H(-?[\d.]+) Z"/u;

/** A card's own box, or a frame's: the first shape that is not its halo. */
const BOX = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/u;

/**
 * The mark a subject draws from far away, if it draws one.
 * @param group The subject group.
 * @returns Its ring, or undefined.
 */
function farRingOf(group: DrawnGroup): FarRing | undefined {
	const far = group.markup.split('class="ab-far"')[1];
	const found = far === undefined ? null : FAR_RING.exec(far);
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
 * header, which runs from the frame's top to the rule under its name.
 * @param groups Every subject group of the drawing.
 * @param group The subject group that draws the marks.
 * @returns The box.
 */
function boxOf(groups: readonly DrawnGroup[], group: DrawnGroup): DiagramBox {
	const header = /^<g[^>]*data-semantic-part="header"/u.test(group.markup);
	const body = header
		? groups.find((one) => one.kind === group.kind && one.id === group.id && one !== group)
		: group;
	const [x, y, width, height] = BOX.exec(body!.markup)!.slice(1).map(Number);
	const bottom = header
		? Number(/<line [^>]*y1="(-?[\d.]+)"/u.exec(body!.markup)![1])
		: y! + height!;
	return { x: x!, y: y!, width: width!, height: bottom - y! };
}

for (const grammar of ["architecture", "data-flow"] satisfies DiagramGrammar[]) {
	test(grammar + " keeps each far mark on its card and clear of the warning badge", async () => {
		const parts = SIZED.map(({ id }) => id);
		const drilled = grammar === "architecture" ? [...parts, "frame"] : parts;
		const drawings = await Promise.all(
			[[], [...parts, "frame"]].map(async (unsettled) => {
				const { svg } = await renderSemanticView({
					content: FRAMED,
					grammar,
					theme: "light",
					level: "service",
					unsettled,
				});
				return { unsettled, svg };
			}),
		);
		for (const { unsettled, svg } of drawings) {
			const groups = subjectGroups(svg);
			const marked = groups.flatMap((group) => {
				const ring = farRingOf(group);
				return ring === undefined ? [] : [{ group, ring }];
			});
			expect(marked.map(({ group }) => group.id).toSorted()).toEqual(drilled.toSorted());
			for (const { group, ring } of marked) {
				const box = boxOf(groups, group);
				const where = `${group.id}, ${unsettled.length === 0 ? "settled" : "unsettled"}`;
				expect(ring.x - ring.reach, where).toBeGreaterThanOrEqual(box.x);
				expect(ring.x + ring.reach, where).toBeLessThanOrEqual(box.x + box.width);
				expect(ring.y - ring.reach, where).toBeGreaterThanOrEqual(box.y);
				expect(ring.y + ring.reach, where).toBeLessThanOrEqual(box.y + box.height);
				const badge = badgeOf(group);
				expect(badge !== undefined, where).toBe(unsettled.length > 0);
				// Further from the triangle's outline than its ink reaches, the ring
				// neither crosses the badge nor holds it. It cannot sit inside the
				// badge, which is smaller than the ring.
				const centre = { x: ring.x, y: ring.y, width: 0, height: 0 };
				if (badge !== undefined) {
					expect(distanceToRoute(centre, badge), where).toBeGreaterThan(ring.reach);
				}
			}
		}
	});
}
