import { describe, expect, test } from "bun:test";
import type { DiagramTheme } from "@/shared/semantic-board/index";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import {
	renderArchitecture,
	renderDataFlow,
	type RenderedDiagram,
	type StatedStandings,
} from "@/runtime/semantic-renderer/index";
import {
	groupOf,
	markShape,
	strokesOf,
	subjectGroups,
	withoutColour,
	withoutMark,
	type DrawnGroup,
} from "@/runtime/semantic-renderer/tests/drawn-subjects";

/**
 * One architecture, as its own contract reads it.
 * @param nodes The nodes.
 * @param edges The relationships between them.
 * @returns The content.
 */
function architecture(nodes: readonly unknown[], edges: readonly unknown[] = []): VariantContent {
	return VariantContentSchema.parse({ nodes, edges });
}

const PROPOSAL: VariantContent = architecture(
	[
		{ id: "edge", name: "Edge", kind: "service", responsibility: "Public entry points" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{ id: "web", name: "Operator Console", kind: "ui", parent: "edge" },
		{ id: "core", name: "Board Runtime", kind: "service" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "core" },
		{ id: "legacy", name: "Excalidraw Bridge", kind: "module", parent: "core" },
		{ id: "store", name: "Vault", kind: "datastore" },
	],
	[
		{ id: "e1", from: "web", to: "gw", kind: "http", label: "REST", emphasis: "normal" },
		{ id: "e2", from: "gw", to: "io", kind: "call", label: "read board", emphasis: "hero" },
		{ id: "e3", from: "gw", to: "queue", kind: "event", label: "enqueue", emphasis: "normal" },
		{ id: "e4", from: "legacy", to: "store", kind: "data", label: "writes", emphasis: "muted" },
		{ id: "e5", from: "io", to: "store", kind: "data", emphasis: "hero" },
	],
);

/** One standing for every shape of subject the architecture grammar draws. */
const STANDING: StatedStandings = {
	queue: "added",
	e3: "added",
	io: "changed",
	e2: "changed",
	legacy: "removed",
	e4: "removed",
	core: "changed",
	edge: "removed",
};

const SEQUENCE: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "web", name: "Operator Console", kind: "ui" },
		{ id: "gw", name: "API Gateway", kind: "route" },
		{ id: "io", name: "board-io", kind: "module" },
		{ id: "legacy", name: "Excalidraw Bridge", kind: "module" },
	],
	edges: [],
	flows: [
		{
			id: "f1",
			name: "Agent edit",
			summary: "One write, start to finish",
			participants: ["web", "gw", "io", "legacy"],
			steps: [
				{ id: "s1", from: "web", to: "gw", label: "edit", kind: "sync" },
				{ id: "s2", from: "gw", to: "io", label: "claim", kind: "sync" },
				{ id: "s3", from: "gw", to: "legacy", label: "mirror", kind: "async" },
				{ id: "s4", from: "io", to: "gw", label: "version", kind: "return" },
			],
		},
	],
});

/** The same four cases again, over the sequence grammar's own subjects. */
const SEQUENCE_STANDING: StatedStandings = {
	s2: "added",
	s4: "changed",
	s3: "removed",
	legacy: "removed",
	io: "added",
	f1: "changed",
};

/** Every way a subject can stand. */
const STANDINGS = ["added", "removed", "changed", "unchanged"] as const;

/**
 * One node, drawn with nothing else on the board standing for anything.
 * @param standing How that node stands.
 * @returns Its drawn group.
 */
async function card(standing: (typeof STANDINGS)[number]): Promise<DrawnGroup> {
	return subject(await drawn({ legacy: standing }), "node", "legacy");
}

/**
 * The ink one subject's standing pin is filled with.
 * @param group The subject group.
 * @returns The colour, or undefined when nothing pinned it.
 */
function markInk(group: DrawnGroup): string | undefined {
	return /<circle [^>]*fill="(#[0-9a-f]{6})"/.exec(group.markup)?.[1];
}

/**
 * The ink this document's selection ring lights up in.
 * @param svg The drawn document.
 * @returns The colour.
 */
function selectionInk(svg: string): string {
	return /\.is-selected \.ab-halo\{[^}]*stroke:(#[0-9a-f]{6})/.exec(svg)![1]!;
}

/**
 * Draw the architecture, with or without a statement of how it stands.
 * @param standing What the caller says, when it says anything.
 * @param theme Which ground to draw it on.
 * @returns The rendered architecture.
 */
function drawn(
	standing?: StatedStandings,
	theme: DiagramTheme = "light",
): Promise<RenderedDiagram> {
	return renderArchitecture({ content: PROPOSAL, theme, standing });
}

/**
 * Draw the sequence, with or without a statement of how it stands.
 * @param standing What the caller says, when it says anything.
 * @param theme Which ground to draw it on.
 * @returns The rendered sequence.
 */
function drawnSequence(standing?: StatedStandings, theme: DiagramTheme = "light"): RenderedDiagram {
	return renderDataFlow({ content: SEQUENCE, theme, standing });
}

/**
 * One subject's group, insisting it was drawn at all.
 * @param rendered The rendered picture.
 * @param kind What sort of subject.
 * @param id Its semantic id.
 * @returns The group.
 */
function subject(rendered: RenderedDiagram, kind: string, id: string): DrawnGroup {
	const group = groupOf(rendered.svg, kind, id);
	expect(group, `${kind} ${id} was not drawn`).toBeDefined();
	return group!;
}

describe("a picture nobody stated a standing for", () => {
	test("is drawn exactly as it was before standings existed", async () => {
		// The whole proof that adding comparison to the renderer left a plain board
		// alone: the two spellings of "say nothing" agree, and nothing a standing
		// can put on the page appears anywhere in the document.
		expect((await drawn()).svg).toBe((await drawn(undefined)).svg);
		expect((await drawn()).svg).not.toContain("data-semantic-standing");
		expect(drawnSequence().svg).not.toContain("data-semantic-standing");

		// And every subject is still there to be selected, unlabelled.
		const groups = subjectGroups((await drawn()).svg);
		expect(groups.length).toBeGreaterThan(10);
		for (const group of groups) {
			expect(group.standing).toBeUndefined();
			expect(group.opacity).toBeUndefined();
		}
	});

	test("is the same picture, to the unit, as the same content stated against a predecessor", async () => {
		// A standing changes how a subject is painted and never where it is. A pane
		// hit-tests one atlas whichever of the two it was given.
		const plain = await drawn();
		const compared = await drawn(STANDING);
		expect(compared.width).toBe(plain.width);
		expect(compared.height).toBe(plain.height);
		expect(compared.atlas).toEqual(plain.atlas);

		const sequence = drawnSequence();
		const comparedSequence = drawnSequence(SEQUENCE_STANDING);
		expect(comparedSequence.width).toBe(sequence.width);
		expect(comparedSequence.height).toBe(sequence.height);
		expect(comparedSequence.atlas).toEqual(sequence.atlas);
	});
});

describe("a stated standing on an architecture", () => {
	test("marks the subject it names and no other", async () => {
		const rendered = await drawn(STANDING);

		expect(subject(rendered, "node", "queue").standing).toBe("added");
		expect(subject(rendered, "node", "io").standing).toBe("changed");
		expect(subject(rendered, "node", "legacy").standing).toBe("removed");
		expect(subject(rendered, "edge", "e3").standing).toBe("added");
		expect(subject(rendered, "edge", "e2").standing).toBe("changed");
		expect(subject(rendered, "edge", "e4").standing).toBe("removed");
		expect(subject(rendered, "region", "core").standing).toBe("changed");
		expect(subject(rendered, "region", "edge").standing).toBe("removed");

		// Named by nobody, so unchanged — not absent, and not something else.
		expect(subject(rendered, "node", "gw").standing).toBe("unchanged");
		expect(subject(rendered, "edge", "e1").standing).toBe("unchanged");
		expect(subject(rendered, "node", "store").standing).toBe("unchanged");
	});

	test("says how every drawn subject stands, so a viewer can select on any of them", async () => {
		const groups = subjectGroups((await drawn(STANDING)).svg);
		expect(groups.length).toBeGreaterThan(10);
		for (const group of groups) {
			expect(STANDINGS.some((one) => one === group.standing)).toBe(true);
		}
		// A selector a stylesheet or a browser test can actually write.
		for (const standing of ["added", "removed", "changed", "unchanged"]) {
			expect((await drawn(STANDING)).svg).toContain(`data-semantic-standing="${standing}"`);
		}
	});

	test("draws a removed subject as something that is not on the proposal", async () => {
		const rendered = await drawn(STANDING);
		const gone = subject(rendered, "node", "legacy");
		const kept = subject(rendered, "node", "gw");

		// Ghosted, so it reads as context rather than as part of the design, and
		// only it is: everything the proposal actually holds stays at full strength.
		expect(gone.opacity).toBeGreaterThan(0);
		expect(gone.opacity).toBeLessThan(1);
		expect(kept.opacity).toBeUndefined();
		for (const group of subjectGroups(rendered.svg)) {
			expect(group.opacity === undefined).toBe(group.standing !== "removed");
		}

		// And it is distinguishable from an unchanged subject with the colour taken
		// away, which is the only test a reader who cannot tell red from green can
		// run on it.
		expect(withoutColour(gone)).not.toBe(withoutColour(kept));
	});

	test("tells its four standings apart without relying on colour", async () => {
		// The same card, drawn four ways. Spend every hue and the four drawings are
		// still four different drawings.
		const cards = await Promise.all(STANDINGS.map(card));
		expect(new Set(cards.map(withoutColour)).size).toBe(4);
	});

	test("gives each standing a mark of its own shape, not of its own colour alone", async () => {
		const shapes = (
			await Promise.all(STANDINGS.filter((one) => one !== "unchanged").map(card))
		).map((drawnCard) => markShape(drawnCard));
		for (const shape of shapes) {
			expect(shape).toBeDefined();
		}
		expect(new Set(shapes).size).toBe(3);
		// Most of a proposal is unchanged, and a mark on all of it would mark none.
		expect(markShape(await card("unchanged"))).toBeUndefined();
	});

	test("says the standing again in the subject's own outline, so the mark is not alone", async () => {
		// Take the mark away entirely and the four drawings are still four: the
		// outline's texture and weight, and the ghosting, each say it over again.
		// A reader who misses the small thing in the corner still sees which is
		// which from across the room.
		const cards = await Promise.all(STANDINGS.map(card));
		expect(new Set(cards.map(withoutMark)).size).toBe(4);
	});

	test("marks a relationship beside its line rather than over what the line already says", async () => {
		const rendered = await drawn(STANDING);
		const changed = subject(rendered, "edge", "e2");
		const plain = subject(await drawn(), "edge", "e2");

		const marked = strokesOf(changed);
		const bare = strokesOf(plain);
		const line = bare.at(-1)!;

		// A swipe, first and widest, so it passes under both the line and the
		// selection ring rather than through them.
		expect(marked.length).toBe(bare.length + 1);
		expect(marked[0]!.at).toBeLessThan(marked[1]!.at);
		expect(marked[0]!.width).toBeGreaterThan(Math.max(...bare.map((one) => one.width)));

		// And the line itself is untouched: its weight still says how much attention
		// its author asked for, its dash still says what sort of relationship it is.
		const drawnLine = marked.at(-1)!;
		expect(drawnLine.width).toBe(line.width);
		expect(drawnLine.dash).toBe(line.dash);
	});

	test("marks a relationship's label along with its line", async () => {
		const rendered = await drawn(STANDING);
		// A relationship is drawn as two groups — its route, and the words it says
		// on the layer above every route — and both of them say they are that
		// relationship and how it stands. So the words carry the standing and a
		// click on them selects it, exactly as a click on the line does.
		const drawnGroups = subjectGroups(rendered.svg).filter(
			(group) => group.kind === "edge" && group.id === "e4",
		);
		expect(drawnGroups).toHaveLength(2);
		expect(drawnGroups.filter((group) => group.markup.includes("writes"))).toHaveLength(1);
		for (const group of drawnGroups) {
			expect(group.standing).toBe("removed");
			expect(group.opacity).toBe(0.5);
		}
		const words = drawnGroups.find((group) => group.markup.includes("writes"))!;
		const unmarked = subjectGroups((await drawn({ e4: "unchanged" })).svg).find(
			(group) => group.kind === "edge" && group.id === "e4" && group.markup.includes("writes"),
		)!;
		expect(withoutColour(words)).not.toBe(withoutColour(unmarked));
	});

	test("draws the same standings on both grounds without moving anything", async () => {
		const light = await drawn(STANDING, "light");
		const dark = await drawn(STANDING, "dark");

		expect(dark.svg).not.toBe(light.svg);
		expect(dark.atlas).toEqual(light.atlas);
		for (const standing of ["added", "removed", "changed"]) {
			expect(dark.svg).toContain(`data-semantic-standing="${standing}"`);
		}
		// Each theme paints its standings in its own ink, and neither reaches for the
		// ring a viewer already uses to mean "this is what you have selected".
		for (const rendered of [light, dark]) {
			const mark = markInk(subject(rendered, "node", "queue"));
			expect(mark).toBeDefined();
			expect(mark).not.toBe(selectionInk(rendered.svg));
		}
		expect(markInk(subject(light, "node", "queue"))).not.toBe(
			markInk(subject(dark, "node", "queue")),
		);
	});
});

describe("a stated standing on a sequence", () => {
	test("marks steps, participants and the flow that holds them", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);

		expect(subject(rendered, "step", "s2").standing).toBe("added");
		expect(subject(rendered, "step", "s4").standing).toBe("changed");
		expect(subject(rendered, "step", "s3").standing).toBe("removed");
		expect(subject(rendered, "node", "io").standing).toBe("added");
		expect(subject(rendered, "node", "legacy").standing).toBe("removed");
		expect(subject(rendered, "flow", "f1").standing).toBe("changed");
		expect(subject(rendered, "step", "s1").standing).toBe("unchanged");

		for (const group of subjectGroups(rendered.svg)) {
			expect(STANDINGS.some((one) => one === group.standing)).toBe(true);
		}
	});

	test("draws a removed step as absent from the exchange", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);
		const gone = subject(rendered, "step", "s3");
		const kept = subject(rendered, "step", "s1");

		expect(gone.opacity).toBeGreaterThan(0);
		expect(gone.opacity).toBeLessThan(1);
		expect(kept.opacity).toBeUndefined();
		expect(withoutColour(gone)).not.toBe(withoutColour(kept));

		// The same swipe the architecture grammar uses, under the same kind of line.
		expect(strokesOf(gone).length).toBe(
			strokesOf(subject(drawnSequence(), "step", "s3")).length + 1,
		);
	});

	test("draws a removed participant as absent down the whole column, not only at its card", () => {
		const rendered = drawnSequence(SEQUENCE_STANDING);
		// A participant is drawn twice: the card at the head of the column, and the
		// column of time under it. Both are the same subject, so both say so.
		const both = subjectGroups(rendered.svg).filter(
			(group) => group.kind === "node" && group.id === "legacy",
		);
		expect(both).toHaveLength(2);
		for (const group of both) {
			expect(group.standing).toBe("removed");
			expect(group.opacity).toBeGreaterThan(0);
			expect(group.opacity).toBeLessThan(1);
		}

		// And the column reads differently from a participant that stayed, with the
		// colour spent.
		const lifelines = (standing: StatedStandings): string =>
			withoutColour(
				subjectGroups(drawnSequence(standing).svg).find(
					(group) =>
						group.kind === "node" && group.id === "legacy" && group.markup.includes("<line"),
				)!,
			);
		expect(lifelines(SEQUENCE_STANDING)).not.toBe(lifelines({ legacy: "unchanged" }));
	});

	test("tells its four standings apart without relying on colour", () => {
		// A message has no outline to take over and no corner to pin, so the whole
		// of its standing is the swipe under it — which therefore has to carry all
		// four on its own, in texture and lightness rather than in hue.
		const steps = STANDINGS.map((one) =>
			withoutColour(subject(drawnSequence({ s3: one }), "step", "s3")),
		);
		expect(new Set(steps).size).toBe(4);
	});
});
