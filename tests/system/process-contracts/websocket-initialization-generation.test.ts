import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

import { completeElement } from "../code-targets/support/elements.ts";
import { humanWriteQuery } from "../support/note-version.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { waitFor } from "../canvas-state/support/http.ts";
import {
	createDelayedCheckoutOwner,
	expectRecordedPidsAbsent,
	waitForRecordedPids,
} from "./support/delayed-checkout-owner.ts";

const SERVER_PATH = fileURLToPath(new URL("../../../src/server.ts", import.meta.url));

function boundElement() {
	return completeElement({
		id: "generation-bound",
		type: "rectangle",
		x: 20,
		y: 20,
		width: 100,
		height: 50,
		customData: {
			archboard: {
				binding: { repo: "github.com/acme/delayed-0", path: "src/original.ts" },
			},
		},
	});
}

async function openSocket(
	base: string,
	clientId: string,
	messages: Array<Record<string, unknown>>,
): Promise<WebSocket> {
	const socket = new WebSocket(`${base.replace(/^http/u, "ws")}?clientId=${clientId}`);
	socket.on("message", (raw) =>
		messages.push(JSON.parse(raw.toString()) as Record<string, unknown>),
	);
	await new Promise<void>((resolve, reject) => {
		socket.once("open", resolve);
		socket.once("error", reject);
	});
	return socket;
}

async function waitForInitial(messages: Array<Record<string, unknown>>): Promise<void> {
	await waitFor(
		() => (messages.some((message) => message["type"] === "initial_elements") ? true : undefined),
		"WebSocket initial scene",
	);
}

test("the newest accepted duplicate remains authoritative after reverse initialization", async () => {
	const owner = createDelayedCheckoutOwner("socket-generation");
	let canvas: Awaited<ReturnType<typeof startOwnedCanvas>> | undefined;
	let original: WebSocket | undefined;
	let older: WebSocket | undefined;
	let newer: WebSocket | undefined;
	try {
		canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		const request = createJsonRequester(canvas);
		const clientId = "reverse-initialization-pane";
		const originalMessages: Array<Record<string, unknown>> = [];
		original = await openSocket(canvas.base, clientId, originalMessages);
		await waitForInitial(originalMessages);
		await request(`/api/elements/changes${await humanWriteQuery(request, "scratch")}`, {
			method: "POST",
			body: {
				origin: "human",
				clientId,
				upserts: [boundElement()],
				deletes: [],
			},
		});
		owner.enable();

		const olderMessages: Array<Record<string, unknown>> = [];
		older = await openSocket(canvas.base, clientId, olderMessages);
		const [olderRoot] = await waitForRecordedPids(owner.pids, 1);
		const newerMessages: Array<Record<string, unknown>> = [];
		newer = await openSocket(canvas.base, clientId, newerMessages);
		const roots = await waitForRecordedPids(owner.pids, 2);
		const newerRoot = roots.find((pid) => pid !== olderRoot);
		if (olderRoot === undefined || newerRoot === undefined) {
			throw new Error("Duplicate initializers did not start independently.");
		}

		const originalClosed = new Promise<void>((resolve) => original!.once("close", () => resolve()));
		owner.releasePid(newerRoot);
		const afterNewerRoot = await waitForRecordedPids(owner.pids, 3);
		const newerRemote = afterNewerRoot.find((pid) => !roots.includes(pid));
		if (newerRemote === undefined) {
			throw new Error("The newer remote probe did not start.");
		}
		owner.releasePid(newerRemote);
		await waitForInitial(newerMessages);
		await originalClosed;

		owner.releasePid(olderRoot);
		const afterOlderRoot = await waitForRecordedPids(owner.pids, 4);
		const olderRemote = afterOlderRoot.find((pid) => !afterNewerRoot.includes(pid));
		if (olderRemote === undefined) {
			throw new Error("The older remote probe did not start.");
		}
		owner.releasePid(olderRemote);
		await waitFor(
			() => (older?.readyState === WebSocket.CLOSED ? true : undefined),
			"the stale older initializer to close",
		);
		expect(newer.readyState).toBe(WebSocket.OPEN);
		expect(olderMessages.some((message) => message["type"] === "initial_elements")).toBeTrue();
	} finally {
		owner.release();
		original?.terminate();
		older?.terminate();
		newer?.terminate();
		await canvas?.dispose();
		await expectRecordedPidsAbsent(owner.pids);
		owner.dispose();
	}
}, 20_000);
