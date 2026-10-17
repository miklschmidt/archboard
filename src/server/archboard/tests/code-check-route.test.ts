// The code check runs on a route of its own, never inside the check that
// every open canvas polls every 5 seconds (ADR 0045, ADR 0046), and the caller
// that hangs up cancels it, because it runs as checkout work. A variant that
// names no draft is refused with the drafts that exist, and so is a plan JSON
// outside every registered checkout.
//
// The production application answers both routes over a vault this owner
// makes in a Git repository of its own; a stand-in check proves the
// cancellation without depending on how long a real reading takes.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type * as ServerModule from "@/server/archboard/index";
import type * as RouteModule from "@/server/archboard/code-check";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@/shared/code-check/index";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@/shared/semantic-board/index";
import { VaultCheckSchema } from "@/shared/semantic-policy/index";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-check-route-"));
const checkout = join(scratch, "checkout");
const vault = join(checkout, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
let server: typeof ServerModule;
let route: typeof RouteModule;
const listening: Server[] = [];

/**
 * Run Git in the owner's repository.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	const run = Bun.spawnSync(["git", ...args], {
		cwd: checkout,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: join(scratch, "gitconfig"),
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
}

/**
 * Listen on a free port.
 * @param app The application.
 * @returns Its base URL.
 */
async function listen(app: express.Express): Promise<string> {
	const http = await new Promise<Server>((resolve) => {
		const started = app.listen(0, "127.0.0.1", () => resolve(started));
	});
	listening.push(http);
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	return `http://127.0.0.1:${address.port}`;
}

beforeAll(async () => {
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	writeFileSync(
		process.env["ARCHBOARD_REPOS"] ?? "",
		JSON.stringify([
			{
				repo: "github.com/test/route",
				root: checkout,
				source: "declared",
				addedAt: "2026-10-06T00:00:00.000Z",
			},
		]),
	);
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", "https://github.com/test/route.git");
	mkdirSync(vault, { recursive: true });
	writeFileSync(join(checkout, "src", "a.ts"), "1\n");
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		JSON.stringify({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "bd",
			name: "Shop",
			level: "system",
			version: 1,
			createdAt: "2026-10-06T00:00:00.000Z",
			updatedAt: "2026-10-06T00:00:00.000Z",
			current: "v1",
			variants: [
				{
					id: "v1",
					name: "Built",
					lifecycle: "current",
					content: {
						nodes: [
							{
								id: "pA",
								name: "Checkout",
								kind: "module",
								order: 1000,
								binding: { repo: "github.com/test/route", path: "src/a.ts", symbol: "settle" },
							},
						],
					},
				},
				{ id: "v2", name: "PR 1", lifecycle: "draft", parent: "v1", content: {} },
				{ id: "v3", name: "PR 2", lifecycle: "draft", parent: "v2", content: {} },
			],
		}),
	);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the board and its code");
	writeFileSync(join(checkout, "src", "a.ts"), "2\n");
	git("commit", "-q", "--no-gpg-sign", "-am", "change a.ts");
	[server, route] = await Promise.all([
		import("@/server/archboard/index"),
		import("@/server/archboard/code-check"),
	]);
});

afterAll(() => {
	for (const http of listening) http.close();
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("the polled check never reads code or says how far a board is behind, and the code check route does", async () => {
	const base = await listen(server.app);
	const polled = VaultCheckSchema.passthrough().parse(
		await (await fetch(`${base}/api/vault/check?vault=${encodeURIComponent(vault)}`)).json(),
	);
	expect(Object.keys(polled)).not.toContain("behind");
	expect(polled.diagnostics.map((one) => one.code)).not.toContain("BINDING_SYMBOL_MISSING");
	const answer = CodeCheckAnswerSchema.parse(
		await (await fetch(`${base}/api/vault/code-check?vault=${encodeURIComponent(vault)}`)).json(),
	);
	expect(answer.timings.map((timing) => timing.check)).toEqual(["code-facts", "history"]);
	expect(answer.timings.every((timing) => timing.elapsedMs > 0)).toBe(true);
	expect(answer.boards.map((one) => one.board)).toEqual(["Shop"]);
	expect(answer.findings.map((one) => [one.code, one.subject?.id])).toEqual([
		["BINDING_SYMBOL_MISSING", "pA"],
	]);
	const [shop] = answer.behind;
	expect(shop !== undefined && "parts" in shop ? shop.parts[0]?.commits.length : undefined).toBe(1);
});

test("every-draft reads every draft of a board, and says once how far the board is behind", async () => {
	const base = await listen(server.app);
	const answer = CodeCheckAnswerSchema.parse(
		await (
			await fetch(
				`${base}/api/vault/code-check?${new URLSearchParams({ vault, "every-draft": "true" })}`,
			)
		).json(),
	);
	expect(answer.boards.map((one) => [one.board, one.variant])).toEqual([
		["Shop", "v2"],
		["Shop", "v3"],
	]);
	expect(answer.behind.map((one) => one.board)).toEqual(["Shop"]);
});

test("a variant that names no draft is refused", async () => {
	const base = await listen(server.app);
	const refused = await fetch(
		`${base}/api/vault/code-check?vault=${encodeURIComponent(vault)}&variant=TASK-0`,
	);
	expect(refused.status).toBe(422);
	expect(await refused.json()).toMatchObject({ success: false, code: "NO_SUCH_DRAFT" });
});

test("a plan outside every registered checkout is refused before the pass", async () => {
	const base = await listen(server.app);
	const outside = join(scratch, "plan.json");
	writeFileSync(outside, '{"configuration":{"root_module":{}}}');
	const refused = await fetch(
		`${base}/api/vault/code-check?${new URLSearchParams({ vault, plan: outside })}`,
	);
	expect(refused.status).toBe(422);
	expect(await refused.json()).toMatchObject({ success: false, code: "PLAN_REFUSED" });
});

test("a caller that hangs up cancels the code check", async () => {
	const app = express();
	let started!: () => void;
	const running = new Promise<void>((resolve) => {
		started = resolve;
	});
	const cancelled = new Promise<unknown>((resolve) => {
		route.mountCodeCheckRoute(app, {
			check: async ({ signal }): Promise<CodeCheckAnswer> => {
				started();
				await new Promise<void>((settle) => {
					signal.addEventListener("abort", () => settle(), { once: true });
				});
				resolve(signal.reason);
				throw signal.reason;
			},
		});
	});
	const base = await listen(app);
	const hangUp = new AbortController();
	const request = fetch(`${base}/api/vault/code-check?vault=${encodeURIComponent(vault)}`, {
		signal: hangUp.signal,
	}).catch((error: unknown) => error);
	await running;
	hangUp.abort();
	await request;
	expect(await cancelled).toBeInstanceOf(Error);
});
