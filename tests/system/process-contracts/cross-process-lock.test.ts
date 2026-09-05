import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import {
	openTestPane,
	type PaneMessage,
	type TestPane,
	waitForPaneMessage,
	waitForPaneMessageWhere,
} from "../boards/support/pane-websocket.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { RawLockReadySchema } from "./fixtures/process-resource-owner.ts";
import { startOwnedPeer } from "./support/owned-peer-process.ts";
import { sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const fixture = join(import.meta.dir, "fixtures/process-resource-owner.ts");

/**
 * ADR 0016's cross-process broadcast is a real timer and filesystem fact.
 * TASK-148.04 keeps only that elapsed wait, measures it from a completed lock
 * mutation to the matching pane frame, and applies the named TEST_* bound.
 */
async function observeCrossProcessLock(
	pane: TestPane,
	start: number,
	match: (message: PaneMessage) => boolean,
): Promise<{ message: PaneMessage | undefined; elapsedMs: number }> {
	const startedAt = performance.now();
	const message = await waitForPaneMessageWhere(
		pane,
		start,
		match,
		TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS,
	);
	return { message, elapsedMs: performance.now() - startedAt };
}

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
			env: { ...env, XDG_STATE_HOME: join(root, "second-state") },
		});
		resources.defer(() => second.dispose());
		const requestSecond = createJsonRequester(second);
		const localPane = await openTestPane(first.base, requestFirst, "first-local-pane", 0);
		resources.defer(() => localPane.close());
		const pane = await openTestPane(second.base, requestSecond, "second-pane", 0);
		resources.defer(() => pane.close());
		expect(pane.seen.find((message) => message.type === "board_lock")).toMatchObject({
			board: "scratch",
			held: false,
		});
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
		const beforeRecoveredWrite = pane.since();
		const recovered = await requestSecond("/api/elements?board=scratch", {
			method: "POST",
			body: { id: "other", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
		});
		expect(recovered.status).toBe(200);
		expect(
			await waitForPaneMessageWhere(
				pane,
				beforeRecoveredWrite,
				(message) =>
					message.type === "board_lock" &&
					message["held"] === true &&
					(message["holder"] as { kind?: string } | undefined)?.kind === "agent",
			),
		).toMatchObject({ held: true, holder: { kind: "agent" } });
		const recoveredHoldIndex = pane.seen.findIndex(
			(message, index) =>
				index >= beforeRecoveredWrite &&
				message.type === "board_lock" &&
				message["held"] === true &&
				(message["holder"] as { kind?: string } | undefined)?.kind === "agent",
		);
		expect(recoveredHoldIndex).toBeGreaterThanOrEqual(beforeRecoveredWrite);
		expect(
			await waitForPaneMessageWhere(
				pane,
				recoveredHoldIndex + 1,
				(message) => message.type === "board_lock" && message["held"] === false,
			),
		).toMatchObject({ board: "scratch", held: false });

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
		const remoteClaimPromise = observeCrossProcessLock(
			pane,
			beforeClaim,
			(message) =>
				message.type === "board_lock" &&
				message["held"] === true &&
				(message["holder"] as { claimed?: boolean } | undefined)?.claimed === true,
		);
		expect(
			await waitForPaneMessage(localPane, localBeforeClaim, "board_lock", 2_000),
		).toMatchObject({
			held: true,
			holder: { claimed: true, reason: "restructuring the queues" },
		});
		const remoteClaim = await remoteClaimPromise;
		expect(remoteClaim.message).toMatchObject({
			held: true,
			holder: { claimed: true, reason: "restructuring the queues" },
		});
		expect(remoteClaim.elapsedMs).toBeLessThanOrEqual(TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS);

		const localBeforeTakeover = localPane.since();
		const takeover = await requestSecond<{
			created: boolean;
			holder: { id: string; kind: string };
		}>("/api/boards/hold?board=scratch", {
			method: "POST",
			body: { clientId: pane.clientId },
		});
		const remoteTakeoverPromise = observeCrossProcessLock(
			localPane,
			localBeforeTakeover,
			(message) =>
				message.type === "board_lock" &&
				message["held"] === true &&
				(message["holder"] as { id?: string } | undefined)?.id === pane.clientId,
		);
		expect(takeover).toMatchObject({
			status: 200,
			body: { created: true, holder: { id: pane.clientId, kind: "human" } },
		});
		const remoteTakeover = await remoteTakeoverPromise;
		expect(remoteTakeover.message).toMatchObject({
			held: true,
			holder: { id: pane.clientId, kind: "human" },
		});
		expect(remoteTakeover.elapsedMs).toBeLessThanOrEqual(TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS);

		const localBeforeRelease = localPane.since();
		const paneBeforeRelease = pane.since();
		const release = await requestSecond<{ released: boolean }>(
			"/api/boards/hold/release?board=scratch",
			{
				method: "POST",
				body: { clientId: pane.clientId },
			},
		);
		const freePromise = Promise.all([
			observeCrossProcessLock(
				localPane,
				localBeforeRelease,
				(message) => message.type === "board_lock" && message["held"] === false,
			),
			waitForPaneMessageWhere(
				pane,
				paneBeforeRelease,
				(message) => message.type === "board_lock" && message["held"] === false,
			),
		]);
		expect(release).toMatchObject({ status: 200, body: { released: true } });
		const [remoteFree, localFree] = await freePromise;
		expect(remoteFree.message).toMatchObject({ board: "scratch", held: false });
		expect(remoteFree.elapsedMs).toBeLessThanOrEqual(TEST_CROSS_PROCESS_LOCK_WATCH_TIMEOUT_MS);
		expect(localFree).toMatchObject({ board: "scratch", held: false });

		const revoked = await requestFirst<{ code: string }>("/api/elements?board=scratch", {
			method: "POST",
			body: { id: "revoked", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
		});
		expect(revoked).toMatchObject({ status: 409, body: { code: "CLAIM_REVOKED" } });
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
