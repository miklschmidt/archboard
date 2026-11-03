// What the tip over a part of the picture says, and which parts have one.
//
// What these catch: a tip that repeats what the card already draws, one that
// leaves out what the far view hides, a label's tip that loses the kind of
// line it names, and a container whose whole frame, rather than its header,
// answers the pointer, a lifeline that answers for its participant, and a
// double-click that opens anything but a card or a container's header, and a tip
// that moves with the traffic running round the card it explains.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, expect, test } from "bun:test";

import type { AppliedAppearance } from "#ui/clients/canvas/reads/drawings.ts";
import { LegacyBoardSchema } from "@archboard/model/legacy-board";
import { withFixtureOrders } from "#tests/ui/support/canvas/fixture-orders.ts";
import { openableAt, subjectTip, tipTargetAt } from "#ui/clients/canvas/subjects/subject-tips.ts";

const SemanticVariantSchema = LegacyBoardSchema.shape.variants.element;

beforeAll(() => {
	GlobalRegistrator.register();
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** A variant with a card that opens a model, a container, and a labelled relationship. */
const VARIANT = SemanticVariantSchema.parse(
	withFixtureOrders({
		id: "v1",
		name: "as it is",
		lifecycle: "current",
		content: {
			nodes: [
				{
					id: "n1",
					name: "API",
					kind: "service",
					responsibility: "Answers requests",
					description: "Holds no state between requests.",
					drillDown: { board: "api", variant: { kind: "current" } },
				},
				{ id: "n2", name: "Store", kind: "service", responsibility: "Keeps models" },
				{ id: "c1", name: "Server", kind: "system", description: "One process per vault." },
			],
			edges: [
				{
					id: "e1",
					from: "n1",
					to: "n2",
					kind: "call",
					label: "reads",
					description: "Once per request.",
				},
			],
			flows: [],
		},
	}),
);

/** The line's appearance in the render reply, independent of its SVG groups. */
const LINE: AppliedAppearance = {
	id: "e1",
	typeName: "Calls",
	typeKind: "call",
	iconSvg: "",
	depiction: "",
	typeColor: "neutral",
	lineColor: "sky",
	dash: "dashed",
	arrowhead: "open",
};

/** The container's appearance, including the icon drawn in its separate header. */
const CONTAINER: AppliedAppearance = {
	...LINE,
	id: "c1",
	typeName: "System",
	typeKind: "system",
	iconSvg: '<svg data-icon="reply"></svg>',
	depiction: "container",
	typeColor: "rose",
	lineColor: "neutral",
	dash: "solid",
	arrowhead: "filled",
};

/**
 * A picture holding a card, a container's frame and header, and a relationship
 * drawn as a line and a label, as the renderer marks them.
 * @returns The picture's root.
 */
function drawn(): SVGSVGElement {
	document.body.innerHTML =
		`<svg xmlns="http://www.w3.org/2000/svg">` +
		`<g data-semantic-kind="region" data-semantic-id="c1"><rect id="frame"></rect><line id="rule"></line></g>` +
		`<g data-semantic-kind="node" data-semantic-id="n1"><rect id="card"></rect></g>` +
		`<g data-semantic-kind="node" data-semantic-id="n2"><rect id="plain"></rect></g>` +
		`<g data-semantic-kind="edge" data-semantic-id="e1"><path id="wire"></path></g>` +
		`<g data-semantic-kind="edge" data-semantic-id="e1" data-semantic-part="label"><rect id="pill"></rect></g>` +
		`<g data-semantic-kind="region" data-semantic-id="c1" data-semantic-part="header"><text id="title"></text></g>` +
		`<g data-semantic-kind="node" data-semantic-id="n1" data-semantic-part="lifeline"><rect id="bar"></rect></g>` +
		`</svg>`;
	const rule = document.querySelector("#rule");
	if (rule !== null) {
		rule.getBoundingClientRect = ruleBox;
	}
	return document.querySelector("svg")!;
}

/**
 * Where the rule under the container's header is, in a DOM that does no layout.
 * @returns Its box: level, 40 units down the screen.
 */
function ruleBox(): DOMRect {
	return new DOMRect(0, 40, 200, 0);
}

/**
 * The element of the picture with this id.
 * @param picture The picture.
 * @param id Its id.
 * @returns The element.
 */
function at(picture: Element, id: string): Element {
	return picture.querySelector(`#${id}`)!;
}

test("a card's tip adds what the card does not draw at this distance, and what a double-click opens", () => {
	const card = tipTargetAt(at(drawn(), "card"), 0)!;
	expect(card.part).toBe("card");
	const near = subjectTip(VARIANT, card, undefined, false)!;
	expect(near.title).toBe("API");
	expect(near.lead).toBeUndefined();
	expect(near.body).toBe("Holds no state between requests.");
	expect(near.hint).toContain("api");
	const far = subjectTip(VARIANT, card, undefined, true)!;
	expect(far.lead).toBe("Answers requests");
	expect(far.body).toBe("Holds no state between requests.");
});

test("a card with nothing more to say has a tip only from far away", () => {
	const plain = tipTargetAt(at(drawn(), "plain"), 0)!;
	expect(subjectTip(VARIANT, plain, undefined, false)).toBeNull();
	expect(subjectTip(VARIANT, plain, undefined, true)!.lead).toBe("Keeps models");
});

test("a label's tip names its words and the kind of line the picture draws them on", () => {
	const picture = drawn();
	expect(subjectTip(VARIANT, tipTargetAt(at(picture, "wire"), 0)!, undefined, false)).toBeNull();
	const label = tipTargetAt(at(picture, "pill"), 0);
	const tip = subjectTip(VARIANT, label!, LINE, false)!;
	expect(tip.title).toBe("reads");
	expect(tip.kind).toBe(LINE.typeName);
	expect(tip.appearance).toBe(LINE);
	expect(tip.body).toBe("Once per request.");
});

test("a container answers the pointer on its header band, not across its frame", () => {
	const picture = drawn();
	const band = picture.querySelector('[data-semantic-part="header"]');
	expect(tipTargetAt(at(picture, "title"), 0)?.drawn).toBe(band!);
	expect(tipTargetAt(at(picture, "frame"), 20)?.drawn).toBe(band!);
	expect(tipTargetAt(at(picture, "frame"), 60)).toBeNull();
	const header = subjectTip(VARIANT, tipTargetAt(at(picture, "title"), 0)!, CONTAINER, false)!;
	expect(header.body).toBe("One process per vault.");
	// The reply supplies the type and icon even when the SVG carries neither.
	expect(header.appearance).toBe(CONTAINER);
});

test("a double-click opens a card or a container by its header, and a lifeline has no tip", () => {
	const picture = drawn();
	expect(openableAt(at(picture, "card"), 0)).toBe("n1");
	expect(openableAt(at(picture, "frame"), 20)).toBe("c1");
	expect(openableAt(at(picture, "frame"), 60)).toBeNull();
	expect(openableAt(at(picture, "pill"), 0)).toBeNull();
	expect(tipTargetAt(at(picture, "bar"), 0)).toBeNull();
});

test("a joined line's tip in the overview names its drawn ends and every relationship it joins", () => {
	// Two parts of the Server reach the Store, so the overview draws one line for e1 and e2.
	const joined = SemanticVariantSchema.parse(
		withFixtureOrders({
			id: "v1",
			name: "as it is",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "c1", name: "Server", kind: "system" },
					{ id: "n1", name: "API", kind: "service", parent: "c1" },
					{ id: "n3", name: "Jobs", kind: "service", parent: "c1" },
					{ id: "n2", name: "Store", kind: "service" },
				],
				edges: [
					{ id: "e1", from: "n1", to: "n2", kind: "call", label: "reads", description: "Once." },
					{ id: "e2", from: "n3", to: "n2", kind: "call", label: "writes" },
				],
				flows: [],
			},
		}),
	);
	const label = tipTargetAt(at(drawn(), "pill"), 0)!;
	const tip = subjectTip(joined, label, LINE, false, {}, true)!;
	expect(tip.appearance).toBe(LINE);
	expect(tip.title).toContain("Server");
	expect(tip.title).toContain("Store");
	expect(tip.body).toContain("reads");
	expect(tip.body).toContain("writes");
	expect(tip.body).toContain("Jobs");
	expect(tip.body).not.toContain("Once.");
	// Everything draws e1 alone, so its tip is e1's.
	expect(subjectTip(joined, label, LINE, false, {}, false)!.title).toBe("reads");
});
