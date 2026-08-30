import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import {
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	CODEX_PROTOCOL_GENERATION_COMMAND,
	CODEX_PROTOCOL_VERSION,
	CodexProtocolConformanceError,
	runCodexProtocolConformance,
} from "../../../src/runtime/codex-protocol/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const recovery = `Regenerate with ${CODEX_PROTOCOL_GENERATION_COMMAND} using the pinned project-local binary, then review the decoder and generated notification inventory before retrying this root check.`;

interface PackageJson {
	readonly devDependencies?: Record<string, string>;
	readonly scripts?: Record<string, string>;
}

function readPackageJson(): PackageJson {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as PackageJson;
}

function projectCodexExecutable(): string {
	const executable = require.resolve("@openai/codex/bin/codex.js");
	const localNodeModules = `${path.join(repoRoot, "node_modules")}${path.sep}`;
	if (!executable.startsWith(localNodeModules))
		throw new Error(`Resolved Codex executable is outside this checkout: ${executable}`);
	return executable;
}

function checkoutStatus(): string {
	return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

function runRegisteredConformance(executable: string) {
	try {
		return runCodexProtocolConformance(executable);
	} catch (cause) {
		const detail = cause instanceof Error ? cause.message : String(cause);
		throw new Error(`${detail}\nRecovery: ${recovery}`, { cause });
	}
}

describe("Codex protocol root-check owner", () => {
	test("pins one project-local Codex generator and keeps the existing repository lane", () => {
		const packageJson = readPackageJson();
		const lock = fs.readFileSync(path.join(repoRoot, "bun.lock"), "utf8");

		expect(packageJson.devDependencies?.["@openai/codex"]).toBe("0.151.0");
		expect(lock).toMatch(/"devDependencies": \{\s*"@openai\/codex": "0\.151\.0",/);
		expect(lock).toMatch(/"@openai\/codex": \["@openai\/codex@0\.151\.0",/);
		expect(packageJson.scripts?.["test:repository"]).toBe(
			"bun test --isolate tests/system/repository-policy",
		);
		expect(CODEX_PROTOCOL_GENERATION_COMMAND).toBe(
			"codex app-server generate-ts --experimental --out <temporary-directory>",
		);
		expect(projectCodexExecutable()).toContain(
			`${path.sep}node_modules${path.sep}@openai${path.sep}codex${path.sep}`,
		);
	});

	test("runs the pinned generator, verifies the manifest, and leaves the checkout unchanged", () => {
		const before = checkoutStatus();
		const result = runRegisteredConformance(projectCodexExecutable());

		expect(result).toEqual({
			executablePath: projectCodexExecutable(),
			version: CODEX_PROTOCOL_BINARY_VERSION,
			fileCount: CODEX_PROTOCOL_GENERATED_FILE_COUNT,
			sha256: CODEX_PROTOCOL_GENERATED_TREE_SHA256,
		});
		expect(checkoutStatus()).toBe(before);
	});

	test("rejects a non-pinned executable with regeneration and review recovery", () => {
		let thrown: unknown;
		try {
			runRegisteredConformance(process.execPath);
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).cause).toBeInstanceOf(CodexProtocolConformanceError);
		expect((thrown as Error).message).toContain(`expected ${CODEX_PROTOCOL_BINARY_VERSION}`);
		expect((thrown as Error).message).toContain("Regenerate with");
		expect((thrown as Error).message).toContain(
			"review the decoder and generated notification inventory",
		);
		expect((thrown as Error).message).toContain(CODEX_PROTOCOL_VERSION);
	});
});
