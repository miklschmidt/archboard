import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { describe, expect, test } from "bun:test";
import { type DiagramTheme, type VariantContent } from "@/shared/semantic-board/index";
import {
	renderArchitecture,
	renderDataFlow,
	type RenderedDiagram,
	type StatedStandings,
} from "@/runtime/semantic-renderer/index";
import {
	groupOf,
	subjectGroups,
	type DrawnGroup,
} from "@/runtime/semantic-renderer/tests/drawn-subjects";
import {
	drawnSpan,
	drawnTexts,
	registeredFaces,
} from "@/runtime/semantic-renderer/tests/drawn-text";
import {
	bodyShift,
	distanceToRoute,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";

/** Two parts and every sort of relationship a standing can be drawn on. */
const CONTENT: VariantContent = orderedFixture({
	nodes: [
		{ id: "gw", name: "API Gateway", kind: "route", responsibility: "Takes requests" },
		{ id: "io", name: "board-io", kind: "module" },
		{ id: "store", name: "Vault", kind: "datastore" },
	],
	edges: [
		{
			id: "moved",
			from: "gw",
			to: "io",
			kind: "call",
			label: "reads the board",
			emphasis: "hero",
			traffic: {},
		},
		{
			id: "new",
			from: "io",
			to: "store",
			kind: "data",
			label: "writes",
			emphasis: "normal",
			traffic: {},
		},
		{
			id: "gone",
			from: "gw",
			to: "store",
			kind: "http",
			label: "went direct",
			emphasis: "normal",
			traffic: {},
		},
		{
			id: "same",
			from: "store",
			to: "gw",
			kind: "event",
			label: "changed",
			emphasis: "normal",
			traffic: {},
		},
	],
	flows: [
		{
			id: "f1",
			name: "One read",
			participants: ["gw", "io"],
			steps: [
				{ id: "asks", from: "gw", to: "io", label: "asks for it", kind: "sync" },
				{ id: "answers", from: "io", to: "gw", label: "the board", kind: "return" },
			],
		},
	],
});

/** One standing of each kind, on subjects of every drawn shape. */
const STANDING: StatedStandings = {
	moved: "changed",
	new: "added",
	gone: "removed",
	io: "changed",
	store: "added",
	asks: "changed",
	answers: "removed",
};

/**
 * The architecture, drawn as its caller would.
 * @param unsettled Which subjects the board has not decided, when any.
 * @param theme Which ground to draw it on.
 * @returns The rendered picture.
 */
function architecture(
	unsettled?: readonly string[],
	theme: DiagramTheme = "light",
): Promise<RenderedDiagram> {
	return renderArchitecture({
		content: CONTENT,
		theme,
		standing: STANDING,
		...(unsettled === undefined ? {} : { unsettled }),
	});
}

/**
 * The sequence, drawn as its caller would.
 * @param unsettled Which subjects the board has not decided, when any.
 * @returns The rendered picture.
 */
function sequence(unsettled?: readonly string[]): RenderedDiagram {
	return renderDataFlow({
		content: CONTENT,
		theme: "light",
		standing: STANDING,
		...(unsettled === undefined ? {} : { unsettled }),
	});
}

/**
 * One subject's group, insisting it was drawn.
 * @param rendered The picture.
 * @param kind What sort of subject.
 * @param id Its semantic id.
 * @returns The group.
 */
function subject(rendered: RenderedDiagram, kind: string, id: string): DrawnGroup {
	const group = groupOf(rendered.svg, kind, id);
	expect(group, `${kind} ${id} was not drawn`).toBeDefined();
	return group!;
}

/**
 * One line's own tag with every colour spent, hue and arrowhead alike.
 *
 * What is left is the two things the line says for itself. If a standing ever
 * spent one of them, these two strings stop matching.
 * @param tag The line's start tag.
 * @returns The tag with its inks replaced.
 */
function withoutInk(tag: string): string {
	return tag
		.replace(/#[0-9a-f]{6}/gu, "#ink")
		.replace(/marker-end="url\([^)]+\)"/gu, 'marker-end="head"');
}

/** The line itself: the one path of a relationship that ends in an arrowhead. */
const LINE = /<path [^>]*marker-end="url\(#([^)"]*)\)"[^>]*>/;

/**
 * What the line of one relationship is drawn with.
 * @param group The subject group.
 * @returns The arrowhead it references and the ink it is stroked in.
 */
function line(group: DrawnGroup): { readonly head: string; readonly ink: string } {
	const tag = LINE.exec(group.markup);
	expect(tag, `${group.id} drew no line with an arrowhead`).not.toBeNull();
	return {
		head: tag![1]!,
		ink: /stroke="(#[0-9a-f]{6})"/.exec(tag![0])![1]!,
	};
}

/**
 * The ink one arrowhead in the document's defs is drawn in.
 * @param svg The whole document.
 * @param id The marker's id.
 * @returns The colour the marker paints.
 */
function headInk(svg: string, id: string): string {
	const marker = new RegExp(`<marker id="${id}"[\\s\\S]*?</marker>`).exec(svg);
	expect(marker, `the document has no arrowhead "${id}"`).not.toBeNull();
	return /(?:fill|stroke)="(#[0-9a-f]{6})"/.exec(marker![0])![1]!;
}

/**
 * The ink the dots on one relationship are filled with.
 * @param group The subject group.
 * @returns The colours, one per dot.
 */
function dotInks(group: DrawnGroup): string[] {
	return [
		...group.markup.matchAll(
			/<(?:circle|path) class="ab-pulse"[^>]*(?:fill|stroke)="(#[0-9a-f]{6})"/gu,
		),
	].map((found) => found[1]!);
}

/**
 * One channel of a colour, as the contrast formula wants it.
 * @param channel The channel, 0 to 255.
 * @returns Its linear value.
 */
function linear(channel: number): number {
	const part = channel / 255;
	return part <= 0.039_28 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
}

/**
 * How light one drawn colour is.
 * @param colour A six-digit hex colour.
 * @returns Its relative luminance.
 */
function luminance(colour: string): number {
	const channels = [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16));
	return (
		0.2126 * linear(channels[0]!) + 0.7152 * linear(channels[1]!) + 0.0722 * linear(channels[2]!)
	);
}

/**
 * The contrast between two drawn colours, as everybody measures it.
 * @param one A six-digit hex colour.
 * @param other Another.
 * @returns The ratio, at least 1.
 */
function contrast(one: string, other: string): number {
	const [lighter, darker] = [luminance(one), luminance(other)].toSorted((a, b) => b - a);
	return (lighter! + 0.05) / (darker! + 0.05);
}

/** How far from a badge's centre a word has to stay, which is its own radius. */
const BADGE_CLEARANCE = 5.4;

/** The warning badge: a translated group whose first shape is the triangle. */
const BADGE =
	/<g transform="translate\(([\d.-]+),([\d.-]+)\)" pointer-events="none"><path d="M0,-5/;

/**
 * Where the last thing belonging to any route is painted.
 * @param svg The drawn document.
 * @returns Its position in the document.
 */
function lastRouteMark(svg: string): number {
	return Math.max(svg.lastIndexOf("marker-end"), svg.lastIndexOf('class="ab-pulse"'));
}

/**
 * Where the first subject's words are painted.
 * @param svg The drawn document.
 * @param kind Which sort of subject says them: a relationship, or a message.
 * @returns Its position in the document.
 */
function firstWordsAt(svg: string, kind = "edge"): number {
	const words = subjectGroups(svg).find(
		(group) => group.kind === kind && group.markup.includes("<text"),
	);
	expect(words, `no ${kind} drew any words`).toBeDefined();
	return svg.indexOf(words!.markup);
}

/** A point on the page. */
interface At {
	readonly x: number;
	readonly y: number;
}

/**
 * Where one subject's warning badge is, if it wears one.
 * @param group The subject group.
 * @returns Its centre, or undefined when the subject is not badged.
 */
function badgeAt(group: DrawnGroup): At | undefined {
	const found = BADGE.exec(group.markup);
	return found === null ? undefined : { x: Number(found[1]), y: Number(found[2]) };
}

/**
 * Every badge the picture drew, by the subject that wears it.
 *
 * By subject rather than by group, because one subject can be drawn as more
 * than one group: a participant of an exchange is both the column of time under
 * its name and the card at the head of it, and the badge belongs to the card.
 * @param rendered The picture.
 * @returns Where each badged subject's badge is.
 */
function badges(rendered: RenderedDiagram): Map<string, At> {
	const found = new Map<string, At>();
	for (const group of subjectGroups(rendered.svg)) {
		const at = badgeAt(group);
		if (at !== undefined) {
			found.set(group.id, at);
		}
	}
	return found;
}

describe("a relationship is drawn in one ink from end to end", () => {
	test("the line, the arrowhead it ends in and the dots that ride it agree", async () => {
		const drawn = await architecture();
		for (const id of ["moved", "new"]) {
			const drawnLine = line(subject(drawn, "edge", id));
			// Every channel of the same relationship, asked separately.
			expect(headInk(drawn.svg, drawnLine.head)).toBe(drawnLine.ink);
			for (const dot of dotInks(subject(drawn, "edge", id))) {
				expect(dot).toBe(drawnLine.ink);
			}
		}
		// A plain board uses another colour, and two standings do not share one;
		// otherwise three agreeing channels would say nothing.
		const plain = await renderArchitecture({ content: CONTENT, theme: "light" });
		expect(line(subject(drawn, "edge", "moved")).ink).not.toBe(
			line(subject(plain, "edge", "moved")).ink,
		);
		expect(line(subject(drawn, "edge", "moved")).ink).not.toBe(
			line(subject(drawn, "edge", "new")).ink,
		);
	});

	test("a relationship nothing happened to is drawn in the ink of its weight", async () => {
		const marked = line(subject(await architecture(), "edge", "same"));
		const plain = line(
			subject(await renderArchitecture({ content: CONTENT, theme: "light" }), "edge", "same"),
		);
		expect(marked.ink).toBe(plain.ink);
		expect(marked.head).toBe(plain.head);
	});

	test("the standing takes the colour and leaves the dash and the weight alone", async () => {
		const plain = await renderArchitecture({ content: CONTENT, theme: "light" });
		const markedDrawing = await architecture();
		for (const id of ["moved", "new", "gone", "same"]) {
			const marked = LINE.exec(subject(markedDrawing, "edge", id).markup)![0];
			const bare = LINE.exec(subject(plain, "edge", id).markup)![0];
			// What sort of relationship it is, and how much attention it asked for:
			// both are still said by the same line, exactly as they were.
			expect(withoutInk(marked)).toBe(withoutInk(bare));
		}
	});

	test("the band behind the line is untouched, and still wider than it", async () => {
		const group = subject(await architecture(), "edge", "moved");
		const band =
			/<path d="[^"]*" fill="none" stroke="(#[0-9a-f]{6})" stroke-width="([\d.]+)" stroke-opacity="([\d.]+)"[^>]*stroke-dasharray="([^"]*)"/.exec(
				group.markup,
			);
		expect(band, "the changed relationship drew no band").not.toBeNull();
		expect(band![1]).toBe(line(group).ink);
		expect(Number(band![2])).toBeGreaterThan(2.2);
		expect(Number(band![3])).toBeLessThan(1);
		expect(band![4]).toBe("7 3.5");
	});

	test("a relationship the proposal no longer has sends no dots", async () => {
		expect(dotInks(subject(await architecture(), "edge", "gone"))).toHaveLength(0);
		expect(dotInks(subject(sequence(), "step", "answers"))).toHaveLength(0);
	});
});

describe("the words a relationship carries are on top of every dot", () => {
	test("an exchange's plates are painted after every message's dots", () => {
		// The same rule as the architecture's, and for the same reason. A stack of
		// horizontal runs at a fixed pitch mostly cannot reach another row's
		// plate — but "mostly" has to be re-derived every time somebody adds a
		// self-message loop or a taller plate, and the rule it stands in for is
		// the simple one.
		const svg = sequence().svg;
		expect(lastRouteMark(svg)).toBeLessThan(firstWordsAt(svg, "step"));
	});

	test("an architecture's words are painted after every route on the page", async () => {
		// Not after its own route: after all of them. Routes cross, and a page
		// where each relationship carried its own words would hand the crossing to
		// whichever of the two happened to be drawn second — a line and a train of
		// dots straight through the middle of somebody else's label.
		const svg = (await architecture()).svg;
		expect(lastRouteMark(svg)).toBeLessThan(firstWordsAt(svg));
	});
});

describe("what nobody has decided is said in its own corner", () => {
	test("an unlabelled return carries its warning on the route", async () => {
		const content = { ...CONTENT, edges: CONTENT.edges.map(({ label: _label, ...edge }) => edge) };
		const drawn = await renderArchitecture({ content, theme: "light", unsettled: ["same"] });
		const badge = badges(drawn).get("same")!;
		const shift = bodyShift(drawn.svg);
		const routes = routePoints(drawn.svg);
		expect(
			distanceToRoute(
				{ x: badge.x + shift.x, y: badge.y + shift.y, width: 0, height: 0 },
				routes.get("same")!,
			),
		).toBeLessThan(0.02);
	});

	test("every drawn shape of subject can wear the badge", async () => {
		// A card, a relationship, a relationship drawn for context, an exchange's
		// frame, one message of it, and a participant at the head of a column.
		expect([...badges(await architecture(["io", "gone", "moved"])).keys()].toSorted()).toEqual([
			"gone",
			"io",
			"moved",
		]);
		expect([...badges(sequence(["f1", "asks", "io"])).keys()].toSorted()).toEqual([
			"asks",
			"f1",
			"io",
		]);
	});

	test("a subject the board has settled wears none, and nor does a picture with nothing open", async () => {
		expect(badges(await architecture(["io"])).has("store")).toBe(false);
		const plain = await architecture();
		expect(badges(plain).size).toBe(0);
		expect(plain.svg).not.toContain("M0,-5.2");
	});

	test("the badge and the change's own pin are in opposite corners of the same card", async () => {
		const drawn = await architecture(["io"]);
		const card = subject(drawn, "node", "io");
		const badge = badgeAt(card)!;
		const pin = /<g transform="translate\(([\d.-]+),([\d.-]+)\)"><circle/.exec(card.markup)!;
		// Both marks are on the card — a changed node the board has not settled is
		// two facts, not one — and a reader can tell which is which because they
		// are never in the same place.
		expect(Number(pin[1])).toBeLessThan(badge.x);
		expect(Number(pin[2])).toBeCloseTo(badge.y, 5);
		const box = drawn.atlas.nodes["io"]!;
		expect(badge.x).toBeGreaterThan(box.x + box.width / 2);
	});

	test("no badge lands on a word, in either grammar", async () => {
		let checked = 0;
		for (const drawn of [
			await architecture(["io", "gw", "moved"]),
			sequence(["f1", "asks", "io"]),
		]) {
			const faces = registeredFaces(drawn.svg);
			const where = badges(drawn);
			for (const text of drawnTexts(drawn.svg)) {
				const badge = where.get(text.subject.id);
				if (badge === undefined) {
					continue;
				}
				const span = drawnSpan(text, faces);
				// The badge sits in the padding every box already leaves to the right
				// of its words, so nothing had to be re-measured to make room for it.
				const clear =
					span.right <= badge.x - BADGE_CLEARANCE || span.left >= badge.x + BADGE_CLEARANCE;
				expect(clear, `"${text.text}" runs under the badge on ${text.subject.id}`).toBe(true);
				checked += 1;
			}
		}
		// The assertion above passes trivially if nothing was badged and drawn with
		// words in it, which is exactly the case this is here to cover.
		expect(checked).toBeGreaterThan(3);
	});

	test("what the board has not decided does not move anything", async () => {
		const plain = await architecture();
		const badged = await architecture(["io", "gw", "moved", "gone", "store"]);
		// The same page at the same size with the same subjects in the same
		// places: a mark that reflowed the drawing would mean two readers of one
		// board comparing two different pictures.
		expect(badged.width).toBe(plain.width);
		expect(badged.height).toBe(plain.height);
		expect(badged.atlas).toEqual(plain.atlas);
	});

	test("the badge can be read on both grounds, and so can the mark inside it", async () => {
		for (const theme of ["light", "dark"] as const) {
			const drawn = await architecture(["io"], theme);
			const card = subject(drawn, "node", "io");
			const ink = /<path d="M0,-5.2[^"]*" fill="(#[0-9a-f]{6})"/.exec(card.markup)![1]!;
			// An eleven-unit badge is a small thing to notice, so it has to carry
			// against the surface it lands on and its own mark has to carry against
			// it. The numbers are the ordinary ones: 3:1 for a shape somebody has to
			// see, 4.5:1 for a mark somebody has to read.
			const ground = /<rect [^>]*rx="6" fill="(#[0-9a-f]{6})"/.exec(card.markup)![1]!;
			const mark = /<path d="M0,-2.4[^"]*"[^>]*stroke="(#[0-9a-f]{6})"/.exec(card.markup)![1]!;
			expect(contrast(ink, ground), `badge on a card, ${theme}`).toBeGreaterThanOrEqual(3);
			expect(contrast(ink, mark), `the mark inside the badge, ${theme}`).toBeGreaterThanOrEqual(
				4.5,
			);
			// And it is not the ink of any standing, or it would be a fourth way of
			// saying the same thing as the pin beside it.
			expect(ink).not.toBe(line(subject(drawn, "edge", "moved")).ink);
		}
	});
});
