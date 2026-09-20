import { describe, expect, test } from "bun:test";
import {
	reconcileVariant,
	VariantContentSchema,
	VariantStandingSchema,
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

describe("a change nobody competed for", () => {
	test("inherits a parent-only node and relationship order change", () => {
		const theirs = content({
			nodes: [{ ...API, order: 3000 }, STORE],
			edges: [{ ...WIRE, order: 4000 }],
		});
		const settled = reconcileVariant({ base: BASE, mine: BASE, theirs });
		expect(settled.issues).toEqual([]);
		expect(settled.content.nodes[0]?.order).toBe(3000);
		expect(settled.content.edges[0]?.order).toBe(4000);
	});

	test("is inherited, and what this proposal decided is kept", () => {
		// The proposal gave the API a new responsibility; the predecessor renamed it.
		const mine = content({
			nodes: [{ ...API, responsibility: "Serves authenticated requests" }, STORE],
			edges: [WIRE],
		});
		const theirs = content({ nodes: [{ ...API, name: "Public API" }, STORE], edges: [WIRE] });
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(settled.issues).toEqual([]);
		expect(settled.content.nodes[0]).toMatchObject({
			name: "Public API",
			responsibility: "Serves authenticated requests",
		});
		expect(settled.inherited).toContain("n1");
	});

	test("a subject the predecessor added arrives", () => {
		const theirs = content({
			nodes: [API, STORE, { id: "n3", name: "Cache", kind: "cache" }],
			edges: [WIRE],
		});
		const settled = reconcileVariant({ base: BASE, mine: BASE, theirs });
		expect(settled.content.nodes.map((node) => node.id)).toEqual(["n1", "n2", "n3"]);
		expect(settled.issues).toEqual([]);
	});

	test("a subject the predecessor removed goes, when nothing here touched it", () => {
		const theirs = content({ nodes: [API], edges: [] });
		const settled = reconcileVariant({ base: BASE, mine: BASE, theirs });
		expect(settled.content.nodes.map((node) => node.id)).toEqual(["n1"]);
		expect(settled.content.edges).toEqual([]);
		expect(settled.issues).toEqual([]);
	});

	test("an inherited root edit does not make a nested edge removal look contested", () => {
		const rootMoved = content({
			nodes: [{ ...API, name: "Public API" }, STORE],
			edges: [WIRE],
		});
		const proposal = reconcileVariant({ base: BASE, mine: BASE, theirs: rootMoved });
		expect(proposal.issues).toEqual([]);
		// Field-wise reconciliation materializes optional fields even though the
		// relationship itself did not change.
		expect(Object.hasOwn(proposal.content.edges[0]!, "traffic")).toBe(true);
		expect(proposal.content.edges[0]?.traffic).toBeUndefined();

		const nestedWithoutEdge = content({ nodes: [API, STORE], edges: [] });
		const nested = reconcileVariant({
			base: BASE,
			mine: nestedWithoutEdge,
			theirs: proposal.content,
		});
		expect(nested.issues).toEqual([]);
		expect(nested.content.edges).toEqual([]);
		expect(nested.content.nodes[0]?.name).toBe("Public API");
	});
});

describe("two sides reaching the same conclusion", () => {
	test("is agreement, not a conflict", () => {
		const named = content({ nodes: [{ ...API, name: "Public API" }, STORE], edges: [WIRE] });
		const settled = reconcileVariant({ base: BASE, mine: named, theirs: named });
		expect(settled.issues).toEqual([]);
		expect(settled.content.nodes[0]?.name).toBe("Public API");
	});
});

describe("a real disagreement", () => {
	test("holds competing node and relationship order changes as authored fields", () => {
		const mine = content({
			nodes: [{ ...API, order: 3000 }, STORE],
			edges: [{ ...WIRE, order: 3000 }],
		});
		const theirs = content({
			nodes: [{ ...API, order: 4000 }, STORE],
			edges: [{ ...WIRE, order: 4000 }],
		});
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(about(settled.issues, "n1")[0]).toMatchObject({
			kind: "competing-field",
			field: "order",
			mine: 3000,
			theirs: 4000,
		});
		expect(about(settled.issues, "e1")[0]).toMatchObject({
			kind: "competing-field",
			field: "order",
			mine: 3000,
			theirs: 4000,
		});
	});

	test("is held against the field it is about, and this proposal keeps what it said", () => {
		const mine = content({ nodes: [{ ...API, name: "Gateway" }, STORE], edges: [WIRE] });
		const theirs = content({ nodes: [{ ...API, name: "Public API" }, STORE], edges: [WIRE] });
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(about(settled.issues, "n1")).toEqual([
			{
				subject: "n1",
				what: "node",
				kind: "competing-field",
				field: "name",
				mine: "Gateway",
				theirs: "Public API",
				repair: expect.stringContaining("both changed `name`"),
			},
		]);
		// The content it keeps is the one it had, which is coherent.
		expect(settled.content.nodes[0]?.name).toBe("Gateway");
	});

	test("a subject one side removed and the other changed is reported, not dropped", () => {
		const mine = content({
			nodes: [API, { ...STORE, responsibility: "Holds every board" }],
			edges: [WIRE],
		});
		const theirs = content({ nodes: [API], edges: [] });
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(about(settled.issues, "n2")[0]).toMatchObject({
			kind: "deleted-and-changed",
			theirs: "removed it",
		});
		// The other direction of the same disagreement, and the same rule: the
		// fields it says changed come with what they were changed to, so the side
		// that has to be written out again is read rather than retyped.
		expect(about(settled.issues, "n2")[0]?.changed).toEqual([
			{ field: "responsibility", before: null, after: "Holds every board" },
		]);
		// Still there, so what is left is a picture somebody can read.
		expect(settled.content.nodes.map((node) => node.id)).toEqual(["n1", "n2"]);
	});

	test("the removed side's issue says what the predecessor changed the field to", () => {
		// Settling this is writing the node again with that value, so an issue
		// that named `description` and stopped would have the sentence copied out
		// of the board by hand — one line below a near-identical responsibility,
		// which is how a restored node comes back saying something nobody wrote
		// (TASK-256.09).
		const lease = {
			id: "n3",
			name: "Lease",
			kind: "module",
			responsibility: "Keeps one writer at a time on a board",
			description: "Keeps one writer at a time",
		};
		const reworded = "Keeps one writer at a time, and says who and since when";
		const base = content({ nodes: [API, lease], edges: [] });
		const settled = reconcileVariant({
			base,
			mine: content({ nodes: [API], edges: [] }),
			theirs: content({ nodes: [API, { ...lease, description: reworded }], edges: [] }),
		});
		expect(about(settled.issues, "n3")[0]?.changed).toEqual([
			{ field: "description", before: lease.description, after: reworded },
		]);
		// And it is something a board may hold: a standing is written on the
		// variant and read back after a restart, so a value the contract refused
		// would make the board unreadable rather than the disagreement unsettled.
		const written = VariantStandingSchema.safeParse({
			against: "v1",
			atVersion: 2,
			base: JSON.parse(JSON.stringify(base)),
			issues: JSON.parse(JSON.stringify(settled.issues)),
		});
		expect(written.success, JSON.stringify(written.error?.issues ?? [])).toBe(true);
	});

	test("it carries the whole value, whatever a terminal line has room for", () => {
		// The printed disagreement line cuts a long value to fit; the issue is
		// where the whole of it lives, so a settled value is carried across
		// rather than retyped from what was printed.
		const long = `${"Keeps one writer at a time on a board, ".repeat(3)}and says since when`;
		const lease = { id: "n3", name: "Lease", kind: "module", description: "short" };
		const settled = reconcileVariant({
			base: content({ nodes: [API, lease], edges: [] }),
			mine: content({ nodes: [API], edges: [] }),
			theirs: content({ nodes: [API, { ...lease, description: long }], edges: [] }),
		});
		expect(about(settled.issues, "n3")[0]?.changed?.[0]?.after).toBe(long);
	});

	test("only the fields in dispute are held; the rest of the subject still merges", () => {
		const mine = content({
			nodes: [{ ...API, name: "Gateway", description: "the front door" }, STORE],
			edges: [WIRE],
		});
		const theirs = content({
			nodes: [
				{ ...API, name: "Public API", responsibility: "Serves authenticated requests" },
				STORE,
			],
			edges: [WIRE],
		});
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(settled.issues.map((issue) => issue.field)).toEqual(["name"]);
		expect(settled.content.nodes[0]).toMatchObject({
			name: "Gateway",
			description: "the front door",
			responsibility: "Serves authenticated requests",
		});
	});
});

describe("what a proposal added to something the predecessor removed", () => {
	test("keeps the relationship it added and says what is wrong", () => {
		// The proposal wired the API to the store; the predecessor took the store out.
		const mine = content({
			nodes: [API, STORE],
			edges: [WIRE, { id: "e2", from: "n2", to: "n1", kind: "call", label: "answers" }],
		});
		const theirs = content({ nodes: [API], edges: [] });
		const settled = reconcileVariant({ base: BASE, mine, theirs });
		expect(settled.issues.some((issue) => issue.kind === "reference-lost")).toBe(true);
		// Nothing is drawn pointing at nothing: the node stays while it is unsettled.
		expect(settled.content.nodes.map((node) => node.id)).toContain("n2");
		expect(settled.content.edges.map((edge) => edge.id)).toContain("e2");
	});
});
