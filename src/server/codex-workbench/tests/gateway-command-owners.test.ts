import { afterEach, describe, expect, test } from "bun:test";

import {
	deliver,
	interruptCommand,
	queueCommand,
	realtimeCommand,
	startCommand,
	steerCommand,
	threadLinkCommand,
	type CommandFactory,
} from "./helpers.js";
import { createGatewayHarness, type GatewayHarness } from "./support.js";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
} from "../../../shared/codex-realtime-host/index.js";

const openHarnesses: GatewayHarness[] = [];

afterEach(async () => {
	for (const openHarness of openHarnesses.splice(0)) await openHarness.gateway.dispose();
});

function harness(): GatewayHarness {
	const value = createGatewayHarness();
	openHarnesses.push(value);
	return value;
}

describe("Codex workbench browser command owners", () => {
	test("refuses an unsupported action through the production dispatch boundary", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const result = await connection.command({ paneId: value.paneId, command: "thread/delete" });
		expect(result).toMatchObject({ code: "unsupported_command", outcome: "not_delivered" });
		expect(value.calls).toEqual([]);
	});

	test("routes every thread, queue, text, and realtime command through its owner", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const factories: readonly CommandFactory[] = [
			(lease) => threadLinkCommand(value, lease, "threadLinkCreate"),
			(lease) => threadLinkCommand(value, lease, "threadLinkRefresh"),
			(lease) => threadLinkCommand(value, lease, "threadLinkAttach"),
			(lease) => threadLinkCommand(value, lease, "threadLinkRelink"),
			(lease) => startCommand(value, lease),
			(lease) => steerCommand(value, lease),
			(lease) => interruptCommand(value, lease),
			(lease) => queueCommand(value, lease, "queueAdd"),
			(lease) => queueCommand(value, lease, "queueUpdate"),
			(lease) => queueCommand(value, lease, "queueDelete"),
			(lease) => queueCommand(value, lease, "queueReorder"),
			(lease) => queueCommand(value, lease, "queueStart"),
			(lease) => realtimeCommand(value, lease, "realtimeStart"),
			(lease) => realtimeCommand(value, lease, "realtimeAppendText"),
			(lease) => realtimeCommand(value, lease, "realtimeStop"),
		];
		for (const factory of factories) await deliver(connection, factory);
		expect(value.calls).toEqual([
			"threadLink.create",
			"threadLink.refresh",
			"threadLink.attach",
			"threadLink.relink",
			"text.start",
			"text.steer",
			"text.interrupt",
			"queue.add",
			"queue.update",
			"queue.delete",
			"queue.reorder",
			"queue.start",
			"realtime.start",
			"realtime.appendText",
			"realtime.stop",
		]);
	});

	test("keeps thread operations disabled in every pre-thread capability state", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		for (const state of [
			"login_capable",
			"signed_out",
			"login_pending",
			"account_ready",
		] as const) {
			value.setReadiness(state);
			const result = await connection.command(startCommand(value, connection.claimLease()));
			expect(result).toMatchObject({
				code: "thread_capability_required",
				outcome: "not_delivered",
			});
		}
	});

	test("returns the negotiated SDP answer for browser-local remote media attachment", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const command = realtimeCommand(value, connection.claimLease(), "realtimeStart");
		const realtimeAnswer = {
			sessionId: parseRealtimeSessionId(String(command.commandId)),
			correlationId: parseRealtimeCorrelationId(String(command.commandId)),
			sdp: "v=0\r\na=answer",
		};
		value.setActionResult({ outcome: "delivered", realtimeAnswer });

		const result = await connection.command(command);
		expect(result).toMatchObject({ outcome: "delivered", realtimeAnswer });
	});

	test("returns the accepted start turn even when the snapshot has no active turn", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		value.setActionResult({ outcome: "delivered", turnId: value.turnId });
		const result = await connection.command(startCommand(value, connection.claimLease()));
		expect(result).toMatchObject({ outcome: "delivered", turnId: value.turnId });
		expect(result.snapshot.timeline).toBeNull();
	});

	test("reports realtime negotiation unavailability as an explicit command refusal", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		value.setActionError(new Error("Browser realtime media is unavailable."));
		const result = await connection.command(
			realtimeCommand(value, connection.claimLease(), "realtimeStart"),
		);
		expect(result).toMatchObject({ outcome: "not_delivered", code: "command_failed" });
	});

	test("requires the exact executable link for text, queue, and realtime commands", async () => {
		const value = harness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		value.setLink({
			kind: "thread_link",
			state: "inspect_only",
			childId: null,
			epoch: null,
			threadId: value.threadId,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: false,
			reason: "direct_input_false",
		});
		for (const factory of [
			(lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>) => startCommand(value, lease),
			(lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>) =>
				queueCommand(value, lease, "queueAdd"),
			(lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>) =>
				realtimeCommand(value, lease, "realtimeStart"),
		] as const) {
			const result = await connection.command(factory(connection.claimLease()));
			expect(result).toMatchObject({ code: "link_required", outcome: "not_delivered" });
		}
		expect(value.calls).toEqual([]);
	});
});
