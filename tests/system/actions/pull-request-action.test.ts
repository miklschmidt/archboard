// The pull request action picks a proposal, reads its footprint, keeps one comment on the pull
// request and fails the step when changes outside the plan are not let through. The decisions run
// on their own. The entry runs against a stand-in `archboard`, a stand-in GitHub API and a local
// bare repository for the pictures branch.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pullRequestComment } from "../../../actions/pull-request/comment.ts";
import type { PullRequestReport } from "../../../actions/pull-request/comment.ts";
import {
	COMMENT_MARKER,
	findStickyComment,
	parseBodyMarker,
} from "../../../actions/pull-request/marker.ts";
import { chooseState } from "../../../actions/pull-request/plan.ts";
import type { ModelState } from "../../../actions/pull-request/plan.ts";
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
			changedIds: ["m#checkout", "m#stock"],
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
	/** The pull request's head on GitHub, when a later push moved it past the run's. */
	let movedTo: string | undefined;
	let moveOnRead: number | undefined;
	let headReads = 0;
	let refuseHead = false;

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

	const publishedHead = () =>
		Bun.spawnSync(["git", `--git-dir=${bare}`, "rev-parse", "archboard-assets"]).stdout.toString();

	beforeAll(() => {
		Bun.spawnSync(["git", "init", "-q", "-b", "main", checkout]);
		writeFileSync(join(checkout, "a.txt"), "a");
		mkdirSync(join(checkout, ".archboard/vault"), { recursive: true });
		writeFileSync(join(checkout, ".archboard/vault/model.json"), "{}");
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
				if (url.pathname.endsWith("/pulls/7")) {
					headReads += 1;
					if (refuseHead) return new Response("unavailable", { status: 503 });
					return Response.json({
						body: "",
						labels: labels.map((name) => ({ name })),
						head: {
							sha:
								moveOnRead !== undefined && headReads < moveOnRead ? headSha : (movedTo ?? headSha),
						},
					});
				}
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
		headReads = 0;
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
		expect(comments[0]?.body).toContain(`pr-7/${headSha}/before-light.svg`);
		expect(comments[0]?.body).toContain(`pr-7/${headSha}/after-light.svg`);
		const published = Bun.spawnSync([
			"git",
			`--git-dir=${bare}`,
			"show",
			`archboard-assets:pr-7/${headSha}/after-light.svg`,
		]);
		expect(published.stdout.toString()).toStartWith("<svg>");
	});

	test("equal pictures at the base and the head become one picture, close up on the changed code", async () => {
		const result = await step({ FAKE_PICTURE: "same" });
		expect(result.exitCode).toBe(0);
		expect(result.commands).toContain("--focus Shop/a#n1 --focus Shop/a#n2");
		const body = comments[0]?.body ?? "";
		expect(body).toContain("### Where the code changed");
		expect(body).toContain(`pr-7/${headSha}/focus-light.svg`);
		expect(body).not.toContain("before-light.svg");
		expect(body).toMatch(/\[Open the map, full size\]\([^)]*after-light\.svg\)/);
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
		expect(result.stdout).toContain("::error title=Archboard plan::");
		expect(comments[0]?.body).not.toContain("**Planned and changed**");
		expect(comments[0]?.body).toContain(COMMENT_MARKER);
	});

	test("proposals that cannot be read fail the step in fail mode, whether the CLI refuses or prints nothing", async () => {
		const refused = await step({ ARCHBOARD_INPUT_OUT_OF_PLAN: "fail" }, false, {
			proposals: JSON.stringify({
				success: false,
				code: "MODEL_INVALID",
				error: "The canonical model cannot be read coherently.",
				diagnostics: [
					{ code: "MALFORMED_JSON", file: "model.json", message: "Unexpected EOF\nat line 1" },
				],
			}),
		});
		expect(refused.exitCode).toBe(1);
		expect(refused.stdout).toContain("::error title=Archboard plan::");
		expect(comments.at(-1)?.body).toContain("MODEL_INVALID");
		expect(comments.at(-1)?.body).toContain(COMMENT_MARKER);
		expect(comments.at(-1)?.body).toContain("MALFORMED_JSON");
		expect(comments.at(-1)?.body).toContain("model.json");
		const silent = await step({}, false, { proposals: "" });
		expect(silent.exitCode).toBe(0);
		expect(silent.stdout).toContain("::warning title=Archboard plan::");
		expect(comments.at(-1)?.body).toContain(COMMENT_MARKER);
	});

	test("several drafts and no name fail the step in fail mode", async () => {
		const proposals = JSON.parse(fixture("proposals.json"));
		proposals.states = [
			{ id: "p1", name: "Queued fulfilment", lifecycle: "draft" },
			{ id: "p2", name: "Nightly batch", lifecycle: "draft" },
		];
		const result = await step({ ARCHBOARD_INPUT_OUT_OF_PLAN: "fail" }, false, {
			proposals: JSON.stringify(proposals),
		});
		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain("::error title=Archboard plan::");
	});

	test("a proposal that the pull request names and the model lacks fails the step in fail mode", async () => {
		const result = await step({
			ARCHBOARD_INPUT_OUT_OF_PLAN: "fail",
			ARCHBOARD_INPUT_STATE: "missing",
		});
		expect(result.exitCode).toBe(1);
		expect(comments.at(-1)?.body).toContain(COMMENT_MARKER);
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

	test("an adopted proposal names a module it removed as unread, never as planned but unchanged", async () => {
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
		expect(body).toContain("Payments");
	});

	test("a run of an older head publishes neither pictures nor comment", async () => {
		expect((await step()).commands).toContain("model render");
		const before = comments.map((one) => one.body);
		const sent = requests.length;
		movedTo = "f".repeat(40);
		try {
			const result = await step();
			expect(result.stdout).toContain("::notice::The pull request moved on");
			expect(result.stdout).toContain(movedTo.slice(0, 7));
			expect(comments.map((one) => one.body)).toEqual(before);
			expect(requests.slice(sent).filter((one) => !one.startsWith("GET"))).toHaveLength(0);
			expect(result.commands).not.toContain("model render");
		} finally {
			movedTo = undefined;
		}
	});

	test("a newer head during rendering preserves the published pictures and comment", async () => {
		await step();
		const before = publishedHead();
		const bodies = comments.map((one) => one.body);
		const current = headSha;
		headSha = baseSha;
		movedTo = current;
		moveOnRead = 3;
		try {
			const result = await step();
			expect(result.exitCode).toBe(0);
			expect(result.commands).toContain("model render");
			expect(publishedHead()).toBe(before);
			expect(comments.map((one) => one.body)).toEqual(bodies);
		} finally {
			headSha = current;
			movedTo = undefined;
			moveOnRead = undefined;
		}
	});

	test("a newer head while comments are listed prevents the comment write", async () => {
		const before = comments.map((one) => one.body);
		const sent = requests.length;
		movedTo = "f".repeat(40);
		moveOnRead = 4;
		try {
			const result = await step();
			expect(result.exitCode).toBe(0);
			expect(comments.map((one) => one.body)).toEqual(before);
			expect(requests.slice(sent).filter((one) => !one.startsWith("GET"))).toHaveLength(0);
		} finally {
			movedTo = undefined;
			moveOnRead = undefined;
		}
	});

	test("an unreadable current head permits neither picture nor comment publication", async () => {
		const before = comments.map((one) => one.body);
		const sent = requests.length;
		refuseHead = true;
		try {
			const result = await step();
			expect(result.exitCode).toBe(0);
			expect(result.commands).not.toContain("model render");
			expect(comments.map((one) => one.body)).toEqual(before);
			expect(requests.slice(sent).filter((one) => !one.startsWith("GET"))).toHaveLength(0);
		} finally {
			refuseHead = false;
		}
	});

	test("a head without a vault replaces the earlier comment and creates none", async () => {
		await step();
		const count = comments.length;
		git("rm", "-q", "-r", ".archboard");
		git("commit", "-q", "-m", "no vault");
		headSha = git("rev-parse", "HEAD");
		const updated = await step();
		expect(updated.exitCode).toBe(0);
		expect(updated.stdout).toContain("::notice::");
		expect(comments).toHaveLength(count);
		const sticky = comments.find((one) => one.body.includes(COMMENT_MARKER));
		expect(sticky?.body).toContain(headSha.slice(0, 7));
		comments.length = 0;
		expect((await step()).exitCode).toBe(0);
		expect(comments).toHaveLength(0);
	});
});
