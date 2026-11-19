import { expect, test } from "bun:test";

import { createVoiceConnector } from "#server/agent/services/connect.ts";
import { createWorkbenchBrowserConnections } from "#server/browser-socket/services/connections.ts";
import { createTabSessions } from "#server/sessions/services/browser-tabs.ts";
import { parseTabSessionId } from "#server/tab-session/rules/tab-session.ts";
import { createGatewayHarness } from "#tests/server/support/gateway/support.ts";
import { createCodexWorkbenchGenerationFixture } from "#tests/server/support/generation/generation-fixture.ts";

const CHECKOUT = "/work/checkout";
const SURFACE = "/voice?tabSessionId=tab-one&chatId=main";

/**
 * A socket that keeps what the agent sends it and how the agent closed it.
 * @returns The socket, the parsed frames it sent and its closes.
 */
function fakeSocket() {
	const sent: unknown[] = [];
	const closes: (readonly [number, string])[] = [];
	const socket = {
		send: (data: string) => {
			sent.push(JSON.parse(data));
		},
		close: (code: number, reason: string) => {
			closes.push([code, reason]);
		},
	};
	return { socket, sent, closes };
}

/**
 * The agent's connector over its own registry, admitting one checkout.
 * @param origins The origins admitted beside the loopback default.
 * @returns The connector, its registry and the tabs.
 */
function connector(origins: readonly string[] = []) {
	const tabs = createTabSessions();
	const connections = createWorkbenchBrowserConnections(tabs);
	const made = createVoiceConnector({
		connections,
		admit: (named) => (named === CHECKOUT ? CHECKOUT : null),
		onlyCheckout: CHECKOUT,
		origins: new Set(origins),
	});
	return { ...made, connections, tabs };
}

/**
 * A voice request.
 * @param requestId Its id.
 * @param action What it asks for.
 * @returns The frame.
 */
function voiceRequest(requestId: unknown, action = "connect") {
	return { type: "codex_workbench_request", requestId, action };
}

/**
 * Whether a `{ request }` route is admitted: its socket stays open, and its frames reach the
 * registry, which refuses them while no Codex generation is installed.
 * @param url The upgrade URL.
 * @param headers The upgrade headers.
 * @param origins The origins the agent admits beside its loopback default.
 * @returns The close the agent made, or "admitted".
 */
async function admission(
	url: string,
	headers: Record<string, string>,
	origins: readonly string[] = [],
) {
	const { connect } = connector(origins);
	const { socket, sent, closes } = fakeSocket();
	const connection = connect(socket, { request: { url, headers } });
	if (closes.length > 0) return closes[0]?.[0];
	await connection.receive(voiceRequest("probe"));
	expect(sent).toEqual([
		expect.objectContaining({ ok: false, error: "The Codex workbench is unavailable." }),
	]);
	return "admitted";
}

test("a request route admits a loopback page of its own origin and listed origins, and closes the rest with 1008", async () => {
	const own = { host: "127.0.0.1:4100", origin: "http://127.0.0.1:4100" };
	expect(await admission(`http://127.0.0.1:4100${SURFACE}`, own)).toBe("admitted");
	expect(await admission(`http://localhost:4100${SURFACE}`, { host: "localhost:4100" })).toBe(
		"admitted",
	);
	expect(
		await admission(`http://127.0.0.1:4100${SURFACE}`, { ...own, origin: "http://localhost:4100" }),
	).toBe(1008);
	expect(
		await admission(`http://127.0.0.1:4100${SURFACE}`, { ...own, origin: "https://127.0.0.1:4100" }),
	).toBe(1008);
	expect(
		await admission(`http://127.0.0.1:4100${SURFACE}`, { ...own, origin: "https://other.example" }),
	).toBe(1008);
	expect(await admission(`http://voice.example.com${SURFACE}`, { host: "voice.example.com" })).toBe(
		1008,
	);
	const listed = { host: "voice.example.com", origin: "https://voice.example.com" };
	expect(
		await admission(`https://voice.example.com${SURFACE}`, listed, ["https://voice.example.com"]),
	).toBe("admitted");
	expect(await admission("http://127.0.0.1:4100/voice?chatId=main", own)).toBe(1008);
});

test("receive answers false at once for a frame that is not a voice request", () => {
	const { connect } = connector();
	const { socket, sent } = fakeSocket();
	const connection = connect(socket, {
		tabSessionId: parseTabSessionId("tab-one"),
		browserId: "browser",
		chat: "main",
	});
	for (const frame of [{ type: "pane_place" }, "text", null, 4])
		expect(connection.receive(frame)).toBe(false);
	expect(sent).toEqual([]);
});

test("the three refusals keep their envelope, wording and order", async () => {
	const { connect } = connector();
	const answers = async (route: Parameters<typeof connect>[1], requestId: unknown = "r1") => {
		const { socket, sent } = fakeSocket();
		await connect(socket, route).receive(voiceRequest(requestId, "snapshot"));
		return sent;
	};
	expect(await answers({ tabSessionId: null, browserId: null, chat: "main" })).toEqual([
		{
			type: "codex_workbench_result",
			requestId: "r1",
			action: "snapshot",
			ok: false,
			error: "The Codex workbench requires an authoritative browser connection identity.",
		},
	]);
	expect(await answers({ tabSessionId: null, browserId: "browser", chat: "main" }, 7)).toEqual([
		{
			type: "codex_workbench_result",
			requestId: null,
			action: "snapshot",
			ok: false,
			error: "The Codex workbench requires the browser tab session identity.",
		},
	]);
	expect(
		await answers({ tabSessionId: parseTabSessionId("tab-one"), browserId: "browser", chat: "main" }),
	).toEqual([
		{
			type: "codex_workbench_result",
			requestId: "r1",
			action: "snapshot",
			ok: false,
			error: "The Codex workbench is unavailable.",
		},
	]);
});

test("a socket connected before Codex is ready is served by each generation that installs, reading its chat on every frame", async () => {
	const { connect, connections } = connector();
	const generations = [
		createCodexWorkbenchGenerationFixture([]),
		createCodexWorkbenchGenerationFixture([]),
	];
	const harnesses = generations.map((fixture) => createGatewayHarness(fixture.components.identity));
	const [first, second] = harnesses;
	if (first === undefined || second === undefined) throw new Error("Two generations are needed.");
	let chatReads = 0;
	const { socket, sent } = fakeSocket();
	const connection = connect(socket, {
		tabSessionId: first.tabSessionId,
		browserId: first.browserId,
		chat: () => {
			chatReads += 1;
			return first.chatId;
		},
		checkout: CHECKOUT,
	});
	try {
		await connection.receive(voiceRequest("before"));
		for (const [index, harness] of harnesses.entries()) {
			const fixture = generations[index]!;
			const remove = connections.install({ ...fixture.components, gateway: harness.gateway });
			const reads = chatReads;
			await connection.receive(voiceRequest(`generation-${index}`, "claimLease"));
			await connection.receive(voiceRequest(`generation-${index}-again`, "claimLease"));
			expect(chatReads).toBeGreaterThanOrEqual(reads + 2);
			remove();
		}
		expect(sent.map((answer) => (answer as { ok: boolean }).ok)).toEqual([
			false,
			true,
			true,
			true,
			true,
		]);
	} finally {
		await connection.close();
		for (const [index, harness] of harnesses.entries()) {
			await harness.gateway.dispose();
			await generations[index]!.components.sessions.dispose();
		}
	}
});

test("a replaced socket's requests are refused, and its close keeps the replacement's tab", async () => {
	const fixture = createCodexWorkbenchGenerationFixture([]);
	const harness = createGatewayHarness(fixture.components.identity);
	const { connect, connections, tabs } = connector();
	const remove = connections.install({ ...fixture.components, gateway: harness.gateway });
	const route = {
		tabSessionId: harness.tabSessionId,
		browserId: harness.browserId,
		chat: harness.chatId,
	};
	const replaced = fakeSocket();
	const replacing = fakeSocket();
	try {
		const first = connect(replaced.socket, route);
		const replacement = connect(replacing.socket, { ...route, chat: "replacement-chat" });
		await expect(first.receive(voiceRequest("stale", "claimLease"))).rejects.toThrow(
			"The browser socket instance is not registered.",
		);
		await first.close();
		expect(tabs.of(harness.browserId)).toBe(harness.tabSessionId);
		await replacement.receive(voiceRequest("replacement", "claimLease"));
		expect(replacing.sent).toContainEqual(
			expect.objectContaining({ requestId: "replacement", ok: true }),
		);
		await replacement.close();
		expect(tabs.of(harness.browserId)).toBeNull();
	} finally {
		remove();
		tabs.forgetAll();
		await harness.gateway.dispose();
		await fixture.components.sessions.dispose();
	}
});

test("a named checkout must be admitted; a checkout the host reads itself is the host's to admit", () => {
	const { connect, checkoutFor } = connector();
	const tabSessionId = parseTabSessionId("tab-one");
	expect(() =>
		connect(fakeSocket().socket, {
			tabSessionId,
			browserId: "browser",
			chat: "main",
			checkout: "/elsewhere",
		}),
	).toThrow(TypeError);
	expect(() =>
		connect(fakeSocket().socket, {
			request: { url: `http://127.0.0.1:4100${SURFACE}`, headers: { host: "127.0.0.1:4100" } },
			checkout: "/elsewhere",
		}),
	).toThrow(TypeError);
	expect(() =>
		connect(fakeSocket().socket, {
			tabSessionId,
			browserId: "browser",
			chat: "main",
			checkout: () => "/elsewhere",
		}),
	).not.toThrow();
	expect(checkoutFor(undefined)).toBe(CHECKOUT);
});

test("closing every connection closes only the sockets the agent admitted from their requests", async () => {
	const { connect, closeAll, tabs } = connector();
	const admitted = fakeSocket();
	const hosted = fakeSocket();
	connect(admitted.socket, {
		request: { url: `http://127.0.0.1:4100${SURFACE}`, headers: { host: "127.0.0.1:4100" } },
	});
	const hostRoute = connect(hosted.socket, {
		tabSessionId: parseTabSessionId("tab-two"),
		browserId: "hosted",
		chat: "main",
	});
	await closeAll();
	expect(admitted.closes).toEqual([[1001, "The voice agent stopped."]]);
	expect(hosted.closes).toEqual([]);
	expect(tabs.of("hosted")).toBeNull();
	await expect(hostRoute.receive(voiceRequest("late"))).rejects.toThrow(
		"The voice connection is closed.",
	);
});
