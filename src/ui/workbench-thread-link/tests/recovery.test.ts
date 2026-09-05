import { describe, expect, test } from "bun:test";

import type { BrowserSnapshot } from "../../../shared/codex-browser-model/index.js";
import type { BrowserWorkbenchState } from "../../workbench-transport/index.js";
import { createThreadLinkController, projectThreadLinkReadiness } from "../index.js";
import type { ThreadLinkRecoveryIntent } from "../index.js";
import { capabilities, connected, FakeTransport, loginA, pane, snapshot } from "./fixtures.js";

function readiness(
	state: BrowserWorkbenchState,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[] = [
		"start_workbench",
		"choose_binary",
		"unlock_home",
		"repair_storage",
		"refresh_inventory",
	],
) {
	return projectThreadLinkReadiness({
		state,
		capabilities: capabilities(),
		hostRecoveryIntents,
	});
}

function withReadiness(value: BrowserSnapshot["readiness"]): BrowserWorkbenchState {
	return connected(snapshot({ readiness: value }));
}

function intents(state: BrowserWorkbenchState): readonly string[] {
	return readiness(state).recoveries.map((recovery) => recovery.intent);
}

describe("thread-link readiness disclosure", () => {
	test("a missing or wrong Codex binary is one arm carrying the host's own reason", () => {
		const state = withReadiness({
			kind: "readiness",
			state: "incompatible_contract",
			reason: "Codex startup refused. The pinned app-server binary is missing.",
		});
		const disclosed = readiness(state);
		expect(disclosed.arm).toBe("incompatible_contract");
		expect(disclosed.tone).toBe("failed");
		expect(disclosed.label).toContain("missing, wrong, or incompatible");
		expect(disclosed.detail).toContain("app-server binary is missing");
		expect(intents(state)).toEqual(["choose_binary", "start_workbench"]);
		expect(disclosed.recoveries.every((recovery) => recovery.available)).toBeTrue();
	});

	test("a locked Codex home and a rejected storage configuration share one arm and both recoveries", () => {
		const state = withReadiness({
			kind: "readiness",
			state: "storage_mismatch",
			reason:
				"Dedicated Codex roots are locked or colliding. Stop the other owner before retrying.",
		});
		const disclosed = readiness(state);
		expect(disclosed.arm).toBe("storage_mismatch");
		expect(disclosed.detail).toContain("locked or colliding");
		expect(intents(state)).toEqual(["unlock_home", "repair_storage"]);
		expect(disclosed.recoveries[0]?.description).toContain("Stop the other owner");
		expect(disclosed.recoveries[1]?.description).toContain("SQLite configuration");
	});

	test("backoff keeps the host's retry instant and stopped offers a start", () => {
		const backoff = withReadiness({
			kind: "readiness",
			state: "backoff",
			retryAtMs: 1_700_000_000_000,
			reason: "The Codex app server is waiting before its next start.",
		});
		expect(readiness(backoff).retryAtMs).toBe(1_700_000_000_000);
		expect(intents(backoff)).toEqual(["start_workbench", "refresh_snapshot"]);
		const stopped = withReadiness({
			kind: "readiness",
			state: "stopped",
			reason: "The Codex app server is not running.",
		});
		expect(readiness(stopped).arm).toBe("stopped");
		expect(intents(stopped)).toEqual(["start_workbench"]);
	});

	test("a stale snapshot names both sequences and offers a refresh", () => {
		const state: BrowserWorkbenchState = {
			kind: "stream",
			state: "stale_snapshot",
			connection: "connected",
			snapshot: snapshot(),
			sequence: 4,
			expectedSequence: 5,
			receivedSequence: 9,
			reason: "The workbench snapshot sequence skipped.",
		};
		const disclosed = readiness(state);
		expect(disclosed.arm).toBe("stale_snapshot");
		expect(disclosed.detail).toContain("Expected sequence 5, received 9");
		expect(intents(state)).toEqual(["refresh_snapshot"]);
	});

	test("login progress, failure, and readiness each disclose their own recovery", () => {
		const pending = withReadiness({ kind: "readiness", state: "login_pending", loginId: loginA });
		expect(readiness(pending).arm).toBe("login_pending");
		expect(intents(pending)).toEqual(["cancel_login"]);
		const failed = connected(
			snapshot({
				readiness: { kind: "readiness", state: "login_capable" },
				login: {
					kind: "login",
					state: "failed",
					loginId: loginA,
					reason: "Codex rejected the API key.",
				},
			}),
		);
		const disclosedFailure = readiness(failed);
		expect(disclosedFailure.arm).toBe("login_failed");
		expect(disclosedFailure.detail).toBe("Codex rejected the API key.");
		expect(intents(failed)).toEqual(["retry_login", "cancel_login"]);
		const signedOut = withReadiness({ kind: "readiness", state: "signed_out" });
		expect(intents(signedOut)).toEqual(["retry_login"]);
	});

	test("an initialized workbench asks for the account and a ready one asks for nothing", () => {
		expect(intents(withReadiness({ kind: "readiness", state: "initialized" }))).toEqual([
			"read_account",
			"refresh_snapshot",
		]);
		expect(intents(withReadiness({ kind: "readiness", state: "account_ready" }))).toEqual([
			"refresh_snapshot",
		]);
		const ready = readiness(withReadiness({ kind: "readiness", state: "thread_capable" }));
		expect(ready.tone).toBe("ready");
		expect(ready.recoveries).toEqual([]);
	});

	test("a recovery this pane has no owner for is named rather than rendered as a live control", () => {
		const stopped = withReadiness({
			kind: "readiness",
			state: "stopped",
			reason: "The Codex app server is not running.",
		});
		const recovery = readiness(stopped, []).recoveries[0];
		expect(recovery?.available).toBeFalse();
		expect(recovery?.owner).toBe("none");
		expect(recovery?.description).toContain("Do this where Archboard is running.");
	});

	test("a disconnected pane still discloses the connection arm it is in", () => {
		const disconnected: BrowserWorkbenchState = {
			kind: "connection",
			state: "stopped",
			connection: "stopped",
			snapshot: null,
			sequence: null,
			reason: "The Codex workbench connection was closed.",
		};
		expect(readiness(disconnected).arm).toBe("stopped");
		expect(readiness(disconnected).detail).toBe("The Codex workbench connection was closed.");
	});
});

describe("thread-link recovery actions", () => {
	test("refreshing state and re-reading the account run through the transport", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({ capturePane: () => pane(transport) });
		await controller.recover("refresh_snapshot");
		expect(transport.refreshes).toBe(1);
		expect(controller.snapshot().state).toBe("succeeded");
		await controller.recover("read_account");
		expect(transport.accountReads).toBe(1);
		expect(controller.snapshot().state).toBe("succeeded");
	});

	test("a host recovery with no declared owner fails with the reason instead of pretending", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({ capturePane: () => pane(transport) });
		await controller.recover("start_workbench");
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(settled.state === "failed" ? settled.announcement : "").toContain(
			"has no start workbench owner",
		);
	});

	test("a declared host recovery runs against the captured pane and intent", async () => {
		const transport = new FakeTransport();
		const calls: string[] = [];
		const controller = createThreadLinkController({
			capturePane: () => pane(transport, ["unlock_home"]),
			captureHostRecovery: (target) => ({
				paneId: target.paneId,
				intent: target.intent,
				recover: async () => {
					calls.push(`${target.paneId}:${target.intent}`);
				},
			}),
		});
		await controller.recover("unlock_home");
		expect(calls).toEqual(["pane-a:unlock_home"]);
		expect(controller.snapshot().state).toBe("succeeded");
	});

	test("a host authority for another pane is refused rather than run", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({
			capturePane: () => pane(transport, ["repair_storage"]),
			captureHostRecovery: (target) => ({
				paneId: "pane-b",
				intent: target.intent,
				recover: async () => {
					throw new Error("This recovery must never run.");
				},
			}),
		});
		await controller.recover("repair_storage");
		expect(controller.snapshot().state).toBe("failed");
	});

	test("a failing host recovery reports what happened and what to do next", async () => {
		const transport = new FakeTransport();
		const controller = createThreadLinkController({
			capturePane: () => pane(transport, ["start_workbench"]),
			captureHostRecovery: (target) => ({
				paneId: target.paneId,
				intent: target.intent,
				recover: async () => {
					throw new Error("The Codex process refused to start.");
				},
			}),
		});
		await controller.recover("start_workbench");
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(settled.state === "failed" ? settled.announcement : "").toBe(
			"The Codex process refused to start.",
		);
		expect(settled.state === "failed" ? settled.recovery?.intent : null).toBe("refresh_snapshot");
	});
});
