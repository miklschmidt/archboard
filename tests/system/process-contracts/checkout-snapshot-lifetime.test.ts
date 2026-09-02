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

async function expectPidAbsent(pid: number): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (existsSync(`/proc/${pid}`) && Date.now() < deadline) await Bun.sleep(5);
	expect(existsSync(`/proc/${pid}`), `Git pid ${pid} survived canvas teardown`).toBeFalse();
}

function fixture(name: string) {
	const root = join(tmpdir(), `archboard-checkout-lifetime-${name}-${crypto.randomUUID()}`);
	const vault = join(root, "vault");
	const checkout = join(root, "checkout");
	const bin = join(root, "bin");
	const pids = join(root, "git-pids");
	const realGit = Bun.which("git");
	if (!realGit) throw new Error("Git is required for checkout lifetime coverage.");
	mkdirSync(vault, { recursive: true });
	mkdirSync(checkout);
	mkdirSync(bin);
	const git = join(bin, "git");
	writeFileSync(
		git,
		`#!/bin/sh
case "$*" in
  *rev-parse*|*remote\\ get-url*) echo "$$ $*" >> "${pids}"; sleep 60 ;;
  *) exec ${JSON.stringify(realGit)} "$@" ;;
esac
`,
	);
	chmodSync(git, 0o700);
	const registry = join(root, "repos.json");
	const entries = JSON.stringify([
		{
			repo: "github.com/acme/delayed",
			root: checkout,
			source: "declared",
			addedAt: "2026-09-02T00:00:00.000Z",
		},
	]);
	writeFileSync(registry, "[]");
	return {
		root,
		vault,
		pids,
		env: { ARCHBOARD_REPOS: registry, PATH: `${bin}:${process.env.PATH ?? ""}` },
		enable: () => writeFileSync(registry, entries),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
}

test("canvas teardown cancels and reaps delayed GET checkout work", async () => {
	const owner = fixture("get");
	try {
		const canvas = await startOwnedCanvas({
			serverPath: SERVER_PATH,
			vault: owner.vault,
			env: owner.env,
		});
		owner.enable();
		const request = fetch(`${canvas.base}/api/boards`);
		const pid = await waitForRecordedPid(owner.pids);
		await canvas.dispose();
		await request.catch(() => undefined);
		await expectPidAbsent(pid);
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
