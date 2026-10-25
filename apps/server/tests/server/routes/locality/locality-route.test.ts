// The locality route (ADR 0045): the production application answers the
// hotspots of a board over a vault this owner makes in a Git repository of its
// own, refuses what it cannot read with the status the refusal maps to, and a
// caller that hangs up cancels the reading, because it runs as checkout work.
// Which variant the reading reads is its own rule, which its package tests. A
// stand-in reading proves the cancellation without depending on how long a
// real reading takes.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type * as ServerModule from "#server/wiring/application/application.ts";
import type * as RouteModule from "#server/routes/locality/locality-route.ts";
import { LocalityReplySchema } from "@archboard/code-intel/history";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-locality-route-"));
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

const node = (id: string, name: string, path: string) => ({
	id,
	name,
	kind: "module",
	order: 1000,
	binding: { repo: "github.com/test/route", path },
});
const content = { nodes: [node("pA", "Checkout", "src/a.ts")] };

/** A board of the owner's vault: a current one names its current variant. */
const board = (name: string, variants: object[], current?: string) => ({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: name === "Shop" ? "bd" : "pl",
	name,
	level: "system",
	version: 1,
	createdAt: "2026-10-06T00:00:00.000Z",
	updatedAt: "2026-10-06T00:00:00.000Z",
	...(current === undefined ? {} : { current }),
	variants,
});

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
		JSON.stringify(
			board(
				"Shop",
				[
					{ id: "v1", name: "Before", lifecycle: "historical", content },
					{ id: "v2", name: "Built", lifecycle: "current", parent: "v1", content },
				],
				"v2",
			),
		),
	);
	writeFileSync(
		join(vault, "Plan.semantic.json"),
		JSON.stringify(board("Plan", [{ id: "v1", name: "Idea", lifecycle: "draft", content }])),
	);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the board and its code");
	writeFileSync(join(checkout, "src", "a.ts"), "2\n");
	git("commit", "-q", "--no-gpg-sign", "-am", "change a.ts");
	[server, route] = await Promise.all([
		import("#server/wiring/application/application.ts"),
		import("#server/routes/locality/locality-route.ts"),
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

test("the application answers the hotspots of a board's current variant", async () => {
	const base = await listen(server.app);
	const reply = await fetch(
		`${base}/api/semantic-boards/locality?vault=${encodeURIComponent(vault)}&board=Shop`,
	);
	expect(reply.status).toBe(200);
	const answer = LocalityReplySchema.parse(await reply.json());
	expect(answer.variant.id).toBe("v2");
	expect(answer.hotspots.map((one) => [one.subject.name, one.count])).toEqual([["Checkout", 2]]);
});

test("a request that cannot be read is refused with the code the command maps to its exit status", async () => {
	const base = await listen(server.app);
	const refused = async (query: string): Promise<[number, string]> => {
		const reply = await fetch(
			`${base}/api/semantic-boards/locality?vault=${encodeURIComponent(vault)}&${query}`,
		);
		const body = (await reply.json()) as { success: boolean; code: string };
		expect(body.success).toBe(false);
		return [reply.status, body.code];
	};
	expect(await refused("")).toEqual([400, "BAD_REQUEST"]);
	expect(await refused("board=Nobody")).toEqual([404, "BOARD_MISSING"]);
	expect(await refused("board=Plan")).toEqual([422, "NO_CURRENT_VARIANT"]);
	expect(await refused("board=Shop&since=last%20week")).toEqual([400, "BAD_REQUEST"]);
	expect(await refused("board=Shop&since=")).toEqual([400, "BAD_REQUEST"]);
});

test("a caller that hangs up cancels the reading", async () => {
	const app = express();
	let started!: () => void;
	const running = new Promise<void>((resolve) => {
		started = resolve;
	});
	const cancelled = new Promise<unknown>((resolve) => {
		route.mountLocalityRoute(app, {
			read: async ({ signal }) => {
				started();
				await new Promise<void>((settle) => {
					signal?.addEventListener("abort", () => settle(), { once: true });
				});
				resolve(signal?.reason);
				throw signal?.reason;
			},
		});
	});
	const base = await listen(app);
	const hangUp = new AbortController();
	const request = fetch(
		`${base}/api/semantic-boards/locality?vault=${encodeURIComponent(vault)}&board=Shop`,
		{
			signal: hangUp.signal,
		},
	).catch((error: unknown) => error);
	await running;
	hangUp.abort();
	await request;
	expect(await cancelled).toBeInstanceOf(Error);
});
