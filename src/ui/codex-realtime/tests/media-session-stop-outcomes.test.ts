import { describe, expect, test } from "bun:test";

import { CODEX_REALTIME_STOP_MS } from "@/shared/timing/timing";
import { createRealtimeMediaSession } from "@/ui/codex-realtime";
import type { RealtimeMediaSession, RealtimeMediaSnapshot } from "@/ui/codex-realtime";
import {
	FakeBrowser,
	correlation,
	host,
	settle,
} from "@/ui/codex-realtime/tests/support/media-session-fakes";
import {
	STOP_IDENTITIES,
	type StopIdentityMode,
	type StopMode,
} from "@/ui/codex-realtime/tests/support/media-session-stop-fixtures";

const ENDINGS: Ending[] = ["stop", "dispose"];
const STOP_MODES: StopMode[] = [
	"delivered",
	"rejected",
	"not_delivered",
	"outcome_unknown",
	"paused",
];
type Ending = "stop" | "dispose";

/**
 * A session over a fresh fake browser.
 * @param env The fake browser.
 * @returns The session.
 */
function session(env: FakeBrowser): RealtimeMediaSession {
	return createRealtimeMediaSession(host(env), { environment: env.environment() });
}

/**
 * Ends the session one way or the other.
 * @param media The session.
 * @param ending Which control.
 * @returns The control's completion.
 */
function end(media: RealtimeMediaSession, ending: Ending): Promise<unknown> {
	return ending === "stop" ? media.stop() : media.dispose();
}

describe("realtime browser media stop outcomes", () => {
	test.each(STOP_MODES)(
		"active A owns every idempotent stop when host stop is %s",
		async (mode) => {
			const env = new FakeBrowser();
			env.stopMode = mode;
			const media = session(env);
			await media.start(correlation(1));
			const terminal: string[] = [];
			let reentrant: Promise<RealtimeMediaSnapshot> | undefined;
			media.subscribe((next) => {
				if (reentrant === undefined && next.state.phase === "stopping") {
					reentrant = media.stop();
				}
				if (next.state.phase === "closed" || next.state.phase === "recoverable_error") {
					terminal.push(`${next.correlation?.sessionId}:${next.state.reason}`);
				}
			});
			const second = media.start(correlation(2));
			const stopping = media.stop();
			const concurrent = media.stop();
			if (mode === "paused") {
				await settle();
				env.advance(CODEX_REALTIME_STOP_MS);
			}
			const [b, stopped, stoppedAgain] = await Promise.all([second, stopping, concurrent]);
			expect(b.state).toEqual({ phase: "closed", reason: "stopped" });
			expect(stopped.correlation).toEqual(correlation(1));
			expect(stopped).toBe(media.getSnapshot());
			expect(stoppedAgain).toBe(stopped);
			expect(await reentrant).toBe(stopped);
			expect(await media.stop()).toBe(stopped);
			const delivered = mode === "delivered";
			expect(stopped.state).toMatchObject(
				delivered
					? { phase: "closed", reason: "stopped" }
					: { phase: "recoverable_error", reason: "stop_failed" },
			);
			expect(terminal).toEqual([`session-1:${delivered ? "stopped" : "stop_failed"}`]);
			expect(env.stopCount).toBe(1);
			await expectAfterStop(media, delivered, stopped);
			env.assertReleased();
		},
	);

	test.each(STOP_MODES)(
		"implicit restart publishes active A when host stop is %s",
		async (mode) => {
			const env = new FakeBrowser();
			env.stopMode = mode;
			const media = session(env);
			await media.start(correlation(1));
			const terminal: string[] = [];
			media.subscribe((next) => {
				if (next.state.phase === "recoverable_error") {
					terminal.push(next.state.reason);
				}
			});
			const restarting = media.start(correlation(2));
			if (mode === "paused") {
				await settle();
				env.advance(CODEX_REALTIME_STOP_MS);
			}
			if (mode === "delivered") {
				expect((await restarting).correlation).toEqual(correlation(2));
			} else {
				expect(await restarting.then(() => "", String)).toContain("session-2/correlation-2");
				expect(media.getSnapshot()).toMatchObject({
					correlation: correlation(1),
					state: { phase: "recoverable_error", reason: "stop_failed" },
				});
				expect(await media.start(correlation(3)).then(() => "", String)).toContain("session-3");
				expect(terminal).toEqual(["stop_failed"]);
			}
			expect(env.stopCount).toBe(1);
			await media.dispose();
			env.assertReleased();
		},
	);

	test.each(ENDINGS)(
		"reentrant %s during an implicit restart cancels B before activation",
		async (ending) => {
			const env = new FakeBrowser();
			env.stopMode = "paused";
			const media = session(env);
			await media.start(correlation(1));
			const terminal: string[] = [];
			let control: Promise<unknown> | undefined;
			media.subscribe((next) => {
				if (control === undefined && next.state.phase === "stopping") {
					control = end(media, ending);
				}
				if (next.state.phase === "closed" || next.state.phase === "recoverable_error") {
					terminal.push(`${next.correlation?.sessionId}:${next.state.reason}`);
				}
			});
			const restarting = media.start(correlation(2));
			await settle();
			expect(env.stopRequests).toEqual([correlation(1)]);
			env.releaseStop();
			const b = await restarting;
			await control;
			const reason = ending === "stop" ? "stopped" : "disposed";
			expect(b).toMatchObject({ correlation: correlation(2), state: { phase: "closed", reason } });
			expect(media.getSnapshot()).toMatchObject({
				correlation: correlation(1),
				state: { phase: "closed", reason },
			});
			expect(terminal).toEqual([`session-1:${reason}`]);
			expect(env.order.filter((step) => step === "getUserMedia")).toHaveLength(1);
			expect(env.peers).toHaveLength(1);
			expect(env.stopCount).toBe(1);
			env.assertReleased();
		},
	);

	test("concurrent dispose preserves an unconfirmed active stop failure", async () => {
		const env = new FakeBrowser();
		env.stopMode = "paused";
		const media = session(env);
		await media.start(correlation(1));
		let disposing: Promise<void> | undefined;
		media.subscribe((next) => {
			if (disposing === undefined && next.state.phase === "stopping") {
				disposing = media.dispose();
			}
		});
		const stopping = media.stop();
		await settle();
		env.advance(CODEX_REALTIME_STOP_MS);
		await Promise.all([stopping, disposing]);
		expect(media.getSnapshot()).toMatchObject({
			correlation: correlation(1),
			state: { phase: "recoverable_error", reason: "stop_failed" },
		});
		expect(env.stopCount).toBe(1);
		env.assertReleased();
	});

	test.each(
		(["stop", "dispose", "restart"] as const).flatMap((action) =>
			STOP_IDENTITIES.map((identity): [typeof action, StopIdentityMode] => [action, identity]),
		),
	)("%s verifies a delivered host identity that is %s", async (action, identity) => {
		const env = new FakeBrowser();
		env.stopIdentity = identity;
		const media = session(env);
		await media.start(correlation(1));
		const result = await endWithIdentity(media, action, identity);
		expect(env.stopRequests[0]).toEqual(correlation(1));
		expect(result).toBe(media.getSnapshot());
		if (identity === "exact") {
			expect(result.state).toMatchObject(exactExpectation(action));
		} else {
			expect(result).toMatchObject({
				correlation: correlation(1),
				state: { phase: "recoverable_error", reason: "stop_failed" },
			});
		}
		if (action !== "dispose") {
			await media.dispose();
		}
		env.assertReleased();
	});
});

/**
 * What an exactly confirmed host stop leaves behind for one action.
 * @param action The action taken.
 * @returns The expected state fragment.
 */
function exactExpectation(action: "stop" | "dispose" | "restart"): Record<string, string> {
	if (action === "restart") {
		return { phase: "listening" };
	}
	return { phase: "closed", reason: action === "dispose" ? "disposed" : "stopped" };
}

/**
 * Runs one action against a host answering with one identity mode.
 * @param media The session.
 * @param action The action.
 * @param identity The identity mode.
 * @returns The snapshot the action left.
 */
async function endWithIdentity(
	media: RealtimeMediaSession,
	action: "stop" | "dispose" | "restart",
	identity: StopIdentityMode,
): Promise<RealtimeMediaSnapshot> {
	if (action === "stop") {
		return media.stop();
	}
	if (action === "dispose") {
		await media.dispose();
		return media.getSnapshot();
	}
	if (identity === "exact") {
		return media.start(correlation(2));
	}
	expect(await media.start(correlation(2)).then(() => "", String)).toContain("session-2");
	return media.getSnapshot();
}

/**
 * After a stop: a confirmed one admits a new run, an unconfirmed one refuses.
 * @param media The session.
 * @param delivered Whether the host confirmed.
 * @param stopped The snapshot the stop left.
 */
async function expectAfterStop(
	media: RealtimeMediaSession,
	delivered: boolean,
	stopped: RealtimeMediaSnapshot,
): Promise<void> {
	if (delivered) {
		await media.start(correlation(3));
		await media.dispose();
		expect(media.getSnapshot().correlation).toEqual(correlation(3));
		return;
	}
	await media.dispose();
	expect(media.getSnapshot()).toBe(stopped);
}
