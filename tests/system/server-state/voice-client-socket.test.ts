import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { createVoiceAgent } from "@archboard/codex-realtime-voice/server";
import { prepareProductionFixture } from "./support/codex-production.ts";
import { waitFor } from "./support/http.ts";

test("the browser client meets an agent's Bun.serve sockets before start and reconnects by itself after a restart", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "fixtures/fake-codex-production.ts"),
	);
	const checkout = join(fixture.root, "checkout");
	mkdirSync(checkout);
	const agent = createVoiceAgent({
		directory: join(fixture.root, "private"),
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
	const client = createVoiceClient({ url: "/voice" });
	resources.defer(() => client.dispose());

	await waitFor(() => client.snapshot().failure !== null, "the client to be refused before start");
	expect(client.snapshot().failure?.message).toBe("The Codex workbench is unavailable.");
	expect(client.snapshot().connection).not.toBe("connected");

	await agent.start();
	await waitFor(
		() => client.snapshot().connection === "connected" && client.snapshot().server !== null,
		"the client to connect once the agent is ready",
	);
	expect(client.snapshot().failure).toBeNull();

	await agent.shutdown();
	await waitFor(
		() => client.snapshot().connection === "reconnecting",
		"the client to lose its socket",
	);
	await agent.start();
	await waitFor(
		() => client.snapshot().connection === "connected" && client.snapshot().server !== null,
		"the client to reconnect by itself",
	);
}, 30_000);
