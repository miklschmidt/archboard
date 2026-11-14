// Pure proposal selection and report formatting contracts of the pull request Action.

import { describe, expect, test } from "bun:test";
import { pullRequestComment } from "../../../actions/pull-request/comment.ts";
import type { PullRequestReport } from "../../../actions/pull-request/comment.ts";
import {
	COMMENT_MARKER,
	findStickyComment,
	mermaidCharts,
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

/**
 * A fenced Mermaid chart.
 * @param fence The opening fence, which may end in spaces.
 * @returns The chart's Markdown.
 */
function chart(fence: string): string {
	return `${fence}mermaid\nflowchart LR\n  A --> B\n${fence.trim()}\n`;
}

describe("the Mermaid charts of a description", () => {
	test("are counted inside the archboard-pr section only, with either fence", () => {
		const body = [
			chart("```"),
			"<!-- archboard-pr:begin -->",
			chart("```"),
			chart("~~~ "),
			"```ts\nconst mermaid = 1;\n```",
			"<!-- archboard-pr:end -->",
			chart("```"),
		].join("\n");
		expect(mermaidCharts(body)).toBe(2);
	});

	test("are none without the section, and run to the end of a section without its end", () => {
		expect(mermaidCharts(chart("```"))).toBe(0);
		expect(mermaidCharts(`<!-- archboard-pr:begin -->\n${chart("````")}`)).toBe(1);
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
			preexisting: [],
		},
		outOfPlan: { status: "fail", failed: true },
		preexisting: { status: "in-plan", failed: false },
		overrideLabel: "archboard: out of plan",
		vaultUrl: "https://github.test/owner/name/tree/b/.archboard/vault",
		mermaidCharts: 0,
	};

	test("starts with the marker, lists the buckets by module name and says how to override", () => {
		const text = pullRequestComment(report);
		expect(text.startsWith(COMMENT_MARKER)).toBe(true);
		expect(text).toContain("Checkout API");
		expect(text).toContain("Stock API");
		expect(text).toContain("Fulfilment worker");
		expect(text).toContain("`archboard: out of plan`");
		expect(text).toContain("- `docs/notes.md`");
		expect(text).toContain("https://github.test/owner/name/tree/b/.archboard/vault");
		expect(text).not.toContain("<img");
	});

	test("folds each group into a disclosure, opens the one outside the plan, and says the plan first", () => {
		const text = pullRequestComment({
			...report,
			buckets: { ...report.buckets!, plannedUnchanged: [] },
		});
		expect(text).toContain(
			"<details open>\n<summary>Changed outside the plan (1)</summary>\n\n- Stock API\n\n</details>",
		);
		expect(text).toContain(
			"<details>\n<summary>Changed files that no module is bound to (1)</summary>\n\n- `docs/notes.md`\n\n</details>",
		);
		expect(text).toContain("<details>\n<summary>Planned and changed (1)</summary>");
		expect(text).toContain("Planned but unchanged: none.");
		expect(text.indexOf("### Plan")).toBeLessThan(text.indexOf("### Footprint"));
	});

	test("lists the added modules without new code only when there are some, and says why it fails", () => {
		expect(pullRequestComment(report)).not.toContain("Added without new code");
		const text = pullRequestComment({
			...report,
			buckets: { ...report.buckets!, preexisting: ["CLI"] },
			preexisting: { status: "fail", failed: true },
		});
		expect(text).toContain(
			"<details open>\n<summary>Added without new code (1)</summary>\n\n- CLI\n\n</details>",
		);
		expect(text.slice(text.indexOf("### Plan"), text.indexOf("### Footprint"))).toContain(
			"`archboard: out of plan`",
		);
	});

	test("a module name shows as written and cannot close its disclosure", () => {
		const text = pullRequestComment({
			...report,
			buckets: { ...report.buckets!, outsidePlan: ["Stock </details> & <b>API</b>"] },
		});
		expect(text).toContain("- Stock &lt;/details&gt; &amp; &lt;b&gt;API&lt;/b&gt;");
		expect(text.match(/<\/details>/gu)).toHaveLength(4);
	});

	test("an unavailable proposal's name and diagnostic cannot wrap the report in a disclosure", () => {
		const html = "<details><summary>Hidden</summary>";
		for (const choice of [
			{ source: "unknown", named: html },
			{ source: "unreadable", reason: html },
		] as const) {
			const text = pullRequestComment({
				...report,
				choice,
				outOfPlan: { status: "unjudged", failed: true },
			});
			expect(text).toContain("&lt;details&gt;&lt;summary&gt;Hidden&lt;/summary&gt;");
			expect(text.indexOf("<details>")).toBeGreaterThan(text.indexOf("### Footprint"));
		}
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

	test("warns about Mermaid charts only when the description's section draws some", () => {
		expect(pullRequestComment(report)).not.toContain("Mermaid");
		const text = pullRequestComment({ ...report, mermaidCharts: 2 });
		expect(text.indexOf("Mermaid")).toBeGreaterThan(-1);
		expect(text.indexOf("Mermaid")).toBeLessThan(text.indexOf("### Footprint"));
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
