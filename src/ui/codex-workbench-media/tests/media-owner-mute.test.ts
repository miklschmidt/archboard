import { afterEach, expect, test } from "bun:test";

import { createBrowserWorkbenchMediaOwner } from "../index.js";
import { FakeBrowser, restoreFakeBrowsers } from "./support/browser-media-fake.js";
import {
	FakeTransport,
	installDocument,
	restoreDocument,
	type FakeAudioElement,
} from "./support/media-owner-harness.js";

afterEach(restoreFakeBrowsers);

// The owner's half of the TASK-143.04.02 mute path. Muting is a local track
// toggle, so the interesting facts are negative: no lease is claimed, no
// command reaches the transport, and the change still becomes visible through
// the owner's forwarded subscription.
test("mutes and unmutes through the realtime session without a lease or a command", async () => {
	const environment = new FakeBrowser();
	const audio: FakeAudioElement[] = [];
	const documentDescriptor = installDocument(audio);
	const transport = new FakeTransport();
	const owner = createBrowserWorkbenchMediaOwner();
	const published: string[] = [];
	try {
		await owner.attach(transport);
		const release = owner.subscribe(() => {
			published.push(owner.snapshot()?.state.phase ?? "none");
		});
		await owner.start();
		const commandsAfterStart = transport.commands.length;
		const readyAfterStart = transport.mediaReady.length;
		expect(environment.localTracks.at(-1)?.enabled).toBe(true);

		const muted = await owner.mute();

		expect(muted.state).toEqual({ phase: "muted", reason: "mute_requested" });
		expect(owner.snapshot()?.state.phase).toBe("muted");
		expect(environment.localTracks.at(-1)?.enabled).toBe(false);
		// Nothing was authorized and nothing was sent: a disabled track is not a
		// wire operation, so the owner must not claim or command for one.
		expect(transport.commands).toHaveLength(commandsAfterStart);
		expect(transport.mediaReady).toHaveLength(readyAfterStart);
		// The forwarded subscription is what makes the phase visible at all.
		expect(published).toContain("muted");

		const unmuted = await owner.unmute();

		expect(unmuted.state).toEqual({ phase: "listening", reason: "unmute_requested" });
		expect(environment.localTracks.at(-1)?.enabled).toBe(true);
		expect(transport.commands).toHaveLength(commandsAfterStart);
		release();

		await owner.stop();
		environment.assertReleased();
	} finally {
		await owner.dispose();
		restoreDocument(documentDescriptor);
	}
});

test("refuses a mute with no active realtime session and names why", async () => {
	const owner = createBrowserWorkbenchMediaOwner();
	try {
		await expect(owner.mute()).rejects.toThrow("No realtime media session is active.");
		await expect(owner.unmute()).rejects.toThrow("No realtime media session is active.");
	} finally {
		await owner.dispose();
	}
	await expect(owner.mute()).rejects.toThrow("No realtime media session is active.");
});
