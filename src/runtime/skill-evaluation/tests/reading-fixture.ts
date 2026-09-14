// A vault as the fixtures left it and as an author left it, built in memory
// for the outcome and guardrail owners: one node renamed under a new id, one
// removed, traffic changed, a flow and a walkthrough added, one draft with an
// open disagreement, and one adoption recorded.

import { SemanticBoardSchema, type SemanticBoard } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import {
	evaluateOutcomes,
	type OutcomeCheck,
	type Reading,
} from "@/runtime/skill-evaluation/index";

/** One variant as the fixture states it. */
interface VariantSpec {
	readonly id: string;
	readonly name: string;
	readonly lifecycle?: string;
	readonly parent?: string;
	readonly content: object;
	readonly reconciliation?: object;
}

/**
 * A board with the given variants, the first current.
 * @param variants The variants.
 * @param extra Board-level fields.
 * @returns The board.
 */
function board(variants: readonly VariantSpec[], extra: object = {}): SemanticBoard {
	return SemanticBoardSchema.parse({
		schemaVersion: "2.2.0",
		kind: "semantic-board",
		id: "bd",
		name: "Flask",
		level: "service",
		version: 1,
		createdAt: "2026-09-14T00:00:00.000Z",
		updatedAt: "2026-09-14T00:00:00.000Z",
		views: [],
		current: variants[0]?.id,
		variants: variants.map((variant) => ({ lifecycle: "draft", ...variant })),
		...extra,
	});
}

const APP = {
	id: "app",
	name: "Flask app",
	kind: "app",
	responsibility: "The app",
	binding: { repo: "github.com/pallets/flask", path: "src/flask/app.py" },
};
const FLOW = {
	id: "f1",
	name: "Handle",
	participants: ["cli2", "disp"],
	steps: [
		{ id: "s1", from: "cli2", to: "disp", label: "call" },
		{ id: "s2", from: "disp", to: "disp", label: "pre", kind: "self", repeat: 2, note: "twice" },
		{ id: "s3", from: "disp", to: "cli2", label: "done", kind: "return" },
	],
};

const BEFORE = board([
	{
		id: "v1",
		name: "Initial",
		lifecycle: "current",
		content: {
			nodes: [
				APP,
				{ id: "disp", name: "Dispatch", kind: "function", parent: "app" },
				{ id: "cli", name: "CLI", kind: "module" },
			],
			edges: [
				{ id: "e1", from: "cli", to: "disp", kind: "call", traffic: {} },
				{ id: "e2", from: "cli", to: "app", kind: "call" },
			],
			flows: [],
			walkthroughs: [
				{
					id: "w1",
					name: "Tour",
					beats: [
						{ id: "b1", heading: "Start", body: "Here." },
						{ id: "b2", heading: "Then", body: "There.", subjects: ["cli"] },
					],
				},
			],
		},
	},
]);

const AFTER = board(
	[
		{
			id: "v1",
			name: "Initial",
			lifecycle: "current",
			content: {
				nodes: [
					{ ...APP, groups: ["request-lifecycle"] },
					{
						id: "disp",
						name: "Dispatch",
						kind: "function",
						parent: "app",
						groups: ["request-lifecycle", "sansio-core"],
					},
					{ id: "cli2", name: "CLI", kind: "module" },
					{
						id: "prov",
						name: "Provider",
						kind: "module",
						drillDown: {
							board: "Flask sansio",
							variant: { kind: "named", name: "Blueprint registration" },
						},
					},
				],
				edges: [
					{ id: "e1", from: "cli2", to: "disp", kind: "call", traffic: { speed: 80, volume: 2 } },
					{ id: "e3", from: "app", to: "prov", kind: "call" },
				],
				flows: [FLOW],
				walkthroughs: [
					{
						id: "w1",
						name: "Tour",
						beats: [
							{ id: "b1", heading: "Start", body: "Here." },
							{ id: "b2", heading: "Then", body: "Reworded.", subjects: ["disp", "s2"] },
						],
					},
				],
			},
		},
		{
			id: "v2",
			name: "No provider",
			parent: "v1",
			content: {
				nodes: [
					{ id: "app", name: "Flask app", kind: "app" },
					{ id: "disp", name: "Dispatch", kind: "function", parent: "app" },
					{ id: "cli2", name: "CLI", kind: "module" },
				],
				edges: [
					{ id: "e1", from: "cli2", to: "disp", kind: "call", traffic: { speed: 80, volume: 2 } },
				],
				flows: [FLOW],
				walkthroughs: [
					{ id: "w1", name: "Tour", beats: [{ id: "b1", heading: "Start", body: "Here." }] },
				],
			},
			reconciliation: {
				against: "v1",
				atVersion: 1,
				base: { nodes: [], edges: [], flows: [], walkthroughs: [] },
				issues: [
					{
						subject: "app",
						what: "node Flask app",
						kind: "competing-field",
						field: "name",
						mine: "x",
						theirs: "y",
						repair: "choose a side",
					},
				],
			},
		},
	],
	{
		version: 3,
		views: [
			{
				id: "vw",
				name: "Session path",
				grammar: "architecture",
				scope: { kind: "selection", nodes: [], edges: ["e1"], flows: [] },
			},
		],
		adoptions: [{ variant: "v1", at: "2026-09-14T00:00:00.000Z", reason: "shipped" }],
	},
);

const READING: Reading = {
	boards: new Map([["Flask", AFTER]]),
	snapshot: new Map([["Flask", BEFORE]]),
	policy: {
		...DEFAULT_SEMANTIC_POLICY,
		groups: { "request-lifecycle": { name: "Request lifecycle" } },
	},
	diagnostics: [],
	renders: [
		{
			board: "Flask",
			variant: undefined,
			view: "Session path",
			ok: true,
			detail: "drawn",
			file: "/x.svg",
		},
	],
	inspections: [
		{
			board: "Flask",
			group: "request-lifecycle",
			variant: undefined,
			result: {
				members: [{ name: "Flask app" }, { name: "Dispatch" }],
				internalEdges: [{}],
				boundaryEdges: [{ direction: "incoming" }],
				neighbors: [{ name: "CLI" }],
			},
			detail: "inspected",
		},
	],
};

/**
 * Runs checks against the reading and returns each verdict's pass flag.
 * @param checks The checks.
 * @param reading The reading; the standard one when absent.
 * @returns Pass flag by index.
 */
function passes(checks: readonly OutcomeCheck[], reading: Reading = READING): readonly boolean[] {
	return evaluateOutcomes(checks, reading).map((verdict) => verdict.passed);
}

export { AFTER, BEFORE, READING, passes };
