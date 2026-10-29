import { expect } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionUserInput } from "@archboard/codex-app-server/session";
import {
	productionRecords,
	openApplicationSocket,
	productionPane,
	type ProductionFixture,
} from "./codex-production.ts";
import { startOwnedServer } from "../../support/owned-server.ts";
import { productionServer } from "./production-server.ts";

async function startExplanationServer(
	resources: AsyncDisposableStack,
	fixture: ProductionFixture,
	prefix: string,
) {
	const server = await startOwnedServer({
		...productionServer,
		vault: fixture.vault,
		env: {
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			XDG_STATE_HOME: join(fixture.root, "state"),
		},
	});
	resources.defer(() => server.dispose());
	const tabSessionId = `${prefix}-tab`;
	const socket = await openApplicationSocket(server.base, `${prefix}-client`, {
		vault: fixture.vault,
		tabSession: tabSessionId,
	});
	resources.defer(() => socket.close());
	await fetch(`${server.base}/api/panes?vault=${encodeURIComponent(fixture.vault)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(productionPane(`${prefix}-client`, `${prefix}-pane`, true, true)),
	});
	const invoke = async (path = "", body: object = {}) =>
		(
			await fetch(`${server.base}/api/architecture/explanations${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ vault: fixture.vault, tabSessionId, ...body }),
			})
		).json();
	const read = async (actionId = "capture-1") =>
		(
			await fetch(
				`${server.base}/api/architecture/explanations/${encodeURIComponent(actionId)}?${new URLSearchParams({ vault: fixture.vault, tabSessionId })}`,
			)
		).json();
	const latestAction = async () =>
		(
			await fetch(
				`${server.base}/api/architecture/explanations?${new URLSearchParams({ vault: fixture.vault, tabSessionId })}`,
			)
		).json();
	return { server, socket, invoke, read, latestAction };
}

function seedGit(root: string): void {
	const commands = [
		["git", "init", "--quiet", root],
		["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", join(root, ".git/explanation-key")],
		...[
			["config", "gpg.format", "ssh"],
			["config", "user.signingkey", join(root, ".git/explanation-key")],
			["config", "commit.gpgsign", "true"],
			["config", "user.name", "Explanation Author"],
			["config", "user.email", "explanation@example.test"],
			["add", ".archboard"],
			["commit", "--quiet", "-m", "test: seed explanation"],
		].map((args) => ["git", "-C", root].concat(args)),
	];
	for (const command of commands) {
		const result = Bun.spawnSync(command);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
}

function deliveredCapture(log: string): string {
	const frame = productionRecords(log).findLast(
		(record) => record.kind === "frame" && record.method === "thread/queue/add",
	);
	const input = frame?.params?.["input"] as SessionUserInput[];
	const item = input[0];
	if (item?.type !== "text") throw new Error("The queue did not receive text input.");
	const prompt = item.text;
	expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(16_384);
	return JSON.parse(prompt.split("\n").at(-1)!)["captureFile"];
}

function changeDescription(file: string, description: string): void {
	const module = JSON.parse(readFileSync(file, "utf8"));
	writeFileSync(file, JSON.stringify({ ...module, description }));
}

export { seedGit, deliveredCapture, changeDescription, startExplanationServer };
