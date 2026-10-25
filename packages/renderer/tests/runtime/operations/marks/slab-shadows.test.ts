// A card's shadow lies under every card, and it stands apart from the card's
// front edge (TASK-435). What this catches: a card's shadow drawn after a card,
// so it lies over that card's face or front edge, its own or a neighbour's; a
// container's header slab, which casts a card's shadow, drawn after a card; and
// a shadow under a card's foot as dark as the front edge, so the edge seems to
// run on into it, as the light ground's did.

import { expect, test } from "bun:test";

import { renderArchitecture, renderSemanticView } from "#runtime/operations/render.ts";
import { lightnessOf, paintedIn } from "#tests/runtime/support/drawn-colours.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { DiagramTheme } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** A container that holds two cards, and a card beside it, joined by labelled lines. */
const BOARD = orderedFixture({
	nodes: [
		{ id: "api", name: "Checkout API", kind: "service" },
		{ id: "route", name: "Place order", kind: "route", parent: "api" },
		{ id: "guard", name: "Timeout guard", kind: "module", parent: "api" },
		{ id: "db", name: "Orders DB", kind: "database" },
	],
	edges: [
		{ id: "starts", from: "route", to: "guard", kind: "call", label: "start the clock" },
		{ id: "writes", from: "route", to: "db", kind: "call", label: "write the order" },
	],
});

/** Three participants of one exchange. */
const EXCHANGE = orderedFixture({
	nodes: [
		{ id: "web", name: "Storefront", kind: "ui" },
		{ id: "app", name: "Shop app", kind: "service" },
		{ id: "db", name: "Orders DB", kind: "database" },
	],
	edges: [],
	flows: [
		{
			id: "f1",
			name: "Place an order",
			participants: ["web", "app", "db"],
			steps: [
				{ id: "s1", from: "web", to: "app", label: "place", kind: "sync" },
				{ id: "s2", from: "app", to: "db", label: "write", kind: "sync" },
				{ id: "s3", from: "app", to: "web", label: "placed", kind: "return" },
			],
		},
	],
});

/** One `<g>` start tag of a drawn document: where it starts, and its attributes. */
interface GroupTag {
	readonly at: number;
	readonly attributes: Readonly<Record<string, string>>;
}

/**
 * Every group start tag of a drawn document, in document order.
 * @param svg The drawn document.
 * @returns The tags.
 */
function groupTags(svg: string): GroupTag[] {
	return [...svg.matchAll(/<g(\s[^>]*)?>/gu)].map((match) => ({
		at: match.index,
		attributes: Object.fromEntries(
			[...(match[1] ?? "").matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, name, value]) => [
				name!,
				value!,
			]),
		),
	}));
}

/**
 * Where a drawing lays its cards and the shadows of its cards: a card is a
 * subject group of a node that is no part of one (not a lifeline, not a
 * container's header); a shadow is a group of the shadow class.
 * @param svg The drawn document.
 * @param cards The ids of the cards.
 * @returns Where each card's group starts, and each shadow's group with what it lists.
 */
function layers(
	svg: string,
	cards: readonly string[],
): { cardsAt: number[]; shadows: { at: number; members: string[] }[] } {
	const tags = groupTags(svg);
	const cardsAt = tags
		.filter(
			({ attributes }) =>
				attributes["data-semantic-kind"] === "node" &&
				cards.includes(attributes["data-semantic-id"] ?? "") &&
				attributes["data-semantic-part"] === undefined,
		)
		.map(({ at }) => at);
	const shadows = tags
		.filter(
			({ attributes }) =>
				attributes["class"] === "ab-shadow" && attributes["data-semantic-part"] === undefined,
		)
		.map(({ at, attributes }) => ({ at, members: (attributes["data-members"] ?? "").split(" ") }));
	return { cardsAt, shadows };
}

/**
 * Hold that each card casts one shadow and that every shadow lies under every card.
 * @param svg The drawn document.
 * @param cards The ids of the cards.
 */
function expectShadowsUnderCards(svg: string, cards: readonly string[]): void {
	const { cardsAt, shadows } = layers(svg, cards);
	expect(cardsAt).toHaveLength(cards.length);
	for (const card of cards) {
		expect(
			shadows.filter(({ members }) => members.includes(card)),
			card,
		).toHaveLength(1);
	}
	const firstCard = Math.min(...cardsAt);
	for (const shadow of shadows) expect(shadow.at).toBeLessThan(firstCard);
}

test.each(["track", "blocks"] as const)(
	"every card's shadow lies under every card on a board (%s)",
	async (layout) => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: BOARD,
			theme: "light",
			layout,
		});
		expectShadowsUnderCards(drawing.svg, ["route", "guard", "db"]);
		// A container's header slab casts a card's shadow, drawn in its frame: the
		// frame lies under every card too.
		const tags = groupTags(drawing.svg);
		const frame = tags.find(
			({ attributes }) =>
				attributes["data-semantic-id"] === "api" && attributes["data-semantic-part"] === undefined,
		)!;
		const { cardsAt } = layers(drawing.svg, ["route", "guard", "db"]);
		expect(frame.at).toBeLessThan(Math.min(...cardsAt));
	},
);

test("every participant's shadow lies under every participant of a sequence", async () => {
	const drawing = await renderSemanticView({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: EXCHANGE,
		grammar: "sequence",
	});
	expectShadowsUnderCards(drawing.svg, ["web", "app", "db"]);
});

/** One colour with its alpha, channels 0 to 255. */
interface Paint {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

/**
 * A resolved fill as channels, at the opacity its shape is drawn at.
 * @param tag A shape's start tag, painted in literals.
 * @returns Its paint.
 */
function paintOf(tag: string): Paint {
	const hex = /\sfill="(#[\da-f]{6,8})"/u.exec(tag)![1]!;
	const opacity = Number(/\sfill-opacity="([\d.]+)"/u.exec(tag)?.[1] ?? 1);
	const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
	const alpha = hex.length === 9 ? channel(7) / 255 : 1;
	return { r: channel(1), g: channel(3), b: channel(5), a: alpha * opacity };
}

/**
 * The fill of a shadow patch at a point, including the shared bottom gradient.
 * @param tag The shadow patch.
 * @param point Where the ink is measured.
 * @param svg The resolved drawing.
 * @returns The ink at the point.
 */
function shadowPaintAt(tag: string, point: { x: number; y: number }, svg: string): Paint {
	const gradient = /fill="url\(#([^)]*)\)"/u.exec(tag)?.[1];
	if (gradient === undefined) return paintOf(tag);
	const definition = new RegExp(
		`<linearGradient id="${gradient}"[^>]*>([\\s\\S]*?)</linearGradient>`,
		"u",
	).exec(svg)![1]!;
	const stops = [...definition.matchAll(/<stop [^>]*>/gu)].map(([stop]) => ({
		offset: Number(/offset="([\d.]+)"/u.exec(stop)?.[1] ?? 0),
		paint: paintOf(stop.replace("stop-color=", "fill=").replace("stop-opacity=", "fill-opacity=")),
	}));
	const box = boxOf(tag);
	const t = (point.y - box.y) / box.height;
	const reached = stops.findIndex(({ offset }) => offset >= t);
	const after = reached === -1 ? stops.length - 1 : reached;
	const low = stops[Math.max(0, after - 1)]!;
	const high = stops[after]!;
	const fraction = high.offset === low.offset ? 0 : (t - low.offset) / (high.offset - low.offset);
	return { ...low.paint, a: low.paint.a + fraction * (high.paint.a - low.paint.a) };
}

/**
 * A paint laid over an opaque colour.
 * @param top The paint.
 * @param under The colour under it.
 * @returns What a reader sees.
 */
function over(top: Paint, under: Paint): Paint {
	const mix = (one: number, other: number): number => one * top.a + other * (1 - top.a);
	return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 };
}

/**
 * A colour as a hex literal.
 * @param paint The colour.
 * @returns Its literal.
 */
function hexOf(paint: Paint): string {
	return `#${[paint.r, paint.g, paint.b].map((one) => Math.round(one).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A rect's box, from its start tag.
 * @param tag The start tag.
 * @returns Its box.
 */
function boxOf(tag: string): { x: number; y: number; width: number; height: number } {
	const read = (name: string): number =>
		Number(new RegExp(`\\s${name}="(-?[\\d.]+)"`, "u").exec(tag)![1]);
	return { x: read("x"), y: read("y"), width: read("width"), height: read("height") };
}

/**
 * How far apart two colours' lightness must be for a reader to see where one
 * ends. On the light ground the contact shadow was once within a hundredth of
 * the front edge's lightness and only bluer, so the edge seemed to run on into
 * a bluish strip under the foot.
 */
const SEEN_STEP = 0.04;

test.each(["light", "dark"] as const)(
	"the shadow under a card's foot stands apart from its front edge (%s)",
	async (theme: DiagramTheme) => {
		const lone = orderedFixture({
			nodes: [{ id: "card", name: "Orders DB", kind: "database" }],
			edges: [],
		});
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: lone,
			theme,
		});
		const svg = paintedIn(drawing.svg, theme);
		const card = /<g data-semantic-kind="node" data-semantic-id="card"[\s\S]*?<\/g>/u.exec(svg)![0];
		const seat = /<rect [^>]*pointer-events="all"[^>]*>/u.exec(card)![0];
		const box = boxOf(seat);
		// The front edge: the body the face is laid over, the box itself, painted.
		const edge = [...card.matchAll(/<rect [^>]*>/gu)]
			.map(([tag]) => tag)
			.find(
				(tag) =>
					tag !== seat &&
					!tag.includes("ab-halo") &&
					/\sfill="#/u.test(tag) &&
					JSON.stringify(boxOf(tag)) === JSON.stringify(box),
			)!;
		// What lies just under the foot, at the middle of the card: the page, and
		// every layer of the card's shadow that reaches there.
		const point = { x: box.x + box.width / 2, y: box.y + box.height + 0.25 };
		const shadow = /<g class="ab-shadow" data-members="card"[^>]*>([\s\S]*?)<\/g>/u.exec(svg)![1]!;
		const page = paintOf(`<rect fill="${/--background:(#[\da-f]{6})/u.exec(svg)![1]}">`);
		const under = [...shadow.matchAll(/<rect [^>]*>/gu)]
			.map(([tag]) => tag)
			.filter((tag) => {
				const layer = boxOf(tag);
				return (
					point.x >= layer.x &&
					point.x <= layer.x + layer.width &&
					point.y >= layer.y &&
					point.y <= layer.y + layer.height
				);
			})
			.reduce((ground, tag) => over(shadowPaintAt(tag, point, svg), ground), page);
		const step = Math.abs(lightnessOf(hexOf(paintOf(edge))) - lightnessOf(hexOf(under)));
		expect(step).toBeGreaterThan(SEEN_STEP);
	},
);

// At ten times magnification each sample is one screen pixel. A hard
// silhouette layer would introduce an alpha jump instead of a continuous fade.
// The samples start under the card's middle: a card that recedes is seen
// through, and a hole in its shadow there showed as a band along its edges.
test.each(["light", "dark"] as const)(
	"a shadow fades continuously from under the card to zero at 10x (%s)",
	async (theme: DiagramTheme) => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: orderedFixture({
				nodes: [{ id: "card", name: "Orders DB", kind: "database" }],
				edges: [],
			}),
			theme,
		});
		const svg = paintedIn(drawing.svg, theme);
		const box = drawing.atlas.nodes["card"]!;
		const shadow = /<g class="ab-shadow" data-members="card"[^>]*>([\s\S]*?)<\/g>/u.exec(svg)![1]!;
		const patches = [...shadow.matchAll(/<rect [^>]*>/gu)].map(([tag]) => tag);
		const top = box.y + box.height / 2;
		const reach = box.height / 2 + 12;
		const samples = Array.from({ length: Math.round(reach * 10) + 1 }, (_, index) => {
			const point = { x: box.x + box.width / 2, y: top + index / 10 };
			const patch = patches.find((tag) => {
				const bounds = boxOf(tag);
				return (
					point.x >= bounds.x &&
					point.x <= bounds.x + bounds.width &&
					point.y >= bounds.y &&
					point.y <= bounds.y + bounds.height
				);
			});
			return patch === undefined ? 0 : shadowPaintAt(patch, point, svg).a;
		});
		const jumps = samples.slice(1).map((alpha, index) => alpha - samples[index]!);
		expect(Math.max(...jumps)).toBeLessThanOrEqual(0);
		expect(Math.max(...jumps.map(Math.abs))).toBeLessThan(0.008);
		expect(samples[0]).toBeGreaterThan(0);
		expect(samples.at(-1)).toBe(0);
		expect(svg).not.toMatch(/<(?:filter|mask)\b|filter="/u);
	},
);
