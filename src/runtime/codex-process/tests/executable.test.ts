import { describe, expect, test } from "bun:test";
import { type execFileSync } from "node:child_process";
import fs from "node:fs";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	CODEX_EXECUTABLE_PROOF_MAX_BYTES,
	CodexExecutableError,
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "../executable.js";
import { CODEX_PROTOCOL_BINARY_VERSION } from "../../codex-protocol/index.js";
import { CODEX_REQUEST_SETTLEMENT_MS } from "../../../shared/timing/timing.js";

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

function environmentFixture(root: string, marker: string): string {
	const executable = path.join(root, "environment-fixture");
	writeFileSync(
		executable,
		`#!${process.execPath}\nif (process.argv[2] === "--version") { require("node:fs").writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ openai: process.env.OPENAI_API_KEY, aws: process.env.AWS_SECRET_ACCESS_KEY, path: process.env.PATH, home: process.env.HOME })); console.log(${JSON.stringify(CODEX_PROTOCOL_BINARY_VERSION)}); }\n`,
		{ mode: 0o700 },
	);
	chmodSync(executable, 0o700);
	return executable;
}

function oversizedFixture(root: string): string {
	const executable = path.join(root, "oversized-fixture");
	writeFileSync(
		executable,
		`#!${process.execPath}\nif (process.argv[2] === "--version") process.stdout.write("x".repeat(${CODEX_EXECUTABLE_PROOF_MAX_BYTES + 1}));\n`,
		{ mode: 0o700 },
	);
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

	test("proves a candidate with a minimal explicit environment", () => {
		const root = temporaryRoot();
		try {
			const marker = path.join(root, "environment.json");
			const executable = environmentFixture(root, marker);
			expect(verifyCodexExecutable(executable).version).toBe(CODEX_PROTOCOL_BINARY_VERSION);
			const observed = JSON.parse(readFileSync(marker, "utf8")) as Record<
				string,
				string | undefined
			>;
			expect(observed.openai).toBeUndefined();
			expect(observed.aws).toBeUndefined();
			expect(observed.path).toBe(process.env.PATH);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test("bounds hanging and oversized executable proof attempts", () => {
		const root = temporaryRoot();
		try {
			const executable = fixture(root, CODEX_PROTOCOL_BINARY_VERSION, "bounded-proof");
			let observedOptions: Record<string, unknown> | undefined;
			const hangingCandidate = ((
				_file: string,
				_args: readonly string[],
				options: Record<string, unknown>,
			) => {
				observedOptions = options;
				throw new Error("simulated hanging candidate timeout");
			}) as unknown as typeof execFileSync;
			let timedOut: unknown;
			try {
				verifyCodexExecutable(executable, { execFileSync: hangingCandidate });
			} catch (cause) {
				timedOut = cause;
			}
			expect(timedOut).toBeInstanceOf(CodexExecutableError);
			expect((timedOut as CodexExecutableError).code).toBe("version_unavailable");
			expect(observedOptions?.timeout).toBe(CODEX_REQUEST_SETTLEMENT_MS);
			expect(observedOptions?.maxBuffer).toBe(CODEX_EXECUTABLE_PROOF_MAX_BYTES);
			expect(observedOptions?.env).not.toHaveProperty("OPENAI_API_KEY");

			let oversized: unknown = undefined;
			try {
				verifyCodexExecutable(oversizedFixture(root));
			} catch (cause) {
				oversized = cause;
			}
			expect(oversized).toBeInstanceOf(CodexExecutableError);
			expect((oversized as CodexExecutableError).code).toBe("version_unavailable");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
