// The design questions route (ADR 0044, ADR 0059): the production application
// answers the three questions over the current variant of the boards of the
// vault a request names, narrows to the boards it names, lists the boards it
// skipped, and refuses a request that names no vault or a board nobody has.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as ServerModule from "#server/wiring/application/application.ts";
import { DesignQuestionsReplySchema } from "@archboard/board/design-questions";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = mkdtempSync(join(tmpdir(), "archboard-design-questions-route-"));
const vault = join(scratch, "checkout", ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
let server: typeof ServerModule;
const listening: Server[] = [];

// Every subject of a variant has an order of its own.
let ordered = 0;
const node = (id: string, name: string, parent?: string) => ({
	id,
	name,
	kind: "module",
	order: (ordered += 1000),
	...(parent === undefined ? {} : { parent }),
});
const edge = (id: string, from: string, to: string) => ({
	id,
	from,
	to,
	kind: "call",
	order: (ordered += 1000),
});

/** A board of the vault: a current one names its current variant. */
const board = (name: string, id: string, variants: object[], current?: string) => ({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id,
	name,
	level: "system",
	version: 1,
	createdAt: "2026-10-25T00:00:00.000Z",
	updatedAt: "2026-10-25T00:00:00.000Z",
	...(current === undefined ? {} : { current }),
	variants,
});

beforeAll(async () => {
	mkdirSync(vault, { recursive: true });
	const built = (content: object) => [{ id: "v1", name: "Built", lifecycle: "current", content }];
	// Cart receives a call and passes one on, so it is a pass-through entry point of Shop.
	writeFileSync(
		join(vault, "Shop.semantic.json"),
		JSON.stringify(
			board(
				"Shop",
				"bs",
				built({
					nodes: [
						node("pS", "Shop"),
						node("pC", "Cart", "pS"),
						node("pW", "Web"),
						node("pD", "Disk"),
					],
					edges: [edge("eA", "pW", "pC"), edge("eB", "pC", "pD")],
				}),
				"v1",
			),
		),
	);
	// Nothing outside Vault reaches Keys, so Vault has no entry point.
	writeFileSync(
		join(vault, "Vault.semantic.json"),
		JSON.stringify(
			board(
				"Vault",
				"bv",
				built({ nodes: [node("pV", "Vault"), node("pK", "Keys", "pV")], edges: [] }),
				"v1",
			),
		),
	);
	writeFileSync(
		join(vault, "Plan.semantic.json"),
		JSON.stringify(
			board("Plan", "bp", [
				{ id: "v1", name: "Idea", lifecycle: "draft", content: { nodes: [node("pG", "Gateway")] } },
			]),
		),
	);
	server = await import("#server/wiring/application/application.ts");
});

afterAll(() => {
	for (const http of listening) http.close();
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Ask the production application for the design questions.
 * @param query The query string after the route, vault included when a test sends it.
 * @returns The status and the body.
 */
async function ask(query: string): Promise<{ status: number; body: unknown }> {
	const http = await new Promise<Server>((resolve) => {
		const started = server.app.listen(0, "127.0.0.1", () => resolve(started));
	});
	listening.push(http);
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	const reply = await fetch(`http://127.0.0.1:${address.port}/api/vault/design-questions?${query}`);
	return { status: reply.status, body: await reply.json() };
}

const inVault = `vault=${encodeURIComponent(vault)}`;

test("the route answers every board at its current variant and lists the board nobody has built as skipped", async () => {
	const { status, body } = await ask(inVault);
	expect(status).toBe(200);
	const reply = DesignQuestionsReplySchema.parse(body);
	expect(reply.boards.map((one) => one.board).toSorted()).toEqual(["Shop", "Vault"]);
	expect(reply.skipped).toEqual([{ board: "Plan", reason: "no-current-variant" }]);
	expect(reply.questions.passThroughEntryPoints.results.map((one) => one.parts[0]?.name)).toEqual([
		"Cart",
	]);
	expect(reply.questions.containersWithNoEntryPoint.results.map((one) => one.board)).toEqual([
		"Vault",
	]);
});

test("a repeated board narrows the answer to the boards it names", async () => {
	const { body } = await ask(`${inVault}&board=Vault&board=Plan`);
	const reply = DesignQuestionsReplySchema.parse(body);
	expect(reply.boards.map((one) => one.board)).toEqual(["Vault"]);
	expect(reply.skipped.map((one) => one.board)).toEqual(["Plan"]);
	expect(reply.questions.passThroughEntryPoints.results).toEqual([]);
});

test("a board nobody has is refused with its name, and a request that names no vault is refused", async () => {
	const missing = await ask(`${inVault}&board=Shop&board=Shpo`);
	expect(missing.status).toBe(404);
	expect(missing.body).toMatchObject({ success: false, code: "BOARD_MISSING", missing: ["Shpo"] });
	const unnamed = await ask("");
	expect(unnamed.status).toBe(400);
	expect(unnamed.body).toMatchObject({ success: false, code: "VAULT_REQUIRED" });
});
