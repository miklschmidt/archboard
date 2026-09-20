import { describe, expect, test } from "bun:test";
import {
	reconcileVariant,
	VariantStandingSchema,
	VariantContentSchema,
	type ReconciliationIssue,
	type VariantContent,
} from "@/shared/semantic-board/index";
import { withFixtureOrders } from "./fixture-orders.ts";

/**
 * A variant's content as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(withFixtureOrders(stated));

const API = { id: "n1", name: "API", kind: "service", responsibility: "Serves requests" };
const STORE = { id: "n2", name: "Store", kind: "datastore" };
const WIRE = { id: "e1", from: "n1", to: "n2", kind: "call", label: "reads" };

const BASE = content({ nodes: [API, STORE], edges: [WIRE] });

/**
 * What a reconciliation says about one subject.
 * @param issues Everything it reported.
 * @param subject The subject's id.
 * @returns The issues about it.
 */
const about = (issues: readonly ReconciliationIssue[], subject: string): ReconciliationIssue[] =>
	issues.filter((issue) => issue.subject === subject);

describe("order", () => {
	const STEPS = [
		{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" },
		{ id: "s2", from: "n2", to: "n1", label: "answer", kind: "return" },
		{ id: "s3", from: "n1", to: "n1", label: "record", kind: "self" },
	];
	/**
	 * One flow, told in the given order.
	 * @param order The step ids, in the order they are told.
	 * @returns The content.
	 */
	const told = (order: readonly string[]): VariantContent =>
		content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [
				{
					id: "f1",
					name: "One request",
					participants: ["n1", "n2"],
					steps: order.map((id) => STEPS.find((step) => step.id === id)),
				},
			],
		});

	test("a reordering nobody competed for is inherited", () => {
		const settled = reconcileVariant({
			base: told(["s1", "s2", "s3"]),
			mine: told(["s1", "s2", "s3"]),
			theirs: told(["s1", "s3", "s2"]),
		});
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual(["s1", "s3", "s2"]);
		expect(settled.issues).toEqual([]);
	});

	test("two sides ordering one exchange differently is a conflict, and nothing picks a winner", () => {
		const settled = reconcileVariant({
			base: told(["s1", "s2", "s3"]),
			mine: told(["s3", "s1", "s2"]),
			theirs: told(["s1", "s3", "s2"]),
		});
		const order = settled.issues.filter((issue) => issue.kind === "competing-order");
		expect(order.length).toBeGreaterThan(0);
		expect(order[0]?.field).toBe("position");
		// This proposal keeps the order it told until somebody says otherwise.
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual(["s3", "s1", "s2"]);
	});

	test("a step added here does not read as a reordering", () => {
		const mine = told(["s1", "s2", "s3"]);
		const added = {
			...mine,
			flows: [
				{
					...mine.flows[0]!,
					steps: [
						{ id: "s4", from: "n1", to: "n2", label: "warm up", kind: "sync" as const },
						...mine.flows[0]!.steps,
					],
				},
			],
		};
		const settled = reconcileVariant({
			base: told(["s1", "s2", "s3"]),
			mine: added,
			theirs: told(["s1", "s2", "s3"]),
		});
		expect(settled.issues).toEqual([]);
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual([
			"s4",
			"s1",
			"s2",
			"s3",
		]);
	});

	test("a step this proposal inserted stays where it put it when the rest is reordered", () => {
		const base = told(["s1", "s2", "s3"]);
		const mine = {
			...base,
			flows: [
				{
					...base.flows[0]!,
					steps: [
						base.flows[0]!.steps[0]!,
						{ id: "s5", from: "n1", to: "n2", label: "check", kind: "sync" as const },
						base.flows[0]!.steps[1]!,
						base.flows[0]!.steps[2]!,
					],
				},
			],
		};
		const settled = reconcileVariant({ base, mine, theirs: told(["s3", "s1", "s2"]) });
		// The predecessor's order is taken for the steps both hold; the inserted
		// step keeps the slot it was put in rather than being swept to the end.
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual([
			"s3",
			"s5",
			"s1",
			"s2",
		]);
		expect(settled.issues).toEqual([]);
	});
});

describe("a walkthrough", () => {
	const BEATS = [
		{ id: "b1", heading: "The parts", body: "Two of them.", subjects: [] },
		{ id: "b2", heading: "The wire", body: "One call.", subjects: ["e1"] },
	];
	/**
	 * One walkthrough, told in the given order.
	 * @param order The beat ids in order.
	 * @returns The content.
	 */
	const explained = (order: readonly string[]): VariantContent =>
		content({
			nodes: [API, STORE],
			edges: [WIRE],
			walkthroughs: [
				{
					id: "w1",
					name: "How it works",
					beats: order.map((id) => BEATS.find((beat) => beat.id === id)),
				},
			],
		});

	test("two sides ordering the beats differently is a conflict of its own", () => {
		const settled = reconcileVariant({
			base: explained(["b1", "b2"]),
			mine: explained(["b2", "b1"]),
			theirs: explained(["b1", "b2"]),
		});
		// Only this proposal moved anything, so there is nothing to settle.
		expect(settled.issues).toEqual([]);
		expect(settled.content.walkthroughs[0]?.beats.map((beat) => beat.id)).toEqual(["b2", "b1"]);
	});

	test("a beat reworded on both sides is held, and the prose is not merged", () => {
		const base = explained(["b1", "b2"]);
		const mine = {
			...base,
			walkthroughs: [
				{ ...base.walkthroughs[0]!, beats: [{ ...BEATS[0]!, body: "Two services." }, BEATS[1]!] },
			],
		};
		const theirs = {
			...base,
			walkthroughs: [
				{
					...base.walkthroughs[0]!,
					beats: [{ ...BEATS[0]!, body: "A service and a store." }, BEATS[1]!],
				},
			],
		};
		const settled = reconcileVariant({ base, mine, theirs });
		expect(about(settled.issues, "b1")[0]).toMatchObject({
			kind: "competing-field",
			field: "body",
			what: "beat",
		});
		expect(settled.content.walkthroughs[0]?.beats[0]?.body).toBe("Two services.");
	});
});

describe("a disagreement a document has to be able to hold", () => {
	test("a field one side cleared survives being written down and read back", () => {
		// `undefined` is simply absent once the board is JSON, so an issue about
		// somebody clearing a description would come back missing the field it is
		// about — and be refused by the contract that describes it.
		const described = { ...API, description: "the front door" };
		const mine = content({ nodes: [{ ...API }, STORE], edges: [WIRE] });
		const theirs = content({
			nodes: [{ ...described, description: "the only way in" }, STORE],
			edges: [WIRE],
		});
		const settled = reconcileVariant({
			base: content({ nodes: [described, STORE], edges: [WIRE] }),
			mine,
			theirs,
		});
		const issue = about(settled.issues, "n1")[0];
		expect(issue?.field).toBe("description");
		expect(issue?.mine).toBeNull();
		const written = VariantStandingSchema.safeParse({
			against: "v1",
			atVersion: 2,
			base: JSON.parse(JSON.stringify(BASE)),
			issues: JSON.parse(JSON.stringify(settled.issues)),
		});
		expect(written.success, JSON.stringify(written.error?.issues ?? [])).toBe(true);
	});
});

describe("a removal this proposal made", () => {
	test("stands, and the predecessor's change to the same subject is still reported", () => {
		const mine = content({ nodes: [API], edges: [] });
		const theirs = content({
			nodes: [API, { ...STORE, responsibility: "Holds every board" }],
			edges: [WIRE],
		});
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(about(settled.issues, "n2")[0]).toMatchObject({
			kind: "deleted-and-changed",
			mine: "removed it",
		});
		// The removal is this proposal's decision and is kept.
		expect(settled.content.nodes.map((node) => node.id)).toEqual(["n1"]);
	});

	test("the same holds for a step of a sequence", () => {
		const steps = [
			{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" },
			{ id: "s2", from: "n2", to: "n1", label: "answer", kind: "return" },
		];
		/**
		 * One flow with the given steps.
		 * @param told The steps.
		 * @returns The content.
		 */
		const flowing = (told: readonly Record<string, unknown>[]): VariantContent =>
			content({
				nodes: [API, STORE],
				edges: [WIRE],
				flows: [{ id: "f1", name: "One request", participants: ["n1", "n2"], steps: told }],
			});
		const settled = reconcileVariant({
			base: flowing(steps),
			mine: flowing([steps[0]!]),
			theirs: flowing([steps[0]!, { ...steps[1]!, label: "answer at once" }]),
		});
		expect(about(settled.issues, "s2")[0]).toMatchObject({
			kind: "deleted-and-changed",
			what: "step",
			mine: "removed it",
		});
		expect(about(settled.issues, "s2")[0]?.changed).toEqual([
			{ field: "label", before: "answer", after: "answer at once" },
		]);
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual(["s1"]);
	});
});

describe("a whole explanation the predecessor removed", () => {
	const STEPS = [
		{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" },
		{ id: "s2", from: "n2", to: "n1", label: "answer", kind: "return" },
	];
	const FLOW = { id: "f1", name: "One request", participants: ["n1", "n2"], steps: STEPS };

	test("is not dropped in silence when this proposal rewrote what is inside it", () => {
		const base = content({ nodes: [API, STORE], edges: [WIRE], flows: [FLOW] });
		const mine = content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [STEPS[0]!, { ...STEPS[1]!, label: "answer at once" }] }],
		});
		const theirs = content({ nodes: [API, STORE], edges: [WIRE] });
		const settled = reconcileVariant({ base, mine, theirs });
		expect(about(settled.issues, "f1")[0]).toMatchObject({ kind: "deleted-and-changed" });
		expect(settled.content.flows.map((flow) => flow.id)).toEqual(["f1"]);
	});
});

describe("two removals that between them leave nothing", () => {
	const STEPS = [
		{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" },
		{ id: "s2", from: "n2", to: "n1", label: "answer", kind: "return" },
	];
	/**
	 * One flow with the given steps.
	 * @param told The steps.
	 * @returns The content.
	 */
	const flowing = (told: readonly Record<string, unknown>[]): VariantContent =>
		content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [{ id: "f1", name: "One request", participants: ["n1", "n2"], steps: told }],
		});

	test("are reported rather than quietly resurrecting what both sides removed", () => {
		const settled = reconcileVariant({
			base: flowing(STEPS),
			mine: flowing([STEPS[0]!]),
			theirs: flowing([STEPS[1]!]),
		});
		expect(settled.issues.some((issue) => issue.kind === "left-empty")).toBe(true);
		// What is kept is what this proposal told, which is coherent; the steps the
		// two sides removed do not come back to make the numbers work.
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual(["s1"]);
	});
});

describe("two sides adding to one sequence independently", () => {
	const STEPS = [
		{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" },
		{ id: "s2", from: "n2", to: "n1", label: "answer", kind: "return" },
	];
	/**
	 * One flow with the given steps.
	 * @param told The steps.
	 * @returns The content.
	 */
	const flowing = (told: readonly Record<string, unknown>[]): VariantContent =>
		content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [{ id: "f1", name: "One request", participants: ["n1", "n2"], steps: told }],
		});

	test("each addition lands after what it followed, not at the number it had", () => {
		const a1 = { id: "a1", from: "n1", to: "n2", label: "look up", kind: "sync" };
		const b1 = { id: "b1", from: "n2", to: "n1", label: "and log it", kind: "async" };
		const settled = reconcileVariant({
			base: flowing(STEPS),
			mine: flowing([a1, ...STEPS]),
			theirs: flowing([...STEPS, b1]),
		});
		expect(settled.content.flows[0]?.steps.map((step) => step.id)).toEqual([
			"a1",
			"s1",
			"s2",
			"b1",
		]);
		expect(settled.issues).toEqual([]);
	});
});

describe("board-owned references in merged content", () => {
	test("a beat keeps its board-view reference without making the view a variant subject", () => {
		const flow = {
			id: "f1",
			name: "One request",
			participants: ["n1", "n2"],
			steps: [{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" }],
		};
		const base = content({ nodes: [API, STORE], edges: [WIRE], flows: [flow] });
		const mine = content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [flow],
			walkthroughs: [
				{
					id: "k1",
					name: "How it goes",
					beats: [{ id: "b1", heading: "In order", body: "Like this.", subjects: [], view: "w1" }],
				},
			],
		});
		const theirs = content({ nodes: [API, STORE], edges: [WIRE], flows: [flow] });
		const settled = reconcileVariant({ base, mine, theirs });
		expect(settled.content.walkthroughs[0]?.beats[0]?.view).toBe("w1");
		expect(settled.issues).toEqual([]);
	});
});

describe("what a merged candidate may not be left saying", () => {
	const FLOW = {
		id: "f1",
		name: "One request",
		participants: ["n1", "n2"],
		steps: [
			{ id: "s1", from: "n1", to: "n2", label: "ask", kind: "sync" },
			{ id: "s2", from: "n2", to: "n1", label: "answer", kind: "return" },
		],
	};

	test("a beat about a step the predecessor removed keeps this proposal's own content", () => {
		// Neither side did anything wrong on its own: one removed a step, the other
		// wrote a paragraph about it. Together they make a document nobody may hold.
		const base = content({ nodes: [API, STORE], edges: [WIRE], flows: [FLOW] });
		const mine = content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [FLOW],
			walkthroughs: [
				{
					id: "k1",
					name: "How it goes",
					beats: [{ id: "b1", heading: "The ask", body: "It starts here.", subjects: ["s1"] }],
				},
			],
		});
		const theirs = content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [FLOW.steps[1]!] }],
		});
		const settled = reconcileVariant({ base, mine, theirs });
		const dangling = settled.issues.find((issue) => issue.kind === "reference-lost");
		// It is about the beat whose reference dangles, not whichever subject
		// happened to be written first: guidance that points at the wrong thing is
		// worse than guidance that admits it is about the document.
		expect(dangling?.subject).toBe("b1");
		// What it keeps is exactly what it had, which is coherent.
		expect(settled.content).toEqual(mine);
		// And the repair quotes the contract's own words about what is wrong.
		expect(settled.issues.at(-1)?.repair).toContain("no board may hold");
	});

	test("a step field nobody wrote survives being written down and read back", () => {
		const noted = { ...FLOW.steps[0]!, note: "the first thing that happens" };
		/**
		 * One flow whose first step is stated as given.
		 * @param first That step.
		 * @returns The content.
		 */
		const flowing = (first: Record<string, unknown>): VariantContent =>
			content({
				nodes: [API, STORE],
				edges: [WIRE],
				flows: [{ ...FLOW, steps: [first, FLOW.steps[1]!] }],
			});
		const settled = reconcileVariant({
			base: flowing(noted),
			mine: flowing(FLOW.steps[0]!),
			theirs: flowing({ ...noted, note: "where it all begins" }),
		});
		const issue = about(settled.issues, "s1")[0];
		expect(issue?.field).toBe("note");
		expect(issue?.mine).toBeNull();
		expect(
			VariantStandingSchema.safeParse({
				against: "v1",
				atVersion: 2,
				base: JSON.parse(JSON.stringify(BASE)),
				issues: JSON.parse(JSON.stringify(settled.issues)),
			}).success,
		).toBe(true);
	});

	test("a flow this proposal removed and the predecessor rewrote inside is reported", () => {
		const base = content({ nodes: [API, STORE], edges: [WIRE], flows: [FLOW] });
		const mine = content({ nodes: [API, STORE], edges: [WIRE] });
		const theirs = content({
			nodes: [API, STORE],
			edges: [WIRE],
			flows: [{ ...FLOW, steps: [{ ...FLOW.steps[0]!, label: "ask politely" }, FLOW.steps[1]!] }],
		});
		const settled = reconcileVariant({ base, mine, theirs });
		expect(about(settled.issues, "f1")[0]).toMatchObject({
			kind: "deleted-and-changed",
			mine: "removed it",
		});
		expect(settled.content.flows).toEqual([]);
	});
});
