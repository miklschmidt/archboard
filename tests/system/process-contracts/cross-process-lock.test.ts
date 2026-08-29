import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { LOCK_RENEW_MS, LOCK_WATCH_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane, waitForPaneMessage } from "../boards/support/pane-websocket.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { RawLockReadySchema } from "./fixtures/process-resource-owner.ts";
import { startOwnedPeer } from "./support/owned-peer-process.ts";
import { sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/process-resource-owner.ts");
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("raw lock peer and two canvases exclude and recover through one vault", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-cross-process-lock-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const env = sanitizedEnvironment(root, vault);
	const raw = await startOwnedPeer({
		argv: [process.execPath, fixture],
		env: {
			...env,
			ARCHBOARD_TEST_RESOURCE_MODE: "lock",
			ARCHBOARD_TEST_REPO_ROOT: repoRoot,
			ARCHBOARD_TEST_LOCK_BOARD: "scratch",
		},
		readySchema: RawLockReadySchema,
	});
	resources.defer(() => raw.dispose());
	const first = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env,
	});
	resources.defer(() => first.dispose());
	const requestFirst = createJsonRequester(first);
	try {
		expect(existsSync(raw.ready.lockFile)).toBeTrue();
		const blocked = await requestFirst<{
			code: string;
			error: string;
			holder: { process: string };
		}>("/api/elements?board=scratch", {
			method: "POST",
			body: { id: "blocked", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
		});
		expect(blocked.status).toBe(409);
		expect(blocked.body.code).toBe("BOARD_HELD");
		expect(blocked.body.error).toMatch(/on another canvas \(/);
		expect(blocked.body.holder.process).toBe(raw.ready.process);
		await raw.dispose();
		expect(existsSync(raw.ready.lockFile)).toBeFalse();
		expect(
			(
				await requestFirst("/api/elements?board=scratch", {
					method: "POST",
					body: { id: "allowed", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
				})
			).status,
		).toBe(200);

		const second = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault,
			env,
		});
		resources.defer(() => second.dispose());
		const requestSecond = createJsonRequester(second);
		const localPane = await openTestPane(first.base, requestFirst, "first-local-pane", 0);
		resources.defer(() => localPane.close());
		await requestFirst("/api/boards/hold?board=scratch", {
			method: "POST",
			body: { clientId: "first-pane" },
		});
		const firstRenewal = setInterval(() => {
			void requestFirst("/api/boards/hold?board=scratch", {
				method: "POST",
				body: { clientId: "first-pane" },
			});
		}, 800);
		resources.defer(() => clearInterval(firstRenewal));
		const denied = await requestSecond<{ code: string; holder: { id: string } }>(
			"/api/elements?board=scratch",
			{
				method: "POST",
				body: { id: "other", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
			},
		);
		clearInterval(firstRenewal);
		expect(denied.status).toBe(409);
		expect(denied.body).toMatchObject({ code: "BOARD_HELD", holder: { id: "first-pane" } });
		await requestFirst("/api/boards/hold/release?board=scratch", {
			method: "POST",
			body: { clientId: "first-pane" },
		});
		expect(
			(
				await requestSecond("/api/elements?board=scratch", {
					method: "POST",
					body: { id: "other", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
				})
			).status,
		).toBe(200);

		const pane = await openTestPane(second.base, requestSecond, "second-pane", 0);
		resources.defer(() => pane.close());
		expect(pane.seen.find((message) => message.type === "board_lock")).toMatchObject({
			board: "scratch",
			held: false,
		});
		await sleep(1_200);
		const localBeforeClaim = localPane.since();
		const beforeClaim = pane.since();
		expect(
			(
				await requestFirst("/api/boards/claim?board=scratch", {
					method: "POST",
					body: { reason: "restructuring the queues" },
				})
			).status,
		).toBe(200);
		expect(
			await waitForPaneMessage(localPane, localBeforeClaim, "board_lock", 2_000),
		).toMatchObject({
			held: true,
			holder: { claimed: true, reason: "restructuring the queues" },
		});
		const remoteNews = await waitForPaneMessage(
			pane,
			beforeClaim,
			"board_lock",
			LOCK_WATCH_MS + 2_000,
		);
		expect(remoteNews).toMatchObject({
			held: true,
			holder: { claimed: true, reason: "restructuring the queues" },
		});
		expect(
			(
				await requestSecond("/api/boards/hold?board=scratch", {
					method: "POST",
					body: { clientId: pane.clientId },
				})
			).status,
		).toBe(200);
		await requestSecond("/api/boards/hold/release?board=scratch", {
			method: "POST",
			body: { clientId: pane.clientId },
		});
		await sleep(LOCK_RENEW_MS + 500);
		const revoked = await requestFirst<{ code: string }>("/api/elements?board=scratch", {
			method: "POST",
			body: { id: "revoked", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
		});
		expect(revoked).toMatchObject({ status: 409, body: { code: "CLAIM_REVOKED" } });
		await sleep(1_200);
		expect(pane.seen.toReversed().find((message) => message.type === "board_lock")).toMatchObject({
			held: false,
		});
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
