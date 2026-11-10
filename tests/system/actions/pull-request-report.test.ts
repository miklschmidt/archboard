// Pure proposal selection and report formatting contracts of the pull request Action.

import { describe, expect, test } from "bun:test";
import { pullRequestComment } from "../../../actions/pull-request/comment.ts";
import type { PullRequestReport } from "../../../actions/pull-request/comment.ts";
import {
	COMMENT_MARKER,
	findStickyComment,
	parseBodyMarker,
} from "../../../actions/pull-request/marker.ts";
import { chooseState } from "../../../actions/pull-request/plan.ts";
import type { ModelState } from "../../../actions/pull-request/plan.ts";

const states: ModelState[] = [
	{ id: "cur", name: "Synchronous checkout", lifecycle: "current" },
	{ id: "p1", name: "Queued fulfilment", lifecycle: "draft" },
	{ id: "p2", name: "Nightly batch", lifecycle: "draft" },
];

describe("the proposal of a pull request", () => {
	const marker = parseBodyMarker(
		'Body\n<!-- archboard-pr:begin -->\n<!-- archboard-pr model="Shop" state="Nightly batch" against="cur" -->',
	);

	test("is read from the marker of the description, and the begin comment is no marker", () => {
		expect(marker).toMatchObject({ model: "Shop", state: "Nightly batch", against: "cur" });
		expect(parseBodyMarker("<!-- archboard-pr:begin -->")).toBeUndefined();
	});

	test("the input wins over the marker, and the marker over the only draft", () => {
		expect(chooseState("p1", marker, states).state?.id).toBe("p1");
		expect(chooseState("", marker, states)).toMatchObject({ source: "pr-body" });
		expect(chooseState("", undefined, states.slice(0, 2)).state?.id).toBe("p1");
	});

	test("is none when drafts are several and unnamed, or when the name matches no state", () => {
		expect(chooseState("", undefined, states)).toEqual({ source: "several-drafts" });
		expect(chooseState("Nope", undefined, states)).toMatchObject({ source: "unknown" });
	});
});

describe("the sticky comment", () => {
	const report: PullRequestReport = {
		choice: { state: states[1], source: "input" },
		comparison: ["modules: 1 added"],
		buckets: {
			plannedAndChanged: ["Checkout API"],
			outsidePlan: ["Stock API"],
			plannedUnchanged: ["Fulfilment worker"],
			changed: ["Checkout API", "Stock API"],
			unbound: [{ repo: "github.com/acme/shop", path: "docs/notes.md" }],
		},
		outOfPlan: { status: "fail", failed: true },
		overrideLabel: "archboard: out of plan",
		vaultUrl: "https://github.test/owner/name/tree/b/.archboard/vault",
	};

	test("starts with the marker, lists the buckets by module name and says how to override", () => {
		const text = pullRequestComment(report);
		expect(text.startsWith(COMMENT_MARKER)).toBe(true);
		expect(text).toContain("Checkout API");
		expect(text).toContain("Stock API");
		expect(text).toContain("Fulfilment worker");
		expect(text).toContain("`archboard: out of plan`");
		expect(text).toContain("**Changed files that no module is bound to** (1)");
		expect(text).toContain("- `docs/notes.md`");
		expect(text).toContain("https://github.test/owner/name/tree/b/.archboard/vault");
		expect(text).not.toContain("<img");
	});

	test("a file name stays one code span, and names its repository when the files are in several", () => {
		const text = pullRequestComment({
			...report,
			buckets: {
				...report.buckets!,
				unbound: [
					{ repo: "github.com/acme/shop", path: "notes` **approved** `.md" },
					{ repo: "github.com/acme/infra", path: "line\nbreak.md" },
				],
			},
		});
		expect(text).toContain("- ``notes` **approved** `.md`` in github.com/acme/shop");
		expect(text).toContain("- `line\\nbreak.md` in github.com/acme/infra");
	});

	test("the action updates the comment that carries the marker", () => {
		const comments = [
			{ id: 1, body: "unrelated" },
			{ id: 2, body: pullRequestComment(report) },
		];
		expect(findStickyComment(comments)).toBe(2);
		expect(findStickyComment(comments.slice(0, 1))).toBeUndefined();
	});
});
