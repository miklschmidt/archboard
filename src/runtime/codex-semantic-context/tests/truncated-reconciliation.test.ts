// A brief that could not fit its issues still says there are issues.
//
// The fitter drops lists before anything else, which is right: the description
// and the identities matter more than a list an agent can go and read. But
// whether there is anything to settle is not detail — it is the one fact that
// decides whether the agent has work — so the summary is never trimmed. A brief
// whose issues were dropped and therefore read as "nothing to settle" would tell
// an agent the opposite of the truth at exactly the moment the truth was too
// long to fit (TASK-179).

import { describe, expect, test } from "bun:test";
import {
	createSemanticContextPublisher,
	SEMANTIC_CONTEXT_LIMITS,
	type SemanticContextInput,
} from "../index.ts";

/** One disagreement, as the reconciliation writes them. */
const ISSUE = {
	subject: "n1",
	what: "node",
	kind: "competing-field" as const,
	field: "responsibility",
	repair: "This proposal and the variant it came from both changed it. Say which one it means.",
};

/**
 * A context whose description is big enough to crowd out every list.
 * @param description How long the description is.
 * @returns The context.
 */
function crowded(description: string): SemanticContextInput {
	return {
		repository: "archboard",
		board: { key: "pipeline", name: "Pipeline", file: "pipeline.semantic.json", version: 9 },
		pane: { paneId: "pane-a", focused: true },
		architecture: {
			variant: { id: "v2", name: "Queued ingest", lifecycle: "draft", against: "v1" },
			view: null,
			selection: { count: 1, subjects: [{ kind: "node" as const, id: "n1", name: "Gateway" }] },
			differences: null,
			reconciliation: { required: true, count: 3, blockedBy: "v1", issues: [ISSUE] },
		},
		doing: null,
		cursor: { feedId: "feed-a", sequence: 1 },
		description,
	};
}

/**
 * More disagreements than a brief can carry, each with a long repair sentence.
 * @returns The issues.
 */
function manyIssues() {
	return Array.from({ length: SEMANTIC_CONTEXT_LIMITS.issueEntries }, (_, index) => ({
		...ISSUE,
		subject: `n${index}`,
		repair: "y".repeat(SEMANTIC_CONTEXT_LIMITS.repairBytes),
	}));
}

/**
 * A context holding these issues and this description.
 * @param issues The disagreements the variant is holding.
 * @param description What the variant is described as.
 * @returns The context.
 */
function crowdedWith(issues: (typeof ISSUE)[], description: string): SemanticContextInput {
	const base = crowded(description);
	return {
		...base,
		architecture: {
			...base.architecture,
			reconciliation: { required: true, count: issues.length, blockedBy: "v1", issues },
		},
	};
}

/**
 * The brief a publisher builds for one context.
 * @param input The context.
 * @returns The fresh brief.
 */
function briefFor(input: SemanticContextInput) {
	const publisher = createSemanticContextPublisher({
		feed: { onChange: () => () => undefined },
		feedId: "feed-a",
		fresh: { read: () => input },
		contextForChange: () => input,
		now: () => 1_700_000_000_000,
	});
	const brief = publisher.freshBrief();
	publisher.dispose();
	return brief;
}

describe("a brief under its byte ceiling", () => {
	test("spends the budget on what is selected before it spends it on prose", () => {
		const brief = briefFor(crowded("x".repeat(SEMANTIC_CONTEXT_LIMITS.descriptionBytes)));

		// The description is thousands of bytes and the selection is one subject.
		// Refilling text before the lists would keep the prose and lose the
		// subject the question is about, and an empty selection is
		// indistinguishable from nobody having selected anything.
		expect(brief.truncated).toBe(true);
		expect(brief.architecture.selection.subjects).toEqual([
			{ kind: "node", id: "n1", name: "Gateway" },
		]);
		expect(brief.architecture.reconciliation.issues).toEqual([ISSUE]);
		// The prose is what gave way, in the bytes an agent actually reads.
		const written = JSON.parse(brief.brief) as {
			description: string;
			architecture: { selection: { subjects: unknown[] } };
		};
		expect(written.architecture.selection.subjects).toHaveLength(1);
		expect(written.description.length).toBeLessThan(SEMANTIC_CONTEXT_LIMITS.descriptionBytes);
	});

	test("drops the issues it truly cannot fit and still says there are issues", () => {
		const brief = briefFor(crowdedWith(manyIssues(), "x".repeat(2_000)));
		const { reconciliation } = brief.architecture;

		expect(brief.truncated).toBe(true);
		expect(reconciliation.issues.length).toBeLessThan(reconciliation.count);
		// The three fields that decide whether the agent has work survive whatever
		// had to be dropped to make the brief fit.
		expect(reconciliation.required).toBe(true);
		expect(reconciliation.count).toBe(SEMANTIC_CONTEXT_LIMITS.issueEntries);
		expect(reconciliation.blockedBy).toBe("v1");
	});

	test("puts the same summary in the bytes, so a reader of the brief agrees", () => {
		const brief = briefFor(crowdedWith(manyIssues(), "x".repeat(2_000)));
		const written = JSON.parse(brief.brief) as {
			architecture: { reconciliation: { required: boolean; count: number; issues: unknown[] } };
		};

		expect(written.architecture.reconciliation.required).toBe(true);
		expect(written.architecture.reconciliation.count).toBe(SEMANTIC_CONTEXT_LIMITS.issueEntries);
		expect(written.architecture.reconciliation.issues.length).toBeLessThan(
			written.architecture.reconciliation.count,
		);
	});

	test("keeps everything when there is room for it", () => {
		const brief = briefFor(crowded("a short description"));

		expect(brief.truncated).toBe(false);
		expect(brief.architecture.reconciliation.issues).toEqual([ISSUE]);
		expect(brief.architecture.reconciliation.count).toBe(3);
	});
});
