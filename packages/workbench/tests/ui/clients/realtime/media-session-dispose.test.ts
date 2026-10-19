import { describe, expect, test } from "bun:test";

import { createRealtimeMediaSession } from "#ui/clients/realtime/media-session.ts";
import type { RealtimeMediaSession } from "#ui/state/realtime/session-contract.ts";
import { FakeBrowser, correlation } from "#tests/ui/support/realtime/media-session-fakes.ts";
import { realtimeServer, settle } from "#tests/ui/support/realtime/media-session-server.ts";

/**
 * A session over a fresh fake browser.
 * @param env The fake browser.
 * @returns The session.
 */
function session(env: FakeBrowser): RealtimeMediaSession {
	return createRealtimeMediaSession(realtimeServer(env), { environment: env.environment() });
}

describe("realtime browser media session disposal", () => {
	test("dispose dominates A/B/stop and callers share one completion", async () => {
		const env = new FakeBrowser();
		env.pause = "getUserMedia";
		const media = session(env);
		const closed: string[] = [];
		media.subscribe((next) => {
			if (next.state.phase === "closed") {
				closed.push(next.state.reason);
			}
		});
		const first = media.start(correlation(1));
		await settle();
		const second = media.start(correlation(2));
		const stopping = media.stop();
		const disposing = media.dispose();
		expect(media.dispose()).toBe(disposing);
		const [a, b, stopped] = await Promise.all([first, second, stopping, disposing]);
		for (const result of [a, b, stopped]) {
			expect(result.state).toEqual({ phase: "closed", reason: "disposed" });
		}
		expect(closed).toEqual(["disposed"]);
		env.release();
		await settle();
		env.assertReleased();
	});

	test("reentrant and concurrent dispose calls share completion", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		await media.start(correlation());
		let reentrant: Promise<void> | undefined;
		media.subscribe((next) => {
			if (next.state.phase === "stopping") {
				reentrant = media.dispose();
			}
		});
		const first = media.dispose();
		expect(media.dispose()).toBe(first);
		await settle();
		expect(reentrant).toBe(first);
		await Promise.all([first, reentrant]);
		expect(media.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		env.assertReleased();
	});

	test.each([
		["stop", "first"],
		["stop", "middle"],
		["stop", "last"],
		["dispose", "first"],
		["dispose", "middle"],
		["dispose", "last"],
	] as const)("a later reentrant %s survives a throwing %s listener", async (action, throwing) => {
		const env = new FakeBrowser();
		const media = session(env);
		const order: string[] = [];
		let ending: Promise<unknown> | undefined;
		for (const label of ["first", "middle", "last"]) {
			media.subscribe((next) => {
				if (next.state.phase !== "listening") {
					return;
				}
				order.push(label);
				if (label === throwing) {
					throw new Error("consumer");
				}
			});
		}
		media.subscribe((next) => {
			if (next.state.phase !== "listening" || ending !== undefined) {
				return;
			}
			order.push(action);
			ending = action === "stop" ? media.stop() : media.dispose();
		});
		media.subscribe((next) => {
			if (next.state.phase === "listening") {
				order.push("later");
			}
		});
		const started = await media.start(correlation());
		await ending;
		expect(order).toEqual(["first", "middle", "last", action, "later"]);
		expect(started.state).toEqual({
			phase: "closed",
			reason: action === "stop" ? "stopped" : "disposed",
		});
		expect(media.getSnapshot()).toBe(started);
		expect(env.stopRequests).toEqual([correlation()]);
		env.assertReleased();
	});
});
