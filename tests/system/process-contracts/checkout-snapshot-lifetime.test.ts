import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { completeElement } from "../code-targets/support/elements.ts";
import {
	createDelayedCheckoutOwner as fixture,
	expectPidAbsent,
	expectRecordedPidsAbsent,
	waitForRecordedPid,
	waitForRecordedPids,
} from "./support/delayed-checkout-owner.ts";

const SERVER_PATH = fileURLToPath(new URL("../../../src/server.ts", import.meta.url));

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

test("canvas teardown cancels and reaps delayed GET checkout work", async () => {
	const owner = fixture("get", 2);
	try {
		const canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		owner.enable();
		const request = fetch(`${canvas.base}/api/boards`);
		const pids = await waitForRecordedPids(owner.pids, 2);
		await canvas.dispose();
		await request.catch(() => undefined);
		for (const pid of pids) await expectPidAbsent(pid);
		await expectRecordedPidsAbsent(owner.pids);
	} finally {
		owner.dispose();
	}
});

test("opener settings checkout work is canceled by disconnect and awaited by canvas stop", async () => {
	const owner = fixture("opener-settings");
	try {
		const canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		owner.enable();
		const browserHeaders = {
			Host: new URL(canvas.base).host,
			Origin: canvas.base,
			"Sec-Fetch-Site": "same-origin",
		};
		const controller = new AbortController();
		const disconnected = fetch(`${canvas.base}/api/settings/opener`, {
			headers: browserHeaders,
			signal: controller.signal,
		}).catch(() => undefined);
		const [disconnectedPid] = await waitForRecordedPids(owner.pids, 1);
		controller.abort();
		await disconnected;
		await expectPidAbsent(disconnectedPid!);

		const stopping = fetch(`${canvas.base}/api/settings/opener`, {
			headers: browserHeaders,
		}).catch(() => undefined);
		const pids = await waitForRecordedPids(owner.pids, 2);
		await canvas.dispose();
		await stopping;
		for (const pid of pids) await expectPidAbsent(pid);
		await expectRecordedPidsAbsent(owner.pids);
	} finally {
		owner.dispose();
	}
});

test("a WebSocket is owned before delayed checkout presentation and closes with its Git group", async () => {
	const owner = fixture("socket");
	try {
		const canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		owner.enable();
		const socket = new WebSocket(canvas.base.replace(/^http/u, "ws"));
		await new Promise<void>((resolve, reject) => {
			socket.once("open", resolve);
			socket.once("error", reject);
		});
		const pid = await waitForRecordedPid(owner.pids);
		const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
		await canvas.dispose();
		await closed;
		await expectPidAbsent(pid);
		await expectRecordedPidsAbsent(owner.pids);
	} finally {
		owner.dispose();
	}
});

test("a delayed WebSocket receives a fresh initial scene before any concurrent delta", async () => {
	const owner = fixture("socket-ordering");
	let socket: WebSocket | undefined;
	try {
		const canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		owner.enable();
		const messages: Array<Record<string, unknown>> = [];
		socket = new WebSocket(`${canvas.base.replace(/^http/u, "ws")}?clientId=delayed-pane`);
		socket.on("message", (raw) =>
			messages.push(JSON.parse(raw.toString()) as Record<string, unknown>),
		);
		await new Promise<void>((resolve, reject) => {
			socket!.once("open", resolve);
			socket!.once("error", reject);
		});
		await waitForRecordedPid(owner.pids);
		const concurrent = completeElement({
			id: "concurrent",
			type: "rectangle",
			x: 20,
			y: 20,
			width: 100,
			height: 50,
			customData: {
				archboard: {
					binding: { repo: "github.com/acme/delayed-0", path: "src/concurrent.ts" },
				},
			},
		});
		const changed = await fetch(`${canvas.base}/api/elements/changes?board=scratch`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				origin: "human",
				clientId: "writer-pane",
				upserts: [concurrent],
				deletes: [],
			}),
		});
		expect(changed.status).toBe(200);
		expect(messages).toEqual([]);
		owner.release();
		const initial = await waitForMessage(messages, "initial_elements");
		expect(messages[0]?.type).toBe("initial_elements");
		expect(
			(initial.elements as Array<{ id: string; link?: string }>).some(
				(element) =>
					element.id === "concurrent" &&
					element.link === "/api/code-targets/open?board=scratch&element=concurrent",
			),
		).toBeTrue();
		await canvas.dispose();
		await expectRecordedPidsAbsent(owner.pids);
	} finally {
		socket?.close();
		owner.dispose();
	}
});

test("human reports spawn no Git work while agent reports capture fresh authority before the lock", async () => {
	const owner = fixture("origins");
	try {
		const canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		owner.enable();
		const element = completeElement({
			id: "bound",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 100,
			height: 50,
			customData: {
				archboard: { binding: { repo: "github.com/acme/delayed", path: "src/index.ts" } },
			},
		});
		const human = await fetch(`${canvas.base}/api/elements/changes?board=scratch`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				origin: "human",
				clientId: "human-pane",
				upserts: [element],
				deletes: [],
			}),
		});
		expect(human.status).toBe(200);
		expect(
			existsSync(owner.pids),
			existsSync(owner.pids) ? readFileSync(owner.pids, "utf8") : "no Git process",
		).toBeFalse();
		const agent = fetch(
			`${canvas.base}/api/elements/changes?board=scratch&doing=updating%20bound`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ origin: "agent", upserts: [{ id: "bound", x: 1 }], deletes: [] }),
			},
		).catch(() => undefined);
		const pid = await waitForRecordedPid(owner.pids);
		await canvas.dispose();
		await agent;
		await expectPidAbsent(pid);
		await expectRecordedPidsAbsent(owner.pids);
	} finally {
		owner.dispose();
	}
});
