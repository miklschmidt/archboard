import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createRequester } from "./support/http.ts";
import { openPaneSession } from "./support/pane-session.ts";

// The board a new pane starts on. A split is another look at what the person is
// reading, so a pane that names no board starts on the board in front of them.
// A pane added for a board, as one opened beside is, names it on its socket and
// starts on it (TASK-550), so it never shows the other board first and the
// address writes the two panes once.

const repoRoot = resolve(import.meta.dir, "../../..");

test("a pane starts on the board its socket names, and a pane that names none on the board in front of the person", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-pane-start-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = vaultIn(join(root, "vault"));
	const server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "server.log") },
	});
	resources.defer(() => server.dispose());
	const request = createRequester(server);
	// The vault's first board is the ledger, so neither pane below starts there by default.
	for (const board of ["ledger", "payments"]) {
		const created = await request("/api/semantic-boards/create", {
			method: "POST",
			body: { board, create: { level: "system", nodes: [] } },
		});
		expect(created.status).toBe(200);
	}

	const first = await openPaneSession(server.base, request, {
		clientId: "start-first",
		startsOn: "payments",
		primary: true,
		focused: true,
	});
	resources.defer(() => first.close());
	const split = await openPaneSession(server.base, request, { clientId: "start-split", x: 640 });
	resources.defer(() => split.close());
	const beside = await openPaneSession(server.base, request, {
		clientId: "start-beside",
		startsOn: "ledger",
		x: 1280,
	});
	resources.defer(() => beside.close());

	expect([first.board(), split.board(), beside.board()]).toEqual([
		"payments",
		"payments",
		"ledger",
	]);
	await server.assertRunning();
}, 40_000);
