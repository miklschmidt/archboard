import { expect, test } from "bun:test";

import { createBrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import type { BrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import { FakeMediaBrowser } from "@/ui/codex-workbench-media/tests/support/fake-media-environment";
import { FakeTransport } from "@/ui/codex-workbench-media/tests/support/fake-transport";

/**
 * An owner over the fake browser.
 * @param browser The fake browser.
 * @returns The owner.
 */
function browserOwner(browser: FakeMediaBrowser): BrowserWorkbenchMediaOwner {
	return createBrowserWorkbenchMediaOwner({
		environment: browser.environment(),
		audioElements: browser.audioElements(),
		/**
		 * Supported.
		 * @returns True.
		 */
		mediaSupported: () => true,
	});
}

// The owner's half of the mute path. Muting is a local track toggle, so the
// interesting facts are negative: no lease is claimed, no command reaches the
// transport, and the change still becomes visible through the owner's
// forwarded subscription.
test("mutes and unmutes through the realtime session without a lease or a command", async () => {
	const browser = new FakeMediaBrowser();
	const transport = new FakeTransport();
	const owner = browserOwner(browser);
	const published: string[] = [];
	try {
		await owner.attach(transport);
		const release = owner.subscribe(() => {
			published.push(owner.snapshot()?.state.phase ?? "none");
		});
		await owner.start();
		const commandsAfterStart = transport.commands.length;
		const readyAfterStart = transport.mediaReady.length;
		expect(browser.localTrack.enabled).toBe(true);

		const muted = await owner.mute();

		expect(muted.state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(owner.snapshot()?.state.phase).toBe("muted");
		expect(browser.localTrack.enabled).toBe(false);
		// Nothing was authorized and nothing was sent: a disabled track is not a
		// wire operation, so the owner must not claim or command for one.
		expect(transport.commands).toHaveLength(commandsAfterStart);
		expect(transport.mediaReady).toHaveLength(readyAfterStart);
		// The forwarded subscription is what makes the phase visible at all.
		expect(published).toContain("muted");
		// The model output level channel stays attached while muted.
		expect(owner.outputLevel()).not.toBeNull();

		const unmuted = await owner.unmute();

		expect(unmuted.state).toEqual({ phase: "listening", reason: "unmute_requested" });
		expect(browser.localTrack.enabled).toBe(true);
		expect(transport.commands).toHaveLength(commandsAfterStart);
		release();

		await owner.stop();
		browser.assertReleased();
	} finally {
		await owner.dispose();
	}
});

/**
 * How a control settled: its rejection message, or "resolved".
 * @param control The control's promise.
 * @returns The settlement.
 */
function settlement(control: Promise<unknown>): Promise<string> {
	return control.then(
		() => "resolved",
		(error: unknown) => (error instanceof Error ? error.message : "unknown"),
	);
}

test("refuses a mute with no active realtime session and names why", async () => {
	const owner = createBrowserWorkbenchMediaOwner();
	try {
		expect(await settlement(owner.mute())).toBe("No realtime media session is active.");
		expect(await settlement(owner.unmute())).toBe("No realtime media session is active.");
	} finally {
		await owner.dispose();
	}
	expect(await settlement(owner.mute())).toBe("No realtime media session is active.");
});
