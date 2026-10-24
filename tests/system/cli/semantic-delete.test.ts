// `archboard semantic delete` (ADR 0057, TASK-526.06): the real command
// deletes a board through an owned server. The store owners
// (`packages/board/tests/runtime/operations/write/discard.test.ts` and
// `delete.test.ts`) hold what the delete removes and refuses, a holder of the
// board and the drill-downs that do and do not keep it; this owner holds the
// command around it: the exit status of each refusal, the answer's tracked
// embeds, the file gone, what a pane on the board is told, and a new board
// taking the name afterwards.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createRequester } from "../server-state/support/http.ts";
import { openPaneSession } from "../server-state/support/pane-session.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const root = mkdtempSync(join(tmpdir(), "archboard-semantic-delete-"));
const vault = vaultIn(join(root, "vault"));
let server: OwnedServer;

beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "server.log") },
	});
});

afterAll(async () => {
	await server?.dispose();
	rmSync(root, { recursive: true, force: true });
});

/**
 * Run the archboard command of this package in the directory that holds the vault.
 * @param args The command line.
 * @param input What to put on standard input.
 * @returns What the command printed and how it exited.
 */
function cli(args: readonly string[], input?: string) {
	return runServerCli({ repoRoot, server, vault, args, input });
}

/**
 * Ask the server directly, as a test sets a board up.
 * @param path The route.
 * @param body What it states.
 */
async function asked(path: string, body: Record<string, unknown>): Promise<void> {
	const answer = await createRequester({ ...server, vault })(path, {
		method: "POST",
		doing: "setting a board up",
		body,
	});
	expect(answer.status, JSON.stringify(answer.body)).toBe(200);
}

/**
 * Make a board.
 * @param name Its name.
 * @param nodes Its parts.
 */
async function made(name: string, nodes: readonly Record<string, unknown>[]): Promise<void> {
	await asked("/api/semantic-boards/create", { board: name, create: { level: "system", nodes } });
}

/**
 * Whether the vault holds a board's file.
 * @param name The board's name.
 * @returns True when the file is there.
 */
function holds(name: string): boolean {
	return existsSync(join(vault, `${name}.semantic.json`));
}

/**
 * The delete command line.
 * @param name The board.
 * @param more Its options.
 * @returns The arguments.
 */
function deleting(name: string, ...more: string[]): string[] {
	return ["semantic", "delete", name, ...more];
}

test("a refused delete exits with the status its refusal declares and removes nothing", async () => {
	await made("Ledger", [{ name: "Books", kind: "module" }]);
	await made("Payments", [
		{ name: "API", kind: "app" },
		{
			name: "Books",
			kind: "service",
			drillDown: { board: "Ledger", variant: { kind: "current" } },
		},
	]);
	const doing = ["--doing", "deleting the ledger board"];

	const statuses = [
		cli(deleting("Ledger", "--expect-version", "1")).status,
		cli(deleting("Ledger", ...doing)).status,
		cli(deleting("Ledger", "--expect-version", "2", ...doing)).status,
		cli(deleting("Nowhere", "--expect-version", "1", ...doing)).status,
	];
	// No doing line, no version, a stale version, and a board that is not there,
	// which no stated version matches.
	expect(statuses).toEqual([1, 2, 5, 5]);

	const opened = cli(deleting("Ledger", "--expect-version", "1", ...doing));
	expect(opened.status).toBe(5);
	// The refusal names the board whose node opens it.
	expect(opened.stderr).toContain('"Payments"');
	expect(holds("Ledger")).toBeTrue();
}, 120_000);

test("a delete removes the board, tells its pane, answers its tracked embeds, and frees its names", async () => {
	await made("Old ingest", [{ name: "Queue", kind: "module" }]);
	await asked("/api/semantic-boards/rename?expectVersion=1", {
		board: "Old ingest",
		rename: { to: "Ingest" },
	});
	const embed = { repo: "github.com/acme/docs", path: "docs/ingest.svg" };
	await asked("/api/semantic-boards/track-embed", { board: "Ingest", track: embed });
	const pane = await openPaneSession(server.base, createRequester({ ...server, vault }), {
		clientId: "on-ingest",
		board: "ingest",
	});
	try {
		const mark = pane.mark();
		const deleted = cli(
			deleting("Old ingest", "--expect-version", "3", "--doing", "deleting the ingest board"),
		);
		expect(deleted.status, deleted.stderr).toBe(0);
		expect(JSON.parse(deleted.stdout)).toMatchObject({
			board: "Ingest",
			version: 3,
			trackedEmbeds: [embed],
		});
		expect(holds("Ingest")).toBeFalse();
		expect(await pane.waitFor("board_note", mark)).toMatchObject({
			board: "ingest",
			discarded: true,
		});
	} finally {
		await pane.close();
	}

	for (const name of ["Ingest", "Old ingest"]) {
		const created = cli(
			["semantic", "new", name, "--doing", "drawing a new board under a freed name"],
			JSON.stringify({ level: "system", nodes: [{ name: "Stream", kind: "module" }] }),
		);
		expect(created.status, created.stderr).toBe(0);
		expect(holds(name)).toBeTrue();
	}
}, 120_000);
