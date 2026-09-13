// What a drawn board says about which parts belong together.
//
// A board could say what a part IS and what CONTAINS it, and nothing about what
// it is PART OF — so an architecture organised around efforts, teams or
// migrations could not be drawn as one. A node now states one group, and the
// picture answers it in the one place that was saying nothing useful: the icon
// on the card, which was the same grey on every card on every board.
//
// What these hold to is the split. The kind decides the silhouette and the group
// decides the colour, so both are legible at once; the colour is derived from
// the label and stored nowhere, so the same label is the same colour everywhere
// and retuning the palette cannot change what a board says; and nothing else in
// the picture takes a group's colour, because a card border already means how
// the node stands and a line already means what sort of relationship it is.

import { describe, expect, test } from "bun:test";
import {
	VariantContentSchema,
	type DiagramTheme,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { renderArchitecture, type RenderedDiagram } from "@/runtime/semantic-renderer/index";
import { groupOf, type DrawnGroup } from "@/runtime/semantic-renderer/tests/drawn-subjects";

/**
 * An architecture of four parts, grouped however the caller says.
 * @param groups What each node belongs to, by id; an id left out belongs to nothing.
 * @returns The content.
 */
function content(groups: Readonly<Record<string, string>> = {}): VariantContent {
	return VariantContentSchema.parse({
		nodes: [
			{ id: "gw", name: "API Gateway", kind: "route", ...spell(groups["gw"]) },
			{ id: "io", name: "board-io", kind: "module", ...spell(groups["io"]) },
			{ id: "pay", name: "Payments", kind: "service", ...spell(groups["pay"]) },
			{ id: "vault", name: "Vault", kind: "datastore", ...spell(groups["vault"]) },
		],
		edges: [{ id: "e1", from: "gw", to: "io", kind: "call" }],
	});
}

/**
 * One node's group, as a node states it or not at all.
 * @param group The label, when there is one.
 * @returns The field, or nothing.
 */
function spell(group: string | undefined): Record<string, string> {
	return group === undefined ? {} : { group };
}

/**
 * The picture of one grouping.
 * @param groups What each node belongs to.
 * @param theme Which ground to draw it on.
 * @returns The rendered architecture.
 */
function drawn(
	groups: Readonly<Record<string, string>> = {},
	theme: DiagramTheme = "light",
): Promise<RenderedDiagram> {
	return renderArchitecture({ content: content(groups), theme });
}

/**
 * One node's group, insisting it was drawn.
 * @param rendered The picture.
 * @param id The node's id.
 * @returns The group.
 */
function card(rendered: RenderedDiagram, id: string): DrawnGroup {
	const found = groupOf(rendered.svg, "node", id);
	expect(found, `node ${id} was not drawn`).toBeDefined();
	return found!;
}

/**
 * The ink one card's icon is drawn in.
 *
 * Read off the tile the glyph sits on, which is stroked and washed in the same
 * colour the glyph itself is.
 * @param group The card's group.
 * @returns The colour.
 */
function iconInk(group: DrawnGroup): string {
	const tile =
		/<rect [^>]*rx="5" fill="(#[0-9a-f]{6})" fill-opacity="[\d.]+" stroke="(#[0-9a-f]{6})"/.exec(
			group.markup,
		);
	expect(tile, `node ${group.id} drew no icon tile`).not.toBeNull();
	expect(tile![1]).toBe(tile![2]);
	return tile![1]!;
}

/**
 * The silhouette one card's glyph draws, with every colour spent.
 * @param group The card's group.
 * @returns The glyph's shapes.
 */
function iconShape(group: DrawnGroup): string {
	const glyph = /<g><(?:path|rect|circle|ellipse|text)[\s\S]*?<\/g>/.exec(group.markup);
	expect(glyph, `node ${group.id} drew no glyph`).not.toBeNull();
	return glyph![0].replace(/#[0-9a-f]{6}/gu, "#ink");
}

describe("a group is a colour and a kind is a shape", () => {
	test("two parts of one group share an ink, and a third part does not", async () => {
		const picture = await drawn({ gw: "payments", io: "payments", pay: "billing" });
		expect(iconInk(card(picture, "io"))).toBe(iconInk(card(picture, "gw")));
		expect(iconInk(card(picture, "pay"))).not.toBe(iconInk(card(picture, "gw")));
	});

	test("the same two parts keep their own shapes, which is what they are", async () => {
		const grouped = await drawn({ gw: "payments", io: "payments" });
		const plain = await drawn();
		// A route and a module are different things in the same effort: one colour
		// between them, two silhouettes.
		expect(iconShape(card(grouped, "gw"))).not.toBe(iconShape(card(grouped, "io")));
		// And grouping a node changes nothing about its shape.
		expect(iconShape(card(grouped, "gw"))).toBe(iconShape(card(plain, "gw")));
	});

	test("a part with no group is coloured by what it is", async () => {
		const plain = await drawn();
		// Every icon is coloured one way or the other — a page of grey chips says
		// nothing — and two kinds are not one colour.
		expect(iconInk(card(plain, "gw"))).not.toBe(iconInk(card(plain, "vault")));
		// The same kind, on a different board, is the same colour: the fallback is
		// derived from the kind exactly as a group is derived from its label.
		const other = await renderArchitecture({
			content: VariantContentSchema.parse({
				nodes: [{ id: "x1", name: "Something else", kind: "route" }],
			}),
			theme: "light",
		});
		expect(iconInk(card(other, "x1"))).toBe(iconInk(card(plain, "gw")));
	});

	test("stating a group overrides what the kind would have said", async () => {
		const plain = await drawn();
		const grouped = await drawn({ gw: "payments" });
		expect(iconInk(card(grouped, "gw"))).not.toBe(iconInk(card(plain, "gw")));
	});
});

describe("one label draws one colour, everywhere", () => {
	test("the same label survives spelling, order and neighbours", async () => {
		const one = await drawn({ gw: "Payments" });
		const two = await drawn({ io: "  payments  ", pay: "billing" });
		const three = await drawn({ vault: "PAYMENTS" });
		expect(iconInk(card(two, "io"))).toBe(iconInk(card(one, "gw")));
		expect(iconInk(card(three, "vault"))).toBe(iconInk(card(one, "gw")));
	});

	test("both grounds get a colour of their own, and neither borrows the other's", async () => {
		const light = await drawn({ gw: "payments" });
		const dark = await drawn({ gw: "payments" }, "dark");
		expect(iconInk(card(dark, "gw"))).not.toBe(iconInk(card(light, "gw")));
		// Two labels that differ on one ground differ on the other as well: a pair
		// is one hue picked twice, not two unrelated colours.
		const otherLight = await drawn({ gw: "billing" });
		const otherDark = await drawn({ gw: "billing" }, "dark");
		expect(iconInk(card(otherLight, "gw"))).not.toBe(iconInk(card(light, "gw")));
		expect(iconInk(card(otherDark, "gw"))).not.toBe(iconInk(card(dark, "gw")));
	});

	test("a group never lends its colour to a card, a border or a line", async () => {
		const picture = await drawn({
			gw: "payments",
			io: "payments",
			pay: "billing",
			vault: "storage",
		});
		const inks = new Set(["gw", "io", "pay", "vault"].map((id) => iconInk(card(picture, id))));
		for (const id of ["gw", "io", "pay", "vault"]) {
			const box = /<rect [^>]*rx="6"[^>]*fill="(#[0-9a-f]{6})" stroke="(#[0-9a-f]{6})"/.exec(
				card(picture, id).markup,
			)!;
			// The card's own ground and its own rule, on every card on the board.
			expect(inks.has(box[1]!)).toBe(false);
			expect(inks.has(box[2]!)).toBe(false);
		}
		const line = /<path [^>]*marker-end="[^"]*"[^>]*stroke="(#[0-9a-f]{6})"/.exec(
			groupOf(picture.svg, "edge", "e1")!.markup,
		)!;
		expect(inks.has(line[1]!)).toBe(false);
	});

	test("grouping moves nothing on the page", async () => {
		const plain = await drawn();
		const grouped = await drawn({ gw: "payments", io: "payments", pay: "billing" });
		expect(grouped.width).toBe(plain.width);
		expect(grouped.height).toBe(plain.height);
		expect(grouped.atlas).toEqual(plain.atlas);
	});
});
