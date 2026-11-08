// The pull request action picks a proposal, reads its footprint, keeps one comment on the pull
// request and fails the step when changes outside the plan are not let through. The decisions run
// on their own. The entry runs against a stand-in `archboard`, a stand-in GitHub API and a local
// bare repository for the pictures branch.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pullRequestComment } from "../../../actions/pull-request/comment.ts";
import type { PullRequestReport } from "../../../actions/pull-request/comment.ts";
import {
	COMMENT_MARKER,
	findStickyComment,
	parseBodyMarker,
} from "../../../actions/pull-request/marker.ts";
import { chooseState, decideOutOfPlan } from "../../../actions/pull-request/plan.ts";
import type { ModelState } from "../../../actions/pull-request/plan.ts";
import { planBuckets, proposalPlan } from "../../../actions/pull-request/proposal-plan.ts";
import { fixture, runEntryAsync, scratch, writeStandIn } from "./support.ts";

/**
 * A repository as the event names it.
 * @param full The repository's full name.
 * @returns The event's repository object.
 */
function repository(full: string) {
	return { full_name: full };
}

/**
 * One changed part, as a footprint lists it.
 * @param name The module's name.
 * @param id The module's stable identity.
 * @returns The list of that one part.
 */
function part(name: string, id = `m#${name.toLowerCase()}`) {
	return [{ subject: { id, name } }];
}

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

describe("the plan of a proposal", () => {
	const intake = { id: "m#intake", name: "Intake", binding: { path: "intake" }, outgoing: [] };
	const billing = { id: "m#billing", name: "Billing", binding: { path: "billing" } };
	const docs = { id: "m#docs", name: "Docs" };
	const base = { modules: [intake, billing, docs], relationships: [] };
	const head = {
		modules: [{ ...intake, outgoing: [{ id: "m#quote" }], file: "x.module.json" }, billing, docs],
		relationships: [{ id: "m#quote", from: "m#intake", to: "m#billing", kind: "http" }],
	};

	test("names both ends of a new relationship, and only modules bound to code", () => {
		const plan = proposalPlan(base, head);
		expect(plan.comparison).toEqual(["relationships: 1 added"]);
		expect([...plan.named.values()].toSorted()).toEqual(["Billing", "Intake"]);
	});

	test("sets the changed modules of the footprint against that plan, for a draft or an adopted proposal", () => {
		const plan = proposalPlan(base, head);
		const expected = {
			plannedAndChanged: ["Intake"],
			outsidePlan: ["Catalog"],
			plannedUnchanged: ["Billing"],
			changed: ["Catalog", "Intake"],
		};
		expect(
			planBuckets({ namedAndChanged: part("Intake"), changedNotNamed: part("Catalog") }, plan),
		).toEqual(expected);
		const footprint = {
			changed: [...part("Intake"), ...part("Catalog")],
		};
		expect(planBuckets(footprint, plan)).toEqual({
			plannedAndChanged: ["Intake"],
			outsidePlan: ["Catalog"],
			plannedUnchanged: ["Billing"],
			changed: ["Catalog", "Intake"],
		});
	});

	test("joins by identity when names are ambiguous, and sorts each bucket", () => {
		const named = new Map([
			["planned", "API"],
			["billing", "Billing"],
			["catalog", "Catalog"],
			["removed", "Gone"],
		]);
		const buckets = planBuckets(
			{
				changed: [...part("Zulu", "z"), ...part("API", "unplanned"), ...part("Billing", "billing")],
				skipped: part("Gone", "removed"),
			},
			{ comparison: [], named, baseOnlyBindings: new Set() },
		);
		expect(buckets).toEqual({
			plannedAndChanged: ["Billing"],
			outsidePlan: ["API", "Zulu"],
			plannedUnchanged: ["API", "Catalog"],
			changed: ["API", "Billing", "Zulu"],
		});
		expect(
			decideOutOfPlan({
				mode: "fail",
				hasProposal: true,
				footprintRead: true,
				outside: buckets.outsidePlan,
				labels: [],
				overrideLabel: "override",
			}).failed,
		).toBe(true);
	});
});

describe("changes outside the plan", () => {
	const base = {
		hasProposal: true,
		footprintRead: true,
		outside: ["Stock API"],
		labels: [] as string[],
		overrideLabel: "archboard: out of plan",
	};

	test("fail mode fails unless the pull request carries the override label", () => {
		expect(decideOutOfPlan({ ...base, mode: "fail" })).toEqual({ status: "fail", failed: true });
		expect(decideOutOfPlan({ ...base, mode: "fail", labels: [base.overrideLabel] })).toEqual({
			status: "overridden",
			failed: false,
		});
	});

	test("fail mode fails when the plan cannot be checked, unless the label lets it through", () => {
		const unread = { ...base, footprintRead: false, outside: [] };
		expect(decideOutOfPlan({ ...unread, mode: "fail" })).toEqual({
			status: "unjudged",
			failed: true,
		});
		expect(decideOutOfPlan({ ...unread, mode: "fail", labels: [base.overrideLabel] }).failed).toBe(
			false,
		);
		expect(decideOutOfPlan({ ...unread, mode: "warn" }).failed).toBe(false);
	});

	test("warn mode never fails, and with no proposal nothing is out of plan", () => {
		expect(decideOutOfPlan({ ...base, mode: "warn" }).failed).toBe(false);
		expect(decideOutOfPlan({ ...base, mode: "fail", hasProposal: false }).failed).toBe(false);
		expect(decideOutOfPlan({ ...base, mode: "off" }).status).toBe("off");
	});
});

describe("the sticky comment", () => {
	const report: PullRequestReport = {
		baseSha: "a".repeat(40),
		headSha: "b".repeat(40),
		choice: { state: states[1], source: "input" },
		comparison: ["modules: 1 added"],
		buckets: {
			plannedAndChanged: ["Checkout API"],
			outsidePlan: ["Stock API"],
			plannedUnchanged: ["Fulfilment worker"],
			changed: ["Checkout API", "Stock API"],
		},
		outOfPlan: { status: "fail", failed: true },
		overrideLabel: "archboard: out of plan",
		picturesNote: "The pictures are not shown: no token.",
	};

	test("starts with the marker, lists the buckets by module name and says how to override", () => {
		const text = pullRequestComment(report);
		expect(text.startsWith(COMMENT_MARKER)).toBe(true);
		expect(text).toContain("Checkout API");
		expect(text).toContain("Stock API");
		expect(text).toContain("Fulfilment worker");
		expect(text).toContain("`archboard: out of plan`");
		expect(text).not.toContain("<img");
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

describe("the entry", () => {
	const entry = join(import.meta.dir, "../../../actions/pull-request/run.ts");
	const root = scratch();
	const checkout = join(root, "work");
	const bare = join(root, "server/owner/name.git");
	const comments: { id: number; body: string }[] = [];
	const requests: string[] = [];
	let labels: string[] = [];
	let server: ReturnType<typeof Bun.serve>;
	let baseSha = "";
	let headSha = "";

	/**
	 * Run git in the checkout.
	 * @param args The arguments.
	 * @returns The output.
	 */
	function git(...args: string[]): string {
		const result = Bun.spawnSync(
			["git", "-c", "user.name=t", "-c", "user.email=t@example.test", ...args],
			{ cwd: checkout, env: { PATH: process.env["PATH"] ?? "", HOME: root } },
		);
		return result.stdout.toString().trim();
	}

	beforeAll(() => {
		Bun.spawnSync(["git", "init", "-q", "-b", "main", checkout]);
		writeFileSync(join(checkout, "a.txt"), "a");
		git("add", ".");
		git("commit", "-q", "-m", "base");
		baseSha = git("rev-parse", "HEAD");
		writeFileSync(join(checkout, "a.txt"), "b");
		git("commit", "-q", "-am", "head");
		headSha = git("rev-parse", "HEAD");
		Bun.spawnSync(["git", "init", "-q", "--bare", bare]);
		server = Bun.serve({
			port: 0,
			async fetch(request) {
				const url = new URL(request.url);
				requests.push(`${request.method} ${url.pathname}`);
				if (url.pathname.endsWith("/pulls/7"))
					return Response.json({ body: "", labels: labels.map((name) => ({ name })) });
				if (request.method === "GET") return Response.json(comments);
				const body = ((await request.json()) as { body: string }).body;
				const existing = comments.find((one) => url.pathname.endsWith(`/${String(one.id)}`));
				if (existing === undefined) comments.push({ id: comments.length + 1, body });
				else existing.body = body;
				return Response.json({ id: 1 });
			},
		});
	});
	afterAll(() => server.stop(true));

	/**
	 * Run the action as the pull request's workflow would.
	 * @param inputs The inputs and the repository's server to override.
	 * @param fork Whether the pull request comes from a fork.
	 * @param answers Answers to replace in the stand-in CLI.
	 * @returns The step's exit status and output.
	 */
	async function step(
		inputs: Record<string, string> = {},
		fork = false,
		answers: Readonly<Record<string, string>> = {},
	) {
		const folder = scratch();
		for (const name of new Set([
			"proposals",
			"read-base",
			"read-head",
			"footprint",
			...Object.keys(answers),
		])) {
			writeFileSync(join(folder, `${name}.json`), answers[name] ?? fixture(`${name}.json`));
		}
		const event = join(folder, "event.json");
		writeFileSync(
			event,
			JSON.stringify({
				pull_request: {
					number: 7,
					body: "",
					base: { sha: baseSha, ref: "main", repo: repository("owner/name") },
					head: { sha: headSha, repo: repository(fork ? "someone/name" : "owner/name") },
					labels: [],
				},
			}),
		);
		const cli = writeStandIn(folder);
		writeFileSync(
			cli,
			readFileSync(cli, "utf8").replace(
				"#!/bin/sh",
				'#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$FAKE_DIR/commands.log"',
			),
		);
		const result = await runEntryAsync(entry, {
			ARCHBOARD_BIN: cli,
			FAKE_DIR: folder,
			GITHUB_WORKSPACE: checkout,
			GITHUB_EVENT_PATH: event,
			GITHUB_REPOSITORY: "owner/name",
			GITHUB_SERVER_URL: `file://${join(root, "server")}`,
			GITHUB_API_URL: `http://127.0.0.1:${String(server.port)}`,
			GITHUB_STEP_SUMMARY: join(folder, "summary.md"),
			ARCHBOARD_INPUT_GITHUB_TOKEN: "token",
			...inputs,
		});
		return { ...result, commands: readFileSync(join(folder, "commands.log"), "utf8") };
	}

	test("warns about a change outside the plan, posts the comment and publishes the pictures", async () => {
		const result = await step();
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("::warning title=Archboard plan::");
		expect(comments).toHaveLength(1);
		expect(comments[0]?.body).toContain(COMMENT_MARKER);
		expect(comments[0]?.body).toContain("Stock API");
		expect(comments[0]?.body).toContain(`pr-7/${headSha}/after-light.svg`);
		const published = Bun.spawnSync([
			"git",
			`--git-dir=${bare}`,
			"show",
			`archboard-assets:pr-7/${headSha}/after-light.svg`,
		]);
		expect(published.stdout.toString().trim()).toBe("<svg/>");
	});

	test("fail mode fails, the override label lets the pull request through, and the comment is updated", async () => {
		const failing = await step({ ARCHBOARD_INPUT_OUT_OF_PLAN: "fail" });
		expect(failing.exitCode).toBe(1);
		labels = ["archboard: out of plan"];
		const overridden = await step({ ARCHBOARD_INPUT_OUT_OF_PLAN: "fail" });
		expect(overridden.exitCode).toBe(0);
		expect(comments).toHaveLength(1);
		expect(comments[0]?.body).toContain("lets this pull request through");
		// The same head again: its pictures are on the branch already, and the comment still shows them.
		expect(comments[0]?.body).toContain(`pr-7/${headSha}/after-light.svg`);
		expect(requests.filter((one) => one.startsWith("PATCH"))).not.toHaveLength(0);
		labels = [];
	});

	test("a pull request from a fork still gets its comment, without pictures, and says why", async () => {
		comments.length = 0;
		const result = await step({ GITHUB_SERVER_URL: `file://${join(root, "missing")}` }, true);
		expect(result.exitCode).toBe(0);
		expect(comments[0]?.body).not.toContain("<img");
		expect(comments[0]?.body).toContain("fork");
		expect(readFileSync(join(root, "work/a.txt"), "utf8")).toBe("b");
	});

	test("a refused model read leaves the plan unjudged, and fail mode fails on it", async () => {
		const result = await step({ ARCHBOARD_INPUT_OUT_OF_PLAN: "fail" }, false, {
			"read-base": JSON.stringify({ success: false, code: "INVALID_MODEL" }),
		});
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("::warning title=Archboard plan::");
		expect(comments[0]?.body).not.toContain("**Planned and changed**");
		expect(comments[0]?.body).toContain("could not be checked, so this check fails");
	});

	test("the footprint counts from the base branch, which every checkout has, and reports unread modules", async () => {
		const footprint = JSON.parse(fixture("footprint.json"));
		footprint.skipped = [
			{ subject: { id: "Shop/a#infra", name: "Infrastructure" }, reason: "base-unresolved" },
		];
		const result = await step({}, false, { footprint: JSON.stringify(footprint) });
		expect(result.exitCode).toBe(0);
		expect(result.commands).toContain("model footprint --base origin/main");
		expect(result.commands).not.toContain(baseSha);
		expect(comments[0]?.body).toContain("Infrastructure (base-unresolved)");
	});

	test("an adopted proposal never lists a module it removed as planned but unchanged", async () => {
		const head = JSON.parse(fixture("read-head.json"));
		head.modules = head.modules.filter((module: { id: string }) => module.id !== "Shop/a#n4");
		const proposals = JSON.parse(fixture("proposals.json"));
		proposals.states = [{ id: "p1", name: "Queued fulfilment", lifecycle: "current" }];
		const result = await step({ ARCHBOARD_INPUT_STATE: "p1" }, false, {
			proposals: JSON.stringify(proposals),
			"read-head": JSON.stringify(head),
			footprint: JSON.stringify({ changed: part("Checkout API", "Shop/a#n1"), skipped: [] }),
		});
		expect(result.exitCode).toBe(0);
		expect(result.commands.match(/model footprint/gu)).toHaveLength(1);
		const body = comments[0]?.body ?? "";
		expect(body).toContain("- Checkout API");
		expect(body).not.toContain("- Payments");
	});
});
