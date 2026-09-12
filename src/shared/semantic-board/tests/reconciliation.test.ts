import { describe, expect, test } from "bun:test";
import {
	reconcileVariant,
	VariantContentSchema,
	type ReconciliationIssue,
	type VariantContent,
} from "@/shared/semantic-board/index";

/**
 * A variant's content as a document holds it.
 * @param stated What is on it.
 * @returns The content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(stated);

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
		// Still there, so what is left is a picture somebody can read.
		expect(settled.content.nodes.map((node) => node.id)).toEqual(["n1", "n2"]);
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
