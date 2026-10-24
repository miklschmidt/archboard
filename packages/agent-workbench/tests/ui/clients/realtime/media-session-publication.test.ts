import { describe, expect, test } from "bun:test";

import { createRealtimeMediaSession } from "#ui/clients/realtime/media-session.ts";
import type { RealtimeMediaSession } from "#ui/state/realtime/session-contract.ts";
import { FakeBrowser, correlation } from "#tests/ui/support/realtime/media-session-fakes.ts";
import { realtimeServer } from "#tests/ui/support/realtime/media-session-server.ts";

/**
 * A session over a fresh fake browser.
 * @param env The fake browser.
 * @returns The session.
 */
function session(env: FakeBrowser): RealtimeMediaSession {
	return createRealtimeMediaSession(realtimeServer(env), { environment: env.environment() });
}

describe("realtime browser media session publication", () => {
	test("listener-triggered device loss wins on the offer-created publication", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const failures: string[] = [];
		media.subscribe((next) => {
			if (next.state.reason === "offer_created") {
				env.localTrack.lose();
			}
			if (next.state.phase === "recoverable_error") {
				failures.push(next.state.reason);
			}
		});
		const failed = await media.start(correlation());
		expect(failed.state).toMatchObject({ phase: "recoverable_error", reason: "device_lost" });
		expect(failures).toEqual(["device_lost"]);
		expect(env.order).not.toContain("serverOffer");
		expect(env.stopCount).toBe(0);
		env.assertReleased();
	});

	test("subscription changes take effect after the current publication cohort", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const seen: string[] = [];
		let changed = false;
		let unsubscribeSecond: (() => void) | undefined;
		media.subscribe((next) => {
			seen.push(`first:${next.state.phase}:${next.state.reason}`);
			if (changed || next.state.reason !== "start_requested") {
				return;
			}
			changed = true;
			unsubscribeSecond?.();
			media.subscribe((later) => {
				seen.push(`new:${later.state.phase}:${later.state.reason}`);
			});
		});
		unsubscribeSecond = media.subscribe((next) => {
			seen.push(`second:${next.state.phase}:${next.state.reason}`);
		});
		await media.start(correlation());
		expect(seen.slice(0, 4)).toEqual([
			"first:requesting_permission:start_requested",
			"second:requesting_permission:start_requested",
			"first:negotiating:permission_granted",
			"new:negotiating:permission_granted",
		]);
		await media.dispose();
		env.assertReleased();
	});

	test("reentrant device loss preserves publication order for every listener", async () => {
		const env = new FakeBrowser();
		const media = session(env);
		const first: string[] = [];
		const second: string[] = [];
		media.subscribe((next) => {
			first.push(`${next.state.phase}:${next.state.reason}`);
			if (next.state.reason === "offer_created") {
				env.localTrack.lose();
			}
		});
		media.subscribe((next) => second.push(`${next.state.phase}:${next.state.reason}`));
		const failed = await media.start(correlation());
		expect(first).toEqual([
			"requesting_permission:start_requested",
			"negotiating:permission_granted",
			"negotiating:offer_created",
			"recoverable_error:device_lost",
		]);
		expect(second).toEqual(first);
		expect(failed).toBe(media.getSnapshot());
		env.assertReleased();
	});
});
