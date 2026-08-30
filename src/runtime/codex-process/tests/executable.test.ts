import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	CodexExecutableError,
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "../index.js";
import { CODEX_PROTOCOL_BINARY_VERSION } from "../../codex-protocol/index.js";

function temporaryRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "archboard-codex-process-executable-"));
}

function fixture(root: string, version: string, name = "codex-fixture"): string {
	const executable = path.join(root, name);
	writeFileSync(executable, `#!${process.execPath}\nconsole.log(${JSON.stringify(version)});\n`, {
		mode: 0o700,
	});
	chmodSync(executable, 0o700);
	return executable;
}

describe("Codex executable ownership", () => {
	test("resolves and verifies the project-local pinned executable", () => {
		const executable = resolveProjectCodexExecutable();
		expect(executable).toContain(
			`${path.sep}node_modules${path.sep}@openai${path.sep}codex${path.sep}`,
		);
		expect(verifyCodexExecutable(executable)).toEqual({
			executablePath: executable,
			version: CODEX_PROTOCOL_BINARY_VERSION,
		});
	});

	test("refuses relative, missing, non-file, non-executable, and wrong-version paths", () => {
		const root = temporaryRoot();
		try {
			const wrongVersion = fixture(root, "codex-cli 0.150.0", "wrong-version");
			const nonExecutable = fixture(root, CODEX_PROTOCOL_BINARY_VERSION, "non-executable");
			chmodSync(nonExecutable, 0o600);
			const directory = path.join(root, "directory");
			fs.mkdirSync(directory, { mode: 0o700 });

			const cases = [
				["relative", "codex", "not_absolute"],
				["missing", path.join(root, "missing"), "missing"],
				["directory", directory, "not_file"],
				["non-executable", nonExecutable, "not_executable"],
				["wrong-version", wrongVersion, "wrong_version"],
			] as const;
			for (const [label, executable, code] of cases) {
				let failure: unknown;
				try {
					verifyCodexExecutable(executable);
				} catch (cause) {
					failure = cause;
				}
				expect(failure, label).toBeInstanceOf(CodexExecutableError);
				expect((failure as CodexExecutableError).code, label).toBe(code);
			}
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
