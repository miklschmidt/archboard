import { describe, expect, test } from "bun:test";

import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserGatewayMessage, CodexTimelineProjectionInput } from "../index.js";
import { createGatewayHarness } from "./support.js";

const wireBytes = (value: unknown): number =>
	new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** One history page whose encoded delta necessarily exceeds the 256 KiB delta bound. */
function oversizedTimeline(
	authorities: ReturnType<typeof createIdentityAuthorities>,
): CodexTimelineProjectionInput {
	const decoder = authorities.identity.decoder;
	return {
		kind: "codex_timeline",
		threadId: decoder.adoptThreadId("gateway-thread"),
		turns: [
			{
				turn: { id: decoder.adoptTurnId("gateway-turn"), status: "completed" },
				items: Array.from({ length: 32 }, (_unused, index) => ({
					kind: "agent_message" as const,
					item: {
						type: "agentMessage" as const,
						id: decoder.adoptItemId(`sequenced-item-${index}`),
						text: "sequenced".repeat(1_600),
					},
				})),
				presentation: {
					summary: "A history page larger than one delta.",
					outputs: { included: true, truncated: false },
				},
			},
		],
		cursor: null,
	};
}

describe("Codex workbench sequenced browser delivery", () => {
	test("an unobservable owner change publishes nothing and holds the sequence", () => {
		const value = createGatewayHarness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const messages: BrowserGatewayMessage[] = [];
		connection.subscribe((message) => void messages.push(message));
		const first = connection.snapshot();
		expect(first.sequence).toBe(0);

		value.emitProjectionChange();
		value.emitProjectionChange();

		expect(messages).toEqual([]);
		expect(connection.snapshot().sequence).toBe(0);
		// A reconnect snapshot repeats the same sequence and the same state.
		expect(value.gateway.snapshot(value.browserId, value.paneId)).toEqual(first);
	});

	test("each observable change publishes one delta of only its changed fields", () => {
		const value = createGatewayHarness();
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const messages: BrowserGatewayMessage[] = [];
		connection.subscribe((message) => void messages.push(message));
		connection.snapshot();

		value.setReadiness("account_ready");
		value.setReadiness("thread_capable");

		expect(messages).toHaveLength(2);
		const first = messages[0]!;
		const second = messages[1]!;
		expect(first).toMatchObject({
			kind: "delta",
			sequence: 1,
			delta: { readiness: { kind: "readiness", state: "account_ready" } },
		});
		expect(Object.keys(first.kind === "delta" ? first.delta : {})).toEqual(["readiness"]);
		expect(second).toMatchObject({
			kind: "delta",
			sequence: 2,
			delta: { readiness: { kind: "readiness", state: "thread_capable" } },
		});
		// The next reconnect resumes at the last published sequence, not beyond it.
		expect(connection.snapshot().sequence).toBe(2);
	});

	test("a change too large for one delta is published as a complete snapshot", () => {
		const authorities = createIdentityAuthorities();
		let timeline: CodexTimelineProjectionInput | null = null;
		const value = createGatewayHarness(authorities, undefined, undefined, {
			project: (owner) => ({ ...owner, timeline }),
		});
		const connection = value.gateway.connect(value.browserId, value.paneId);
		const messages: BrowserGatewayMessage[] = [];
		connection.subscribe((message) => void messages.push(message));
		expect(connection.snapshot().sequence).toBe(0);

		timeline = oversizedTimeline(authorities);
		value.emitProjectionChange();

		expect(messages).toHaveLength(1);
		const published = messages[0]!;
		if (published.kind !== "snapshot") {
			throw new Error("the oversized change stayed a delta");
		}
		expect(published.sequence).toBe(1);
		expect(published.snapshot.timeline?.turns[0]?.items).toHaveLength(32);
		expect(wireBytes(published.snapshot)).toBeGreaterThan(262_144);
		expect(connection.snapshot().sequence).toBe(1);
	});
});
