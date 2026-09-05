import { describe, expect, test } from "bun:test";

import { CODEX_REALTIME_START_MS } from "@/shared/timing/timing";
import { createRealtimeMediaSession } from "@/ui/codex-realtime";
import type { RealtimeMediaSession, RealtimeMediaSnapshot } from "@/ui/codex-realtime";
import {
	FakeBrowser,
	PUBLISHED_CHECKPOINTS,
	SIDE_EFFECT_CHECKPOINTS,
	correlation,
	host,
	settle,
	type Stage,
} from "@/ui/codex-realtime/tests/support/media-session-fakes";

const NEGOTIATION_STAGES: Stage[] = ["createOffer", "setLocal", "hostOffer", "setRemote", "resume"];
const LISTENER_POSITIONS: ListenerPosition[] = ["first", "middle", "last"];
const ENDINGS: Ending[] = ["stop", "dispose"];
type ListenerPosition = "first" | "middle" | "last";
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

/**
 * Three listeners, one of which throws when the target snapshot arrives.
 * @param media The session.
 * @param throwing Which listener throws.
 * @param target The snapshot the listeners react to.
 * @returns The delivery order at the target and everything each listener saw.
 */
function subscribeThrowingTriplet(
	media: RealtimeMediaSession,
	throwing: ListenerPosition,
	target: (snapshot: RealtimeMediaSnapshot) => boolean,
): { readonly order: string[]; readonly seen: Record<ListenerPosition, string[]> } {
	const order: string[] = [];
	const seen: Record<ListenerPosition, string[]> = { first: [], middle: [], last: [] };
	for (const label of LISTENER_POSITIONS) {
		media.subscribe((next) => {
			seen[label].push(
				`${next.correlation?.sessionId ?? "none"}:${next.state.phase}:${next.state.reason}`,
			);
			if (!target(next)) {
				return;
			}
			order.push(label);
			if (label === throwing) {
				throw new Error("consumer");
			}
		});
	}
	return { order, seen };
}

/**
 * Asserts each listener saw one publication exactly once.
 * @param seen What each listener saw.
 * @param value The publication.
 */
function expectSeenOnce(seen: Record<ListenerPosition, string[]>, value: string): void {
	for (const label of LISTENER_POSITIONS) {
		expect(seen[label].filter((entry) => entry === value)).toHaveLength(1);
	}
}

/**
 * Every ending paired with every entry of a table.
 * @param rows The table.
 * @returns The cartesian product.
 */
function withEndings<Row extends readonly unknown[]>(rows: readonly Row[]): [Ending, ...Row][] {
	return ENDINGS.flatMap((ending) => rows.map((row): [Ending, ...Row] => [ending, ...row]));
}

describe("realtime browser media lifecycle boundaries", () => {
	test.each(LISTENER_POSITIONS)(
		"a throwing %s listener cannot interrupt implicit restart cleanup",
		async (throwing) => {
			const env = new FakeBrowser();
			const media = session(env);
			await media.start(correlation(1));
			const observed = subscribeThrowingTriplet(
				media,
				throwing,
				(next) => next.correlation?.sessionId === "session-1" && next.state.phase === "stopping",
			);
			const restarted = await media.start(correlation(2));
			expect(observed.order).toEqual([...LISTENER_POSITIONS]);
			expect(restarted).toMatchObject({
				correlation: correlation(2),
				state: { phase: "listening", reason: "negotiation_succeeded" },
			});
			expectSeenOnce(observed.seen, "session-1:closed:stopped");
			expect(env.peers[0]!.connectionState).toBe("closed");
			expect(env.stopRequests).toEqual([correlation(1)]);
			await media.dispose();
			env.assertReleased();
		},
	);

	test.each(LISTENER_POSITIONS)(
		"a throwing %s listener cannot change ordinary stop or suppress host stop",
		async (throwing) => {
			const env = new FakeBrowser();
			const media = session(env);
			await media.start(correlation());
			const observed = subscribeThrowingTriplet(
				media,
				throwing,
				(next) => next.state.phase === "stopping",
			);
			const stopped = await media.stop();
			expect(observed.order).toEqual([...LISTENER_POSITIONS]);
			expect(stopped).toMatchObject({
				correlation: correlation(),
				state: { phase: "closed", reason: "stopped" },
			});
			expectSeenOnce(observed.seen, "session-1:closed:stopped");
			expect(env.stopRequests).toEqual([correlation()]);
			env.assertReleased();
		},
	);

	test.each(LISTENER_POSITIONS)(
		"a throwing %s listener cannot replace a recoverable failure",
		async (throwing) => {
			const env = new FakeBrowser();
			env.fail = "createOffer";
			const media = session(env);
			const observed = subscribeThrowingTriplet(
				media,
				throwing,
				(next) => next.state.phase === "recoverable_error",
			);
			const failed = await media.start(correlation());
			expect(observed.order).toEqual([...LISTENER_POSITIONS]);
			expect(failed.state).toMatchObject({ phase: "recoverable_error", reason: "sdp_failed" });
			expectSeenOnce(observed.seen, "session-1:recoverable_error:sdp_failed");
			expect(env.stopCount).toBe(0);
			env.assertReleased();
		},
	);

	test.each(LISTENER_POSITIONS)(
		"a throwing %s listener cannot replace a terminal failure",
		async (throwing) => {
			const env = new FakeBrowser();
			const mediaHost = host(env);
			const media = createRealtimeMediaSession(
				{
					...mediaHost,
					/**
					 * Answers with a foreign session identity.
					 * @param offer The offer.
					 * @returns A mismatched answer.
					 */
					createOffer: async (offer) => ({
						...(await mediaHost.createOffer(offer)),
						sessionId: correlation(9).sessionId,
					}),
				},
				{ environment: env.environment() },
			);
			const observed = subscribeThrowingTriplet(
				media,
				throwing,
				(next) => next.state.phase === "terminal_error",
			);
			const failed = await media.start(correlation());
			expect(observed.order).toEqual([...LISTENER_POSITIONS]);
			expect(failed.state).toMatchObject({ phase: "terminal_error", reason: "protocol_error" });
			expectSeenOnce(observed.seen, "session-1:terminal_error:protocol_error");
			expect(env.stopRequests).toEqual([correlation()]);
			env.assertReleased();
		},
	);

	test.each(LISTENER_POSITIONS)(
		"a throwing %s listener cannot reject terminal close",
		async (throwing) => {
			const env = new FakeBrowser();
			const media = session(env);
			await media.start(correlation());
			const observed = subscribeThrowingTriplet(
				media,
				throwing,
				(next) => next.state.phase === "closed",
			);
			await media.dispose();
			expect(observed.order).toEqual([...LISTENER_POSITIONS]);
			expect(media.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
			expectSeenOnce(observed.seen, "session-1:closed:disposed");
			expect(env.stopRequests).toEqual([correlation()]);
			env.assertReleased();
		},
	);

	test("a repeatedly throwing listener stays subscribed and isolated", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		let throwingDeliveries = 0;
		let laterDeliveries = 0;
		media.subscribe(() => {
			throwingDeliveries += 1;
			throw new Error("consumer");
		});
		media.subscribe(() => {
			laterDeliveries += 1;
		});
		await media.start(correlation());
		await media.stop();
		expect(throwingDeliveries).toBeGreaterThan(3);
		expect(laterDeliveries).toBe(throwingDeliveries);
		env.assertReleased();
	});

	test.each(["pending", "rejected"] as const)(
		"%s browser cleanup promises cannot retain the lifecycle queue",
		async (mode) => {
			const env = new FakeBrowser();
			env.senderCount = 3;
			env.replaceTrackMode = mode;
			const media = session(env);
			await media.start(correlation(1));
			expect((await media.stop()).state).toEqual({ phase: "closed", reason: "stopped" });
			expect((await media.start(correlation(2))).state.phase).toBe("listening");
			await media.dispose();
			expect(env.peers.map((peer) => peer.senders.length)).toEqual([3, 3]);
			env.assertReleased();
		},
	);

	test.each(withEndings(PUBLISHED_CHECKPOINTS))(
		"%s from the %s/%s publication blocks %s",
		async (ending, phase, reason, forbidden) => {
			const env = new FakeBrowser();
			const media = session(env);
			let pending: Promise<unknown> | undefined;
			media.subscribe((next) => {
				if (pending === undefined && next.state.phase === phase && next.state.reason === reason) {
					pending = end(media, ending);
				}
			});
			await media.start(correlation());
			await pending;
			if (forbidden !== null) {
				expect(env.order).not.toContain(forbidden);
			}
			env.assertReleased();
		},
	);

	test.each(withEndings(SIDE_EFFECT_CHECKPOINTS))(
		"%s during the %s browser hook blocks %s",
		async (ending, checkpoint, forbidden) => {
			const env = new FakeBrowser();
			const media = session(env);
			let pending: Promise<unknown> | undefined;
			/**
			 * Ends the session at the checkpoint.
			 * @param step The step reached.
			 */
			env.onStep = (step) => {
				if (pending === undefined && step === checkpoint) {
					pending = end(media, ending);
				}
			};
			await media.start(correlation());
			await pending;
			expect(env.order).not.toContain(forbidden);
			env.assertReleased();
		},
	);

	test.each(ENDINGS)(
		"%s while the meter is being built blocks the resume and the level loop",
		async (ending) => {
			const env = new FakeBrowser();
			env.costs.set("resume", 0);
			const media = session(env);
			let pending: Promise<unknown> | undefined;
			/**
			 * Ends the session when the meter is built.
			 * @param step The step reached.
			 */
			env.onStep = (step) => {
				if (pending === undefined && step === "meter") {
					pending = end(media, ending);
				}
			};
			await media.start(correlation());
			await pending;
			expect(env.order).not.toContain("resume");
			expect(env.frames.size).toBe(0);
			expect(media.outputLevel.current()).toBe(0);
			env.assertReleased();
		},
	);

	test.each(NEGOTIATION_STAGES)("one start deadline expires during %s", async (stage) => {
		const env = new FakeBrowser();
		env.pause = stage;
		const media = session(env);
		const starting = media.start(correlation());
		await settle();
		env.advance(CODEX_REALTIME_START_MS);
		const timedOut = await starting;
		expect(timedOut.state).toMatchObject({ phase: "recoverable_error", reason: "sdp_failed" });
		env.release();
		await settle();
		expect(media.getSnapshot()).toBe(timedOut);
		env.assertReleased();
	});

	test("a phase completing one millisecond before the deadline can succeed", async () => {
		const env = new FakeBrowser();
		env.pause = "createOffer";
		const media = session(env);
		const starting = media.start(correlation());
		await settle();
		env.advance(CODEX_REALTIME_START_MS - 1);
		env.release();
		expect((await starting).state).toEqual({
			phase: "listening",
			reason: "negotiation_succeeded",
		});
		await media.dispose();
		env.assertReleased();
	});

	test("successive phases share one absolute post-permission deadline", async () => {
		const env = new FakeBrowser();
		env.costs.set("createOffer", 4_000);
		env.costs.set("setLocal", 4_000);
		env.costs.set("hostOffer", 4_000);
		env.pause = "setRemote";
		const media = session(env);
		const starting = media.start(correlation());
		await settle();
		env.advance(2_999);
		await settle();
		expect(media.getSnapshot().state.phase).toBe("negotiating");
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
});
