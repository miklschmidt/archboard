import { expect } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionUserInput } from "@archboard/codex-app-server/session";
import { productionRecords } from "./codex-production.ts";

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

export { seedGit, deliveredCapture, changeDescription };
