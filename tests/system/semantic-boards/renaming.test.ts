import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { openTestPane, waitForPaneMessageWhere } from "../support/pane-websocket.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

// Renaming through the public surface (TASK-281): the command renames, the
// old names go on opening what they named — a drill-down on another board, a
// saved pane address, a later command — and a pane showing the board is moved
// to its new name. The store's own owner proves identity and refusals inside
// the write; this one proves the pieces around it join up.

const repoRoot = path.resolve(import.meta.dir, "../../..");
const holder = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-semantic-renaming-"));
const vault = vaultIn(holder);
let server: OwnedServer;

/**
 * Run one archboard command against the owned server.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
const cli = (args: readonly string[], input?: string) =>
	runServerCli({ repoRoot, server, args, input });

/**
 * The version a board is at, read the way an agent reads it.
 * @param name The board, as it is now or as it was.
 * @returns The version.
 */
function versionOf(name: string): number {
	return JSON.parse(cli(["semantic", "show", name]).stdout).board.version;
}

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: path.join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});

afterAll(async () => {
	await server?.dispose();
	fs.rmSync(holder, { recursive: true, force: true });
});

test("a renamed board keeps its links, its pane and its old address", async () => {
	const request = createJsonRequester(server);
	const made = cli(
		["semantic", "new", "platform-public-api", "--doing", "drawing the public API"],
		JSON.stringify({ level: "system", nodes: [{ name: "API", kind: "service" }] }),
	);
	expect(made.status, made.stderr).toBe(0);
	const branched = cli([
		"semantic",
		"branch",
		"platform-public-api",
		"--as",
		"public-api-independent",
		"--expect-version",
		String(versionOf("platform-public-api")),
		"--doing",
		"proposing independent APIs",
	]);
	expect(branched.status, branched.stderr).toBe(0);
	const linking = cli(
		["semantic", "new", "edge", "--doing", "drawing the edge"],
		JSON.stringify({
			level: "system",
			nodes: [
				{ name: "Gateway", kind: "service" },
				{
					name: "Public API",
					kind: "system",
					drillDown: {
						board: "platform-public-api",
						variant: { kind: "named", name: "public-api-independent" },
					},
				},
			],
			edges: [{ from: "Gateway", to: "Public API", kind: "call" }],
		}),
	);
	expect(linking.status, linking.stderr).toBe(0);
	const before = JSON.parse(cli(["semantic", "show", "platform-public-api"]).stdout).board;

	const pane = await openTestPane(server.base, request, "pane-renaming", 0, {
		board: "platform-public-api@public-api-independent",
	});
	try {
		// A stale rename changes nothing.
		const stale = cli([
			"semantic",
			"rename",
			"platform-public-api",
			"--to",
			"Platform Public API",
			"--expect-version",
			String(before.version - 1),
			"--doing",
			"naming the board",
		]);
		expect(stale.status).not.toBe(0);
		expect(versionOf("platform-public-api")).toBe(before.version);

		const start = pane.since();
		const renamed = cli([
			"semantic",
			"rename",
			"platform-public-api",
			"--to",
			"Platform Public API",
			"--expect-version",
			String(before.version),
			"--doing",
			"giving the public API board a readable name",
		]);
		expect(renamed.status, renamed.stderr).toBe(0);
		const answer = JSON.parse(renamed.stdout);
		expect(answer.board).toMatchObject({ id: before.id, name: "Platform Public API" });
		expect(answer.version).toBe(before.version + 1);

		// The pane on the board is moved to its new name, variant and all.
		const moved = await waitForPaneMessageWhere(
			pane,
			start,
			(message) => message.type === "pane_board",
		);
		expect(moved?.board).toBe("platform public api@public-api-independent");

		const variantRenamed = cli([
			"semantic",
			"rename",
			"platform-public-api",
			"--variant",
			"public-api-independent",
			"--to",
			"Independent Public and Phone APIs",
			"--expect-version",
			String(answer.version),
			"--doing",
			"naming the proposal for what it proposes",
		]);
		expect(variantRenamed.status, variantRenamed.stderr).toBe(0);
		const after = JSON.parse(variantRenamed.stdout).board;
		expect(after.variants.map((one: { id: string }) => one.id)).toEqual(
			before.variants.map((one: { id: string }) => one.id),
		);

		// The listing names the board as it is now, and the other board's link
		// to it lands on that name without the other board having changed.
		const listing = await request<{
			boards: { name: string; version: number; links: { board: string }[] }[];
		}>("/api/semantic-boards");
		const names = listing.body.boards.map((one) => one.name);
		expect(names).toContain("Platform Public API");
		expect(names).not.toContain("platform-public-api");
		const edge = listing.body.boards.find((one) => one.name === "edge");
		expect(edge?.version).toBe(1);
		expect(edge?.links.map((link) => link.board)).toEqual(["Platform Public API"]);

		// A saved pane address naming both old names opens the board, and the
		// address the pane is given is the one it answers to now.
		const shown = await request<{ board: string }>("/api/panes/show", {
			method: "POST",
			body: { board: "platform-public-api@public-api-independent", pane: pane.clientId },
		});
		expect(shown.status).toBe(200);
		expect(shown.body.board).toBe("platform public api@Independent Public and Phone APIs");
	} finally {
		await pane.close();
	}
}, 60_000);

test("a name already taken is refused, and a claim follows the board it was taken on", async () => {
	const request = createJsonRequester(server);
	const made = cli(
		["semantic", "new", "common-weblib", "--doing", "drawing the web library"],
		JSON.stringify({ level: "system" }),
	);
	expect(made.status, made.stderr).toBe(0);
	const refused = cli([
		"semantic",
		"rename",
		"common-weblib",
		"--to",
		"platform-public-api",
		"--expect-version",
		String(versionOf("common-weblib")),
		"--doing",
		"taking a name another board used to have",
	]);
	expect(refused.status).not.toBe(0);
	expect(JSON.parse(cli(["semantic", "show", "common-weblib"]).stdout).board.name).toBe(
		"common-weblib",
	);
	expect(JSON.parse(cli(["semantic", "show", "platform-public-api"]).stdout).board.name).toBe(
		"Platform Public API",
	);

	const claimed = await request<{ created: boolean }>(
		"/api/semantic-boards/claim?board=common-weblib",
		{ method: "POST", body: { reason: "naming every board" } },
	);
	expect(claimed.body.created).toBe(true);
	const renamed = cli([
		"semantic",
		"rename",
		"common-weblib",
		"--to",
		"Common Web Library",
		"--expect-version",
		String(versionOf("common-weblib")),
		"--doing",
		"giving the web library a readable name",
	]);
	expect(renamed.status, renamed.stderr).toBe(0);
	// Claiming the board by its new name extends the campaign that renamed it.
	const again = await request<{ created: boolean }>(
		"/api/semantic-boards/claim?board=Common Web Library",
		{ method: "POST", body: { reason: "naming every board" } },
	);
	expect(again.body.created).toBe(false);
	await request("/api/semantic-boards/claim/release?board=Common Web Library", { method: "POST" });
});
