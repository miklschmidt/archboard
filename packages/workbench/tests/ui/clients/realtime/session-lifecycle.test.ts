import { describe, expect, test } from "bun:test";

import { browserRealtimeMediaSupported } from "#ui/clients/realtime/browser-environment.ts";
import { createRealtimeMediaSession } from "#ui/clients/realtime/media-session.ts";
import { FakeBrowser, correlation } from "#tests/ui/support/realtime/media-session-fakes.ts";
import { realtimeServer } from "#tests/ui/support/realtime/media-session-server.ts";

describe("realtime media session lifecycle", () => {
	test("drives negotiation, output metering, stop and dispose through the session factory alone", async () => {
		const env = new FakeBrowser();
		const media = createRealtimeMediaSession(realtimeServer(env), {
			environment: env.environment(),
		});
		let observedLevel = -1;
		const unsubscribe = media.outputLevel.subscribe((level) => {
			observedLevel = Math.max(observedLevel, level);
		});
		const started = await media.start(correlation());
		expect(started.state.phase).toBe("listening");
		env.frame();
		expect(media.outputLevel.current()).toBeGreaterThan(0);
		const stopped = await media.stop();
		const disposable = createRealtimeMediaSession(realtimeServer(env), {
			environment: env.environment(),
		});
		await disposable.dispose();
		unsubscribe();
		expect(observedLevel).toBeGreaterThan(0);
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(disposable.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		expect(env.order).toContain("serverOffer");
		env.assertReleased();
	});

	test("reports no realtime support outside a browser", () => {
		expect(browserRealtimeMediaSupported()).toBe(false);
	});
});
