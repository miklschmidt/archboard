import { afterEach, describe, expect, test } from "bun:test";

import { CODEX_REALTIME_START_MS, CODEX_REALTIME_STOP_MS } from "../../../shared/timing/timing.js";
import { createRealtimeMediaSession } from "../index.js";
import {
	correlation,
	FakeBrowser,
	host,
	PUBLISHED_CHECKPOINTS,
	restoreFakeBrowsers,
	settle,
	SIDE_EFFECT_CHECKPOINTS,
	type Stage,
} from "./support/media-session-fakes.js";
import { STOP_IDENTITIES, type StopMode } from "./support/media-session-stop-fixtures.js";

const NEGOTIATION_STAGES: Stage[] = ["createOffer", "setLocal", "hostOffer", "setRemote", "resume"];

afterEach(restoreFakeBrowsers);

describe("realtime browser media lifecycle boundaries", () => {
	test.each(["pending", "rejected"] as const)(
		"%s browser cleanup promises cannot retain the lifecycle queue",
		async (mode) => {
			const env = new FakeBrowser();
			env.senderCount = 3;
			env.replaceTrackMode = mode;
			env.closeContextMode = mode;
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation(1));
			expect((await session.stop()).state).toEqual({ phase: "closed", reason: "stopped" });
			expect((await session.start(correlation(2))).state.phase).toBe("listening");
			await session.dispose();
			expect(env.peers.map((peer) => peer.senders.length)).toEqual([3, 3]);
			env.assertReleased();
		},
	);

	test.each(["stop", "dispose"] as const)(
		"%s from every published checkpoint blocks the next effect",
		async (action) => {
			for (const [phase, reason, forbidden] of PUBLISHED_CHECKPOINTS) {
				const env = new FakeBrowser();
				const session = createRealtimeMediaSession(host(env));
				let ending: Promise<unknown> | undefined;
				session.subscribe((next) => {
					if (!ending && next.state.phase === phase && next.state.reason === reason)
						ending = action === "stop" ? session.stop() : session.dispose();
				});
				await session.start(correlation());
				await ending;
				if (forbidden) expect(env.order).not.toContain(forbidden);
				env.assertReleased();
				env.restore();
			}
		},
	);

	test.each(["stop", "dispose"] as const)(
		"%s during each synchronous browser hook blocks its next effect",
		async (action) => {
			for (const [checkpoint, forbidden] of SIDE_EFFECT_CHECKPOINTS) {
				const env = new FakeBrowser();
				const session = createRealtimeMediaSession(host(env));
				let ending: Promise<unknown> | undefined;
				env.onStep = (step) => {
					if (!ending && step === checkpoint)
						ending = action === "stop" ? session.stop() : session.dispose();
				};
				await session.start(correlation());
				await ending;
				expect(env.order).not.toContain(forbidden);
				env.assertReleased();
				env.restore();
			}
		},
	);

	test.each(NEGOTIATION_STAGES)("one start deadline expires during %s", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		env.advance(CODEX_REALTIME_START_MS);
		const timedOut = await starting;
		expect(timedOut.state).toMatchObject({ phase: "recoverable_error", reason: "sdp_failed" });
		env.release();
		await settle();
		expect(session.getSnapshot()).toBe(timedOut);
		env.assertReleased();
	});

	test("a phase completing one millisecond before the deadline can succeed", async () => {
		const env = new FakeBrowser();
		env.pause = "createOffer";
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		env.advance(CODEX_REALTIME_START_MS - 1);
		env.release();
		expect((await starting).state).toEqual({
			phase: "listening",
			reason: "negotiation_succeeded",
		});
		await session.dispose();
		env.assertReleased();
	});

	test("successive phases share one absolute post-permission deadline", async () => {
		const env = new FakeBrowser();
		env.costs.set("createOffer", 4_000);
		env.costs.set("setLocal", 4_000);
		env.costs.set("hostOffer", 4_000);
		env.pause = "setRemote";
		const session = createRealtimeMediaSession(host(env));
		const starting = session.start(correlation());
		await settle();
		env.advance(2_999);
		await settle();
		expect(session.getSnapshot().state.phase).toBe("negotiating");
		env.advance(1);
		expect((await starting).state).toMatchObject({
			phase: "recoverable_error",
			reason: "sdp_failed",
		});
		expect(env.now).toBe(CODEX_REALTIME_START_MS);
		env.release();
		await settle();
		env.assertReleased();
	});

	test.each(["delivered", "rejected", "not_delivered", "outcome_unknown", "paused"] as StopMode[])(
		"active A owns every idempotent stop when host stop is %s",
		async (mode) => {
			const env = new FakeBrowser();
			env.stopMode = mode;
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation(1));
			const terminal: string[] = [];
			let reentrant: ReturnType<typeof session.stop> | undefined;
			session.subscribe((next) => {
				if (!reentrant && next.state.phase === "stopping") reentrant = session.stop();
				if (next.state.phase === "closed" || next.state.phase === "recoverable_error")
					terminal.push(`${next.correlation?.sessionId}:${next.state.reason}`);
			});
			const second = session.start(correlation(2));
			const stopping = session.stop();
			const concurrent = session.stop();
			if (mode === "paused") {
				await settle();
				env.advance(CODEX_REALTIME_STOP_MS);
			}
			const [b, stopped, stoppedAgain] = await Promise.all([second, stopping, concurrent]);
			expect(b.state).toEqual({ phase: "closed", reason: "stopped" });
			expect(stopped.correlation).toEqual(correlation(1));
			expect(stopped).toBe(session.getSnapshot());
			expect(stoppedAgain).toBe(stopped);
			expect(await reentrant).toBe(stopped);
			expect(await session.stop()).toBe(stopped);
			expect(stopped.state).toMatchObject(
				mode === "delivered"
					? { phase: "closed", reason: "stopped" }
					: { phase: "recoverable_error", reason: "stop_failed" },
			);
			expect(terminal).toEqual([`session-1:${mode === "delivered" ? "stopped" : "stop_failed"}`]);
			expect(env.stopCount).toBe(1);
			if (mode === "delivered") {
				await session.start(correlation(3));
				await session.dispose();
				expect(session.getSnapshot().correlation).toEqual(correlation(3));
			} else {
				await session.dispose();
				expect(session.getSnapshot()).toBe(stopped);
			}
			env.assertReleased();
		},
	);

	test.each(["delivered", "rejected", "not_delivered", "outcome_unknown", "paused"] as StopMode[])(
		"implicit restart publishes active A when host stop is %s",
		async (mode) => {
			const env = new FakeBrowser();
			env.stopMode = mode;
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation(1));
			const terminal: string[] = [];
			session.subscribe((next) => {
				if (next.state.phase === "recoverable_error") terminal.push(next.state.reason);
			});
			const restarting = session.start(correlation(2));
			if (mode === "paused") {
				await settle();
				env.advance(CODEX_REALTIME_STOP_MS);
			}
			if (mode === "delivered") expect((await restarting).correlation).toEqual(correlation(2));
			else {
				expect(await restarting.then(() => "", String)).toContain("session-2/correlation-2");
				expect(session.getSnapshot()).toMatchObject({
					correlation: correlation(1),
					state: { phase: "recoverable_error", reason: "stop_failed" },
				});
				expect(await session.start(correlation(3)).then(() => "", String)).toContain("session-3");
				expect(terminal).toEqual(["stop_failed"]);
			}
			expect(env.stopCount).toBe(1);
			await session.dispose();
			env.assertReleased();
		},
	);

	test.each(["stop", "dispose"] as const)(
		"reentrant %s during an implicit restart cancels B before activation",
		async (action) => {
			const env = new FakeBrowser();
			env.stopMode = "paused";
			const session = createRealtimeMediaSession(host(env));
			await session.start(correlation(1));
			const terminal: string[] = [];
			let control: Promise<unknown> | undefined;
			session.subscribe((next) => {
				if (!control && next.state.phase === "stopping")
					control = action === "stop" ? session.stop() : session.dispose();
				if (next.state.phase === "closed" || next.state.phase === "recoverable_error")
					terminal.push(`${next.correlation?.sessionId}:${next.state.reason}`);
			});
			const restarting = session.start(correlation(2));
			await settle();
			expect(env.stopRequests).toEqual([correlation(1)]);
			env.releaseStop();
			const b = await restarting;
			await control;
			expect(b).toMatchObject({
				correlation: correlation(2),
				state: { phase: "closed", reason: action === "stop" ? "stopped" : "disposed" },
			});
			expect(session.getSnapshot()).toMatchObject({
				correlation: correlation(1),
				state: { phase: "closed", reason: action === "stop" ? "stopped" : "disposed" },
			});
			expect(terminal).toEqual([`session-1:${action === "stop" ? "stopped" : "disposed"}`]);
			expect(env.order.filter((step) => step === "getUserMedia")).toHaveLength(1);
			expect(env.peers).toHaveLength(1);
			expect(env.stopCount).toBe(1);
			env.assertReleased();
		},
	);

	test("concurrent dispose preserves an unconfirmed active stop failure", async () => {
		const env = new FakeBrowser();
		env.stopMode = "paused";
		const session = createRealtimeMediaSession(host(env));
		await session.start(correlation(1));
		let disposing: Promise<void> | undefined;
		session.subscribe((next) => {
			if (!disposing && next.state.phase === "stopping") disposing = session.dispose();
		});
		const stopping = session.stop();
		await settle();
		env.advance(CODEX_REALTIME_STOP_MS);
		await Promise.all([stopping, disposing]);
		expect(session.getSnapshot()).toMatchObject({
			correlation: correlation(1),
			state: { phase: "recoverable_error", reason: "stop_failed" },
		});
		expect(env.stopCount).toBe(1);
		env.assertReleased();
	});

	test.each(["stop", "dispose", "restart"] as const)(
		"%s verifies every delivered host identity",
		async (action) => {
			for (const identity of STOP_IDENTITIES) {
				const env = new FakeBrowser();
				env.stopIdentity = identity;
				const session = createRealtimeMediaSession(host(env));
				await session.start(correlation(1));
				let result;
				if (action === "stop") result = await session.stop();
				else if (action === "dispose") {
					await session.dispose();
					result = session.getSnapshot();
				} else if (identity === "exact") result = await session.start(correlation(2));
				else {
					expect(await session.start(correlation(2)).then(() => "", String)).toContain("session-2");
					result = session.getSnapshot();
				}
				expect(env.stopRequests[0]).toEqual(correlation(1));
				expect(result).toBe(session.getSnapshot());
				if (identity === "exact")
					expect(result.state).toMatchObject(
						action === "restart"
							? { phase: "listening" }
							: { phase: "closed", reason: action === "dispose" ? "disposed" : "stopped" },
					);
				else
					expect(result).toMatchObject({
						correlation: correlation(1),
						state: { phase: "recoverable_error", reason: "stop_failed" },
					});
				if (action !== "dispose") await session.dispose();
				env.assertReleased();
				env.restore();
			}
		},
	);
});
