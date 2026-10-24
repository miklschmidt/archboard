// The render route and the repository its recipe names (ADR 0057). `repo: null`
// in a recipe says that the vault is in no Git repository, and nothing else: a
// Git that does not answer refuses the render, because an embed whose recipe
// said "no repository" would be checked against a vault that has one.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { BoardCreateInputSchema } from "@archboard/board/commands";
import { createBoardTransition } from "@archboard/board/store-write";
import { readRenderRecipe } from "@archboard/renderer/recipe";
import { requireVault } from "@archboard/workbench/host";
import { mountSemanticBoardRoutes } from "#server/routes/semantic-boards/semantic-board-routes.ts";

const scratch = mkdtempSync(join(tmpdir(), "archboard-render-recipe-route-"));
const vault = join(scratch, ".archboard", "vault");
let http: Server;
let base: string;

beforeAll(async () => {
	mkdirSync(vault, { recursive: true });
	const created = createBoardTransition(
		BoardCreateInputSchema.parse({
			name: "Example",
			level: "system",
			nodes: [{ name: "API", kind: "service" }],
		}),
	).apply(null, "2026-10-01T12:00:00.000Z");
	if (!created.ok) throw new Error(created.problem);
	writeFileSync(join(vault, "Example.semantic.json"), JSON.stringify(created.board));
	const app = express();
	app.use(express.json());
	mountSemanticBoardRoutes(app);
	app.use(requireVault);
	http = await new Promise<Server>((resolve) => {
		const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
	});
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
	http.close();
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Ask the render route.
 * @param query The selectors beyond the board and the vault.
 * @returns The response.
 */
function render(query: Record<string, string>): Promise<Response> {
	return fetch(
		`${base}/api/semantic-boards/render?${new URLSearchParams({ board: "Example", vault, ...query })}`,
	);
}

/** The query that asks for a board render, which carries a recipe. */
const standalone = { theme: "dark", fonts: "embedded" };

/**
 * Run a body while the first `git` on the PATH is killed, as one that times out is.
 * @param body What runs.
 */
async function withGitKilled(body: () => Promise<void>): Promise<void> {
	const bin = join(scratch, "bin");
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, "git"), "#!/bin/sh\nkill -9 $$\n");
	chmodSync(join(bin, "git"), 0o755);
	const path = process.env["PATH"];
	process.env["PATH"] = `${bin}:${path}`;
	try {
		await body();
	} finally {
		process.env["PATH"] = path;
	}
}

test("a board render of a vault in no Git repository names no repository", async () => {
	const reply = await render(standalone);
	expect(reply.status).toBe(200);
	const { svg } = (await reply.json()) as { svg: string };
	expect(readRenderRecipe(Buffer.from(svg, "utf8"))).toMatchObject({
		kind: "recipe",
		recipe: { vault: { repo: null } },
	});
});

test("a board render is refused, and not drawn with no repository, when Git does not answer", async () => {
	await withGitKilled(async () => {
		const reply = await render(standalone);
		expect(reply.status).toBeGreaterThanOrEqual(500);
		expect(await reply.json()).toMatchObject({
			success: false,
			code: "VAULT_REPOSITORY_UNKNOWN",
		});
		// A picture that carries no recipe has no use for the repository.
		expect((await render({})).status).toBe(200);
	});
});
