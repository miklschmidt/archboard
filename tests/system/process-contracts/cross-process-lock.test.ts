import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS } from "../support/timing.ts";
import { createJsonRequester } from "../support/http.ts";
import { openTestPane } from "../support/pane-websocket.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { sanitizedEnvironment } from "./support/process-http.ts";

// ADR 0016: the lock is a file, and a file calls nobody. A claim taken through
// one Archboard server excludes writes through another server on the same vault,
// and the second server's panes hear about it from the lock sweep within one
// watch interval rather than at their next refused write.

const repoRoot = resolve(import.meta.dir, "../../..");
const serverPath = join(repoRoot, "src/server.ts");

test("a claim taken through another server excludes writes here and reaches the pane within the lock sweep", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-cross-process-lock-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const env = sanitizedEnvironment(root, vault);
	const first = await startOwnedServer({ serverPath, vault, env });
	resources.defer(() => first.dispose());
	const second = await startOwnedServer({
		serverPath,
		vault,
		env: { ...env, XDG_STATE_HOME: join(root, "second-state") },
	});
	resources.defer(() => second.dispose());
	const requestFirst = createJsonRequester(first);
	const requestSecond = createJsonRequester(second);

	const created = await requestFirst<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "starting the payment path",
		body: {
			board: "payments",
			origin: "agent",
			create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }], edges: [] },
		},
	});
	expect(created.status).toBe(200);

	const pane = await openTestPane(first.base, requestFirst, "first-server-pane", 0, {
		board: "payments",
	});
	resources.defer(() => pane.close());
	expect(
		await pane.waitFor((message) => message.type === "board_lock" && message["held"] === false),
	).toBeDefined();

	// The claim is taken in the other process; this server's pane learns of it
	// from the sweep, not from anything it did.
	const claimStart = pane.since();
	const claimedAt = performance.now();
	const claim = await requestSecond<{ version: number }>(
		"/api/semantic-boards/claim?board=payments",
		{ method: "POST", body: { reason: "restructuring the queues" } },
	);
	expect(claim.status).toBe(200);
	expect(
		await pane.waitFor(
			(message) =>
				message.type === "board_lock" &&
				message["held"] === true &&
				(message["holder"] as { claimed?: boolean } | undefined)?.claimed === true,
			claimStart,
			TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
		),
	).toMatchObject({ holder: { claimed: true, reason: "restructuring the queues" } });
	expect(performance.now() - claimedAt).toBeLessThanOrEqual(
		TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
	);

	// One writer at a time: this server's write is refused while the other holds.
	const edit = {
		method: "POST",
		doing: "adding the ledger",
		body: {
			board: "payments",
			origin: "agent",
			edit: { nodes: [{ name: "Ledger", kind: "datastore" }] },
		},
	};
	const refused = await requestFirst<{ code: string }>(
		"/api/semantic-boards/edit?expectVersion=1",
		edit,
	);
	expect(refused).toMatchObject({ status: 409, body: { code: "BOARD_HELD" } });

	// Releasing in the other process reaches the pane, and the board is writable again.
	const releaseStart = pane.since();
	const releasedAt = performance.now();
	const released = await requestSecond<{ released: boolean }>(
		"/api/semantic-boards/claim/release?board=payments",
		{ method: "POST" },
	);
	expect(released.body.released).toBeTrue();
	expect(
		await pane.waitFor(
			(message) => message.type === "board_lock" && message["held"] === false,
			releaseStart,
			TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
		),
	).toBeDefined();
	expect(performance.now() - releasedAt).toBeLessThanOrEqual(
		TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
	);
	const written = await requestFirst("/api/semantic-boards/edit?expectVersion=1", edit);
	expect(written.status).toBe(200);
}, 30_000);
