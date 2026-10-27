import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { describe, expect, test } from "bun:test";
import { LayoutEngineSchema, type LayoutEngineName } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { type StatedStandings } from "#shared/protocol/render-request.ts";
import {
	groupOf,
	markShape,
	strokesOf,
	subjectGroups,
	withoutColour,
	withoutMark,
	type DrawnGroup,
} from "#tests/runtime/support/drawn-subjects.ts";
import {
	SEQUENCE_STANDING,
	STANDINGS,
	drawnSequence,
	subject,
} from "#tests/runtime/support/sequence-fixture.ts";
import { colourIn, paintedIn } from "#tests/runtime/support/drawn-colours.ts";
import { arrangementOf } from "#tests/runtime/support/drawn-atlas.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * One architecture, as its own contract reads it.
 * @param nodes The nodes.
 * @param edges The relationships between them.
 * @returns The content.
 */
function architecture(nodes: readonly unknown[], edges: readonly unknown[] = []): VariantContent {
	return orderedFixture({ nodes, edges });
}

const PROPOSAL: VariantContent = architecture(
	[
		{ id: "edge", name: "Edge", kind: "service", responsibility: "Public entry points" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{ id: "web", name: "Operator Console", kind: "ui", parent: "edge" },
		{ id: "core", name: "Board Runtime", kind: "service" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "core" },
		{ id: "legacy", name: "Legacy Bridge", kind: "module", parent: "core" },
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
 * The ink this document's selection ring lights up in, in one theme.
 * @param svg The drawn document.
 * @param theme The theme it is shown in.
 * @returns The colour.
 */
function selectionInk(svg: string, theme: "light" | "dark"): string {
	return colourIn(/\.is-selected \.ab-halo\{[^}]*stroke:([^;}]+)/.exec(svg)![1]!, theme);
}

/**
 * Draw the architecture, with or without a statement of how it stands.
 * @param standing What the caller says, when it says anything.
 * @returns The rendered architecture.
 */
function drawn(standing?: StatedStandings, layout?: LayoutEngineName): Promise<RenderedDiagram> {
	return renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: PROPOSAL,
		standing,
		layout,
	});
}

describe("a picture nobody stated a standing for", () => {
	test("is drawn exactly as it was before standings existed", async () => {
		// The whole proof that adding comparison to the renderer left a plain board
		// alone: the two spellings of "say nothing" agree, and nothing a standing
		// can put on the page appears anywhere in the document.
		expect((await drawn()).svg).toBe((await drawn(undefined)).svg);
		expect((await drawn()).svg).not.toContain("data-semantic-standing");
		expect((await drawnSequence()).svg).not.toContain("data-semantic-standing");

		// And every subject is still there to be selected, unlabelled.
		const groups = subjectGroups((await drawn()).svg);
		expect(groups.length).toBeGreaterThan(10);
		for (const group of groups) {
			expect(group.standing).toBeUndefined();
			expect(group.opacity).toBeUndefined();
		}
	});

	test("keeps this simple fixture's cards stable with comparison marks", async () => {
		const shared = orderedFixture({
			...PROPOSAL,
			edges: [
				...PROPOSAL.edges,
				{ id: "e6", from: "gw", to: "legacy", kind: "call", order: 6000 },
			].map((edge) => Object.assign({}, edge, { emphasis: "normal" })),
		});
		const plain = arrangementOf(
			await renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: shared }),
		);
		const compared = arrangementOf(
			await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content: shared,
				standing: STANDING,
			}),
		);
		expect(compared.atlas.nodes).toEqual(plain.atlas.nodes);
		expect(compared.atlas.regions).toEqual(plain.atlas.regions);

		const sequence = arrangementOf(await drawnSequence());
		const comparedSequence = arrangementOf(await drawnSequence(SEQUENCE_STANDING));
		expect(comparedSequence).toEqual(sequence);
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

		expect(gone.opacity).toBeUndefined();
		expect(gone.markup).toContain("stroke-dasharray");
		expect(kept.markup).not.toContain("stroke-dasharray");
		for (const group of subjectGroups(rendered.svg)) {
			const line = group.kind === "edge" && !group.markup.includes('data-semantic-part="label"');
			expect(group.opacity === undefined).toBe(!(line && group.standing === "removed"));
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

		// A swipe wider than the line, painted underneath it. The selection
		// ring remains independent and may be wider than the swipe.
		expect(marked.length).toBe(bare.length + 1);
		expect(marked[0]!.at).toBeLessThan(marked[1]!.at);
		expect(marked[0]!.width).toBeGreaterThan(line.width);

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
		}
		// The route is ghosted whole; the label is a chip that lost its
		// thickness, its words faded on a flat face in a dashed footprint.
		const words = drawnGroups.find((group) => group.markup.includes("writes"))!;
		const route = drawnGroups.find((group) => group !== words)!;
		expect(route.opacity).toBeGreaterThan(0);
		expect(route.opacity).toBeLessThan(1);
		expect(words.opacity).toBeUndefined();
		expect(words.markup).toContain("stroke-dasharray");
		const unmarked = subjectGroups((await drawn({ e4: "unchanged" })).svg).find(
			(group) => group.kind === "edge" && group.id === "e4" && group.markup.includes("writes"),
		)!;
		expect(withoutColour(words)).not.toBe(withoutColour(unmarked));
	});

	test.each(LayoutEngineSchema.options)(
		"one picture draws its standings in each theme's own ink (%s)",
		async (layout) => {
			const rendered = await drawn(STANDING, layout);
			for (const standing of ["added", "removed", "changed"]) {
				expect(rendered.svg).toContain(`data-semantic-standing="${standing}"`);
			}
			// Each theme paints its standings in its own ink, and neither reaches for the
			// ring a viewer already uses to mean "this is what you have selected".
			const inks = (["light", "dark"] as const).map((theme) => {
				const queue = groupOf(paintedIn(rendered.svg, theme), "node", "queue");
				expect(queue, `queue was not drawn in ${theme}`).toBeDefined();
				const mark = markInk(queue!);
				expect(mark).toBeDefined();
				expect(mark).not.toBe(selectionInk(rendered.svg, theme));
				return mark;
			});
			expect(inks[0]).not.toBe(inks[1]);
		},
	);
});
