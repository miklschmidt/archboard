import fs from "node:fs";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { CODEX_APP_SERVER_ARGUMENTS } from "../process.js";
import type { CodexProcess, CodexProcessSnapshot, CodexProcessState } from "../process.js";
import type { CodexProcessTestOptions } from "../testing.js";

export function temporaryRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "archboard-codex-process-test-"));
}

export function removeRoot(root: string): void {
	fs.rmSync(root, { recursive: true, force: true });
}

export function fixture(root: string, body: string, version = "codex-cli 0.151.0"): string {
	const executable = path.join(root, "codex-fixture");
	writeFileSync(
		executable,
		`#!${process.execPath}\nif (process.argv[2] === "--version") { console.log(${JSON.stringify(version)}); process.exit(0); }\nif (JSON.stringify(process.argv.slice(2)) !== ${JSON.stringify(JSON.stringify([...CODEX_APP_SERVER_ARGUMENTS]))}) { console.error("argv rejected"); process.exit(9); }\n${body}\n`,
		{ mode: 0o700 },
	);
	chmodSync(executable, 0o700);
	return executable;
}

export function processOptions(root: string, executablePath: string): CodexProcessTestOptions {
	return {
		executablePath,
		checkoutRoot: process.cwd(),
		storage: { rootDirectory: path.join(root, "storage") },
		ambientEnvironment: {
			HOME: "/poisoned/home",
			PATH: process.env["PATH"] ?? "",
			CODEX_HOME: "/poisoned/codex-home",
			OPENAI_API_KEY: "poisoned-secret",
			PWD: "/poisoned/pwd",
		},
	};
}

export function waitForState(
	owner: CodexProcess,
	predicate: (state: CodexProcessState) => boolean,
): Promise<CodexProcessSnapshot> {
	const current = owner.snapshot();
	if (predicate(current.state)) {
		return Promise.resolve(current);
	}
	return new Promise((resolve) => {
		const unsubscribe = owner.subscribe((snapshot) => {
			if (!predicate(snapshot.state)) {
				return;
			}
			unsubscribe();
			resolve(snapshot);
		});
	});
}

export function startReady(owner: CodexProcess): Promise<CodexProcessSnapshot> {
	owner.onChild((child) => child.lifecycle.markAppServerReady());
	return owner.start();
}
