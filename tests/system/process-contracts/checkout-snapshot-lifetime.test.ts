import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { completeElement } from "../code-targets/support/elements.ts";

const SERVER_PATH = fileURLToPath(new URL("../../../src/server.ts", import.meta.url));

async function waitForRecordedPid(file: string): Promise<number> {
	const deadline = Date.now() + 2_000;
	while (!existsSync(file) || readFileSync(file, "utf8").trim().length === 0) {
		if (Date.now() >= deadline) throw new Error("Delayed Git process did not start.");
		await Bun.sleep(5);
	}
	return Number(readFileSync(file, "utf8").trim().split(/\s+/u).at(-1));
}

async function waitForRecordedPids(file: string, count: number): Promise<number[]> {
	const deadline = Date.now() + 2_000;
	for (;;) {
		const pids = existsSync(file)
			? readFileSync(file, "utf8")
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => Number(line.split(/\s+/u)[0]))
			: [];
		if (new Set(pids).size >= count) return [...new Set(pids)];
		if (Date.now() >= deadline) throw new Error(`Expected ${count} delayed Git processes.`);
		await Bun.sleep(5);
	}
}

async function expectPidAbsent(pid: number): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (existsSync(`/proc/${pid}`) && Date.now() < deadline) await Bun.sleep(5);
	expect(existsSync(`/proc/${pid}`), `Git pid ${pid} survived canvas teardown`).toBeFalse();
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

function fixture(name: string, checkoutCount = 1) {
	const root = join(tmpdir(), `archboard-checkout-lifetime-${name}-${crypto.randomUUID()}`);
	const vault = join(root, "vault");
	const checkouts = Array.from({ length: checkoutCount }, (_, index) =>
		join(root, `checkout-${index}`),
	);
	const bin = join(root, "bin");
	const pids = join(root, "git-pids");
	const release = join(root, "release-git");
	const realGit = Bun.which("git");
	if (!realGit) throw new Error("Git is required for checkout lifetime coverage.");
	mkdirSync(vault, { recursive: true });
	for (const checkout of checkouts) mkdirSync(checkout);
	mkdirSync(bin);
	const git = join(bin, "git");
	writeFileSync(
		git,
		`#!/bin/sh
case "$*" in
  *rev-parse*|*remote\\ get-url*)
    echo "$$ $*" >> "${pids}"
    while [ ! -e "${release}" ]; do sleep 1; done
    exec ${JSON.stringify(realGit)} "$@"
    ;;
  *) exec ${JSON.stringify(realGit)} "$@" ;;
esac
`,
	);
	chmodSync(git, 0o700);
	const registry = join(root, "repos.json");
	const entries = JSON.stringify(
		checkouts.map((checkout, index) => ({
			repo: `github.com/acme/delayed-${index}`,
			root: checkout,
			source: "declared",
			addedAt: "2026-09-02T00:00:00.000Z",
		})),
	);
	writeFileSync(registry, "[]");
	return {
		root,
		vault,
		pids,
		release: () => writeFileSync(release, "release\n"),
		env: { ARCHBOARD_REPOS: registry, PATH: `${bin}:${process.env.PATH ?? ""}` },
		enable: () => writeFileSync(registry, entries),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
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
			(initial.elements as Array<{ id: string }>).some((element) => element.id === "concurrent"),
		).toBeTrue();
		await canvas.dispose();
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
	} finally {
		owner.dispose();
	}
});
