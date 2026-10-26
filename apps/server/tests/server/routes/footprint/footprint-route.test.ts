// The footprint's route, `GET /api/semantic-boards/footprint` (ADR 0045): the
// production application answers it over a vault this owner makes in a Git
// repository of its own, it turns a request away with a code the CLI maps to an
// exit status, and a caller that hangs up cancels the reading, because it runs as
// checkout work. Which variants a footprint reads is the reading's own rule,
// which its package tests. A stand-in reading proves the cancellation without depending
// on how long a real one takes.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type * as ServerModule from "#server/wiring/application/application.ts";
import type * as RouteModule from "#server/routes/footprint/footprint-route.ts";
import { FootprintReplySchema } from "@archboard/code-intel/history";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-footprint-route-"));
const checkout = join(scratch, "checkout");
const vault = join(checkout, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const REPO = "github.com/test/footprint";
let server: typeof ServerModule;
let route: typeof RouteModule;
let before = "";
const listening: Server[] = [];

/**
 * Run Git in the owner's repository.
 * @param args Git's arguments.
 * @returns Git's trimmed output.
 */
function git(...args: string[]): string {
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
	return run.stdout.toString().trim();
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

/**
 * One part of the board.
 * @param id Its id.
 * @param name Its name.
 * @param file The file it binds.
 * @param order Where it stands.
 * @returns The part.
 */
function part(id: string, name: string, file: string, order = 1000) {
	return {
		id,
		name,
		kind: "module",
		order,
		binding: { repo: REPO, path: file },
	};
}

beforeAll(async () => {
	mkdirSync(join(checkout, "src"), { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	writeFileSync(
		process.env["ARCHBOARD_REPOS"] ?? "",
		JSON.stringify([
			{ repo: REPO, root: checkout, source: "declared", addedAt: "2026-10-06T00:00:00.000Z" },
		]),
	);
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${REPO}.git`);
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
					content: { nodes: [part("pA", "Checkout", "src/a.ts")] },
				},
				{
					id: "v2",
					name: "Plan",
					lifecycle: "draft",
					parent: "v1",
					content: {
						nodes: [part("pA", "Checkout", "src/a.ts"), part("pB", "Billing", "src/b.ts", 2000)],
					},
				},
				{
					id: "v3",
					name: "Old plan",
					lifecycle: "shelved",
					parent: "v1",
					content: { nodes: [part("pA", "Checkout", "src/a.ts")] },
				},
			],
		}),
	);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the board and its code");
	before = git("rev-parse", "HEAD");
	writeFileSync(join(checkout, "src", "a.ts"), "2\n");
	git("commit", "-q", "--no-gpg-sign", "-am", "change a.ts");
	[server, route] = await Promise.all([
		import("#server/wiring/application/application.ts"),
		import("#server/routes/footprint/footprint-route.ts"),
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

test("the production application answers the footprint of a proposal against a commit", async () => {
	const base = await listen(server.app);
	const query = new URLSearchParams({ vault, board: "Shop", base: before, variant: "Plan" });
	const reply = await fetch(`${base}/api/semantic-boards/footprint?${query}`);
	expect(reply.status).toBe(200);
	const answer = FootprintReplySchema.parse(await reply.json());
	if (answer.proposal === null) throw new Error("a proposal was named");
	expect(answer.changedNotNamed.map((one) => one.subject.id)).toEqual(["pA"]);
	expect(answer.namedNotChanged.map((one) => one.subject.id)).toEqual(["pB"]);
});

test("a request that cannot be read is turned away with the code the CLI maps to its exit status", async () => {
	const base = await listen(server.app);
	const refusal = async (params: Record<string, string>) => {
		const reply = await fetch(
			`${base}/api/semantic-boards/footprint?${new URLSearchParams({ vault, ...params })}`,
		);
		const body: unknown = await reply.json();
		return { status: reply.status, body };
	};
	expect((await refusal({ board: "Shop" })).status).toBe(400);
	expect(await refusal({ board: "Nope", base: before })).toMatchObject({
		status: 404,
		body: { code: "BOARD_MISSING" },
	});
	expect(await refusal({ board: "Shop", base: before, variant: "Missing" })).toMatchObject({
		status: 422,
		body: { code: "UNKNOWN_VARIANT" },
	});
	expect(await refusal({ board: "Shop", base: before, head: "no-such-layer" })).toMatchObject({
		status: 422,
		body: { code: "HEAD_UNRESOLVED" },
	});
});

test("a caller that hangs up cancels the reading", async () => {
	const app = express();
	let started!: () => void;
	const running = new Promise<void>((resolve) => {
		started = resolve;
	});
	const cancelled = new Promise<unknown>((resolve) => {
		route.mountFootprintRoute(app, {
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
		`${base}/api/semantic-boards/footprint?vault=${encodeURIComponent(vault)}&board=Shop&base=${before}`,
		{
			signal: hangUp.signal,
		},
	).catch((error: unknown) => error);
	await running;
	hangUp.abort();
	await request;
	expect(await cancelled).toBeInstanceOf(Error);
});
