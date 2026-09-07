import { describe, expect, test } from "bun:test";

import * as publicApi from "@/ui/codex-realtime";
import {
	FakeBrowser,
	correlation,
	host,
} from "@/ui/codex-realtime/tests/support/media-session-fakes";

describe("codex realtime public API", () => {
	test("drives negotiation, output metering, stop and dispose through the index alone", async () => {
		const env = new FakeBrowser();
		const media = publicApi.createRealtimeMediaSession(host(env), {
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
		const disposable = publicApi.createRealtimeMediaSession(host(env), {
			environment: env.environment(),
		});
		await disposable.dispose();
		unsubscribe();
		expect(observedLevel).toBeGreaterThan(0);
		expect(stopped.state).toEqual({ phase: "closed", reason: "stopped" });
		expect(disposable.getSnapshot().state).toEqual({ phase: "closed", reason: "disposed" });
		expect(env.order).toContain("hostOffer");
		env.assertReleased();
	});

	test("reports no realtime support outside a browser", () => {
		expect(publicApi.browserRealtimeMediaSupported()).toBe(false);
	});
});
