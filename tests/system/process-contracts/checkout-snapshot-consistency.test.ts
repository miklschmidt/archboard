import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

import { makeIdentity, renderBoardNote, vaultPathFor } from "../../../src/runtime/engine/board.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane, waitForPaneMessage } from "../boards/support/pane-websocket.ts";
import { completeElement } from "../code-targets/support/elements.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	createDelayedCheckoutOwner,
	expectPidAbsent,
	waitForRecordedPid,
} from "./support/delayed-checkout-owner.ts";

const SERVER_PATH = fileURLToPath(new URL("../../../src/server.ts", import.meta.url));

function boundElement(id: string, path = "src/original.ts", checkout = 0) {
	return completeElement({
		id,
		type: "rectangle",
		x: 20,
		y: 20,
		width: 100,
		height: 50,
		customData: {
			archboard: {
				binding: { repo: `github.com/acme/delayed-${checkout}`, path },
			},
		},
	});
}

async function waitForMessage(
	messages: Array<Record<string, unknown>>,
	type: string,
): Promise<Record<string, unknown>> {
	const deadline = Date.now() + 2_000;
	for (;;) {
		const message = messages.find((candidate) => candidate.type === type);
		if (message) return message;
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${type}.`);
		await Bun.sleep(5);
	}
}

async function openRawWebSocketPeer(base: string, clientId: string): Promise<Socket> {
	const endpoint = new URL(base);
	const socket = createConnection({ host: endpoint.hostname, port: Number(endpoint.port) });
	await new Promise<void>((resolve, reject) => {
		socket.once("connect", resolve);
		socket.once("error", reject);
	});
	const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
	socket.write(
		[
			`GET /?clientId=${encodeURIComponent(clientId)} HTTP/1.1`,
			`Host: ${endpoint.host}`,
			"Upgrade: websocket",
			"Connection: Upgrade",
			`Sec-WebSocket-Key: ${key}`,
			"Sec-WebSocket-Version: 13",
			"",
			"",
		].join("\r\n"),
	);
	await new Promise<void>((resolve, reject) => {
		const onData = (chunk: Buffer): void => {
			if (!chunk.toString().includes("101 Switching Protocols")) return;
			socket.off("error", reject);
			socket.off("data", onData);
			resolve();
		};
		socket.on("data", onData);
		socket.once("error", reject);
	});
	return socket;
}

function writeBoundBoard(
	vault: string,
	board: string,
	element: { id: string; path: string; checkout: number },
): void {
	const identity = makeIdentity({ board });
	writeFileSync(
		vaultPathFor(identity, vault),
		renderBoardNote(
			{
				type: "excalidraw",
				version: 2,
				elements: [boundElement(element.id, element.path, element.checkout)],
				appState: {},
				files: {},
			},
			null,
			identity,
		),
	);
}

test("first-open presents the exact note load whose checkout authority it captured", async () => {
	const owner = createDelayedCheckoutOwner("first-open", 2);
	const board = "first-open-race";
	writeBoundBoard(owner.vault, board, { id: "oldbound", path: "src/original.ts", checkout: 0 });
	let canvas: Awaited<ReturnType<typeof startOwnedCanvas>> | undefined;
	let pane: Awaited<ReturnType<typeof openTestPane>> | undefined;
	try {
		canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		const request = createJsonRequester(canvas);
		pane = await openTestPane(canvas.base, request, "first-open-race-pane", 0);
		owner.enable();
		const start = pane.since();
		const opening = request("/api/boards/open", {
			method: "POST",
			body: { board, pane: pane.clientId },
		});
		await waitForRecordedPid(owner.pids);
		writeBoundBoard(owner.vault, board, {
			id: "newbound",
			path: "src/replacement.ts",
			checkout: 1,
		});
		owner.release();
		const opened = await opening;
		expect(opened.status, JSON.stringify(opened.body)).toBe(200);
		const switched = await waitForPaneMessage(pane, start, "board_switched");
		const elements = (switched?.elements as Array<{ id: string; link?: string }> | undefined) ?? [];
		expect(elements.find((element) => element.id === "oldbound")?.link).toBe(
			"/api/code-targets/open?board=first-open-race&element=oldbound",
		);
		expect(elements.some((element) => element.id === "newbound")).toBeFalse();
	} finally {
		owner.release();
		await pane?.close();
		await canvas?.dispose();
		owner.dispose();
	}
});

test("a provisional duplicate socket cannot retire the live pane authority", async () => {
	const owner = createDelayedCheckoutOwner("provisional-duplicate");
	let canvas: Awaited<ReturnType<typeof startOwnedCanvas>> | undefined;
	let original: WebSocket | undefined;
	let replacement: WebSocket | undefined;
	try {
		canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		const request = createJsonRequester(canvas);
		const clientId = "provisional-duplicate-pane";
		const originalMessages: Array<Record<string, unknown>> = [];
		original = new WebSocket(`${canvas.base.replace(/^http/u, "ws")}?clientId=${clientId}`);
		original.on("message", (raw) =>
			originalMessages.push(JSON.parse(raw.toString()) as Record<string, unknown>),
		);
		await new Promise<void>((resolve, reject) => {
			original!.once("open", resolve);
			original!.once("error", reject);
		});
		await waitForMessage(originalMessages, "initial_elements");
		await request("/api/panes", {
			method: "POST",
			body: {
				clientId,
				paneId: clientId,
				primary: true,
				focused: true,
				elementCount: 0,
				board: "scratch",
				rect: { x: 0, y: 0, width: 1280, height: 800 },
				viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
			},
		});
		await request("/api/elements/changes?board=scratch", {
			method: "POST",
			body: {
				origin: "human",
				clientId,
				upserts: [boundElement("bound")],
				deletes: [],
			},
		});
		await request("/api/selection", {
			method: "POST",
			body: { clientId, elementIds: ["bound"] },
		});
		const held = await request<{ created: boolean }>("/api/boards/hold?board=scratch", {
			method: "POST",
			body: { clientId, reason: "editing on the canvas" },
		});
		expect(held.body.created).toBeTrue();
		owner.enable();
		replacement = new WebSocket(`${canvas.base.replace(/^http/u, "ws")}?clientId=${clientId}`);
		await new Promise<void>((resolve, reject) => {
			replacement!.once("open", resolve);
			replacement!.once("error", reject);
		});
		await waitForRecordedPid(owner.pids);
		const replacementClosed = new Promise<void>((resolve) =>
			replacement!.once("close", () => resolve()),
		);
		replacement.terminate();
		await replacementClosed;
		owner.release();
		expect((await request<{ paneCount: number }>("/api/panes")).body.paneCount).toBe(1);
		expect((await request<{ clientId: string }>("/api/selection")).body.clientId).toBe(clientId);
		expect(
			(
				await request<{ created: boolean }>("/api/boards/hold?board=scratch", {
					method: "POST",
					body: { clientId },
				})
			).body.created,
		).toBeFalse();
		expect(original.readyState).toBe(WebSocket.OPEN);
	} finally {
		owner.release();
		original?.terminate();
		replacement?.terminate();
		await canvas?.dispose();
		owner.dispose();
	}
});

test("canvas stop terminates a noncooperative provisional WebSocket", async () => {
	const owner = createDelayedCheckoutOwner("raw-provisional");
	let canvas: Awaited<ReturnType<typeof startOwnedCanvas>> | undefined;
	let socket: Socket | undefined;
	try {
		canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		const request = createJsonRequester(canvas);
		await request("/api/elements/changes?board=scratch", {
			method: "POST",
			body: {
				origin: "human",
				clientId: "raw-seed",
				upserts: [boundElement("rawbound")],
				deletes: [],
			},
		});
		owner.enable();
		socket = await openRawWebSocketPeer(canvas.base, "raw-provisional-pane");
		const gitPid = await waitForRecordedPid(owner.pids);
		const closed = new Promise<void>((resolve) => socket!.once("close", () => resolve()));
		await canvas.dispose();
		await closed;
		await expectPidAbsent(gitPid);
		expect(socket.destroyed).toBeTrue();
	} finally {
		owner.release();
		socket?.destroy();
		await canvas?.dispose();
		owner.dispose();
	}
});
