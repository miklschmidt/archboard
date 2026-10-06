// The locality route (ADR 0045): the production application answers the
// hotspots of a board over a vault this owner makes in a Git repository of its
// own, refuses what it cannot read, and a caller that hangs up cancels the
// reading, because it runs as checkout work. A stand-in reading proves the
// cancellation without depending on how long a real reading takes.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type * as ServerModule from "@/server/archboard/index";
import type * as RouteModule from "@/server/archboard/locality";
import { LocalityReplySchema, type LocalityAnswer } from "@/shared/locality/index";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@/shared/semantic-board/index";

const caller = {
	ARCHBOARD_VAULT: process.env["ARCHBOARD_VAULT"],
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-locality-route-"));
const checkout = join(scratch, "checkout");
const vault = join(checkout, "vault");
process.env["ARCHBOARD_VAULT"] = vault;
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
			current: "v2",
			variants: [
				{
					id: "v1",
					name: "Before",
					lifecycle: "historical",
					content: { nodes: [node("pA", "Checkout", "src/a.ts")] },
				},
				{
					id: "v2",
					name: "Built",
					lifecycle: "current",
					parent: "v1",
					content: { nodes: [node("pA", "Checkout", "src/a.ts")] },
				},
			],
		}),
	);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the board and its code");
	writeFileSync(join(checkout, "src", "a.ts"), "2\n");
	git("commit", "-q", "--no-gpg-sign", "-am", "change a.ts");
	[server, route] = await Promise.all([
		import("@/server/archboard/index"),
		import("@/server/archboard/locality"),
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
	const reply = await fetch(`${base}/api/semantic-boards/locality?board=Shop`);
	expect(reply.status).toBe(200);
	const answer = LocalityReplySchema.parse(await reply.json());
	expect(answer.variant.id).toBe("v2");
	expect(answer.hotspots.map((one) => [one.subject.name, one.count])).toEqual([["Checkout", 2]]);
});

test("a request that cannot be read is refused with the reason, and nothing is walked", async () => {
	const base = await listen(server.app);
	const refused = async (query: string): Promise<[number, string]> => {
		const reply = await fetch(`${base}/api/semantic-boards/locality?${query}`);
		const body = (await reply.json()) as { success: boolean; error: string };
		expect(body.success).toBe(false);
		return [reply.status, body.error];
	};
	expect((await refused(""))[0]).toBe(400);
	expect((await refused("board=Nobody"))[0]).toBe(404);
	expect((await refused("board=Shop&since=last%20week"))[0]).toBe(400);
	expect((await refused("board=Shop&since="))[0]).toBe(400);
	expect((await refused("board=Shop&variant=Before"))[0]).toBe(400);
	expect((await refused("board=Shop&variant=Nowhere"))[0]).toBe(400);
});

test("a caller that hangs up cancels the reading", async () => {
	const app = express();
	let started!: () => void;
	const running = new Promise<void>((resolve) => {
		started = resolve;
	});
	const cancelled = new Promise<unknown>((resolve) => {
		route.mountLocalityRoute(app, {
			read: async (_board, _variant, _since, signal): Promise<LocalityAnswer> => {
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
	const request = fetch(`${base}/api/semantic-boards/locality?board=Shop`, {
		signal: hangUp.signal,
	}).catch((error: unknown) => error);
	await running;
	hangUp.abort();
	await request;
	expect(await cancelled).toBeInstanceOf(Error);
});
