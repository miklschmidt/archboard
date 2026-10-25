import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { createVoiceAgent } from "@archboard/codex-realtime-voice/server";
import { prepareProductionFixture } from "./support/codex-production.ts";
import { waitFor } from "./support/http.ts";

/**
 * Read how the server closes one socket on a URL.
 * @param url The socket URL.
 * @returns The close code and reason.
 */
function closeOf(url: string): Promise<{ readonly code: number; readonly reason: string }> {
	return new Promise((resolve) => {
		const socket = new WebSocket(url);
		socket.addEventListener("close", ({ code, reason }) => resolve({ code, reason }), {
			once: true,
		});
	});
}

test("the browser client meets an agent's Bun.serve sockets before start and reconnects after a restart", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "fixtures/fake-codex-production.ts"),
	);
	const checkout = join(fixture.root, "checkout");
	mkdirSync(checkout);
	const agent = createVoiceAgent({
		storage: { directory: join(fixture.root, "private") },
		codex: { executablePath: fixture.executablePath },
		checkouts: [checkout],
		instructions: { coordinator: "Coordinate.", workhorse: "Work." },
		/**
		 * Fail the test on a fatal agent error.
		 * @param error The error.
		 */
		onFatal: (error) => {
			throw error;
		},
	});
	resources.defer(() => agent.shutdown());
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		...agent.bunHandlers({ path: "/voice" }),
	});
	resources.defer(() => server.stop(true));
	// The client resolves its socket path against the page; this process has no page of its own.
	Object.defineProperty(globalThis, "location", {
		value: { href: `${server.url.origin}/page` },
		configurable: true,
	});
	resources.defer(() => {
		Reflect.deleteProperty(globalThis, "location");
	});
	const client = createVoiceClient({ socketPath: "/voice" });
	resources.defer(() => client.dispose());

	expect(await client.connect()).toBe(false);
	const refused = await closeOf(
		`${server.url.origin.replace("http:", "ws:")}/voice?tabSessionId=t&paneId=main`,
	);
	expect(refused.code).toBe(1011);
	expect(client.snapshot().failure?.message).toBe(refused.reason);
	expect(client.snapshot().connection).toBe("reconnecting");

	await agent.start();
	expect(await client.connect()).toBe(true);
	expect(client.snapshot().server?.account.state).toBeDefined();

	await agent.shutdown();
	await waitFor(
		() => client.snapshot().connection === "reconnecting",
		"the client to lose its socket",
	);
	await agent.start();
	server.reload({ ...agent.bunHandlers({ path: "/voice" }) });
	await waitFor(
		() => client.snapshot().connection === "connected" && client.snapshot().server !== null,
		"the client to reconnect by itself",
	);
});
