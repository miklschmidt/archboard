import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { openPaneSession, type PaneEvent } from "./support/pane-session.ts";

// A board made only to be recorded is discarded afterwards (TASK-304.02). The
// discard is a write at the boundary — it says what it is doing or does not
// happen — and the board it removes leaves the listing and the pane showing it
// the same way a write reaches them.

const repoRoot = resolve(import.meta.dir, "../../..");

interface Reply {
	code?: string;
	boards?: Array<{ key: string }>;
}

test("a discarded board leaves the vault, the listing and the pane showing it", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-board-discard-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = vaultIn(join(root, "vault"));
	const server = await startOwnedServer({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "server.log") },
	});
	resources.defer(() => server.dispose());
	const request = createRequester(server);
	const file = join(vault, "recorded.semantic.json");

	const created = await request("/api/semantic-boards/create", {
		method: "POST",
		body: {
			board: "recorded",
			create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }] },
		},
	});
	expect(created.status).toBe(200);
	const pane = await openPaneSession(server.base, request, {
		clientId: "discard-pane",
		board: "recorded",
		primary: true,
		focused: true,
	});
	resources.defer(() => pane.close());
	await waitFor(async () => pane.board() === "recorded", "the pane to settle on the board");

	const silent = await request<Reply>("/api/semantic-boards/discard", {
		method: "POST",
		doing: false,
		body: { board: "recorded" },
	});
	expect({ status: silent.status, code: silent.body.code }).toEqual({
		status: 400,
		code: "DOING_REQUIRED",
	});
	const misspelled = await request<Reply>("/api/semantic-boards/discard?expectVersion=one", {
		method: "POST",
		body: { board: "recorded" },
	});
	expect({ status: misspelled.status, code: misspelled.body.code }).toEqual({
		status: 400,
		code: "BAD_EXPECTED_VERSION",
	});
	expect(existsSync(file)).toBeTrue();

	const start = pane.mark();
	const discarded = await request("/api/semantic-boards/discard", {
		method: "POST",
		doing: "discarding the recorded board",
		body: { board: "recorded", session: "recorder" },
	});
	expect(discarded.status).toBe(200);
	expect(existsSync(file)).toBeFalse();

	const told = await waitFor(
		() => pane.events.slice(start).find((event: PaneEvent) => event.type === "board_note"),
		"the pane to hear that its board went",
	);
	expect(told).toMatchObject({ type: "board_note", board: "recorded" });
	const listing = await request<Reply>("/api/semantic-boards");
	expect(listing.body.boards?.map((board) => board.key)).toEqual([]);
	const read = await request<Reply>("/api/semantic-boards/board?board=recorded");
	expect({ status: read.status, code: read.body.code }).toEqual({
		status: 404,
		code: "BOARD_MISSING",
	});

	const again = await request<Reply>("/api/semantic-boards/discard", {
		method: "POST",
		body: { board: "recorded" },
	});
	expect({ status: again.status, code: again.body.code }).toEqual({
		status: 422,
		code: "BOARD_MISSING",
	});
	await server.assertRunning();
}, 40_000);
