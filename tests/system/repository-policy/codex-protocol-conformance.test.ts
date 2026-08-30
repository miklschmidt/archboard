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
import type { CodexProtocolConformanceResult } from "../../../src/runtime/codex-protocol/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const recovery = `Regenerate with ${CODEX_PROTOCOL_GENERATION_COMMAND} using the pinned project-local binary, then review the decoder and generated notification inventory before retrying this root check.`;
const syntheticExecutable = path.join(repoRoot, "node_modules", "@openai", "codex", "synthetic.js");

type ConformanceRunner = (executable: string) => CodexProtocolConformanceResult;
type StatusReader = () => string;

interface RegisteredConformanceDependencies {
	readonly resolveExecutable: () => string;
	readonly run: ConformanceRunner;
	readonly status: StatusReader;
}

interface PackageJson {
	readonly devDependencies?: Record<string, string>;
	readonly scripts?: Record<string, string>;
}

function readPackageJson(): PackageJson {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as PackageJson;
}

function projectCodexExecutable(
	resolveExecutable = () => require.resolve("@openai/codex/bin/codex.js"),
): string {
	const executable = resolveExecutable();
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

const productionDependencies: RegisteredConformanceDependencies = {
	resolveExecutable: projectCodexExecutable,
	run: runCodexProtocolConformance,
	status: checkoutStatus,
};

function runRegisteredConformance(
	overrides: Partial<RegisteredConformanceDependencies> = {},
): CodexProtocolConformanceResult {
	const dependencies = { ...productionDependencies, ...overrides };
	let before: string | undefined;
	let result: CodexProtocolConformanceResult | undefined;
	let primaryFailure: unknown;
	let after: string | undefined;
	let afterFailure: unknown;
	try {
		before = dependencies.status();
		result = dependencies.run(dependencies.resolveExecutable());
	} catch (cause) {
		primaryFailure = cause;
	} finally {
		try {
			after = dependencies.status();
		} catch (cause) {
			afterFailure = cause;
		}
	}

	const diagnostics: string[] = [];
	if (primaryFailure)
		diagnostics.push(
			primaryFailure instanceof Error ? primaryFailure.message : String(primaryFailure),
		);
	if (afterFailure)
		diagnostics.push(
			`could not capture the post-conformance checkout status: ${afterFailure instanceof Error ? afterFailure.message : String(afterFailure)}`,
		);
	if (before !== undefined && after !== undefined && before !== after)
		diagnostics.push(
			`checkout mutation detected during Codex conformance: status before ${JSON.stringify(before)}, status after ${JSON.stringify(after)}`,
		);
	if (diagnostics.length)
		throw new Error(`${diagnostics.join("\n")}\nRecovery: ${recovery}`, {
			cause: primaryFailure ?? afterFailure,
		});
	if (result === undefined)
		throw new Error(`Codex conformance produced no result.\nRecovery: ${recovery}`);
	return result;
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
	});

	test("runs the pinned generator, verifies the manifest, and leaves the checkout unchanged", () => {
		const result = runRegisteredConformance();

		expect(result).toEqual({
			executablePath: expect.stringContaining(
				`${path.sep}node_modules${path.sep}@openai${path.sep}codex${path.sep}`,
			),
			version: CODEX_PROTOCOL_BINARY_VERSION,
			fileCount: CODEX_PROTOCOL_GENERATED_FILE_COUNT,
			sha256: CODEX_PROTOCOL_GENERATED_TREE_SHA256,
		});
	});

	test("rejects a non-pinned executable with regeneration and review recovery", () => {
		let thrown: unknown;
		try {
			runRegisteredConformance({ resolveExecutable: () => process.execPath });
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

	test("reports a missing binary through the same recovery boundary", () => {
		let thrown: unknown;
		try {
			runRegisteredConformance({
				resolveExecutable: () => path.join(repoRoot, "node_modules", "@openai", "codex", "missing"),
			});
		} catch (error) {
			thrown = error;
		}

		expect((thrown as Error).message).toContain("could not run --version");
		expect((thrown as Error).message).toContain("Regenerate with");
		expect((thrown as Error).message).toContain(
			"review the decoder and generated notification inventory",
		);
	});

	test("reports a project-local resolution escape through the same recovery boundary", () => {
		let statusCall = 0;
		let thrown: unknown;
		try {
			runRegisteredConformance({
				resolveExecutable: () => projectCodexExecutable(() => "/tmp/codex"),
				status: () => (statusCall++ === 0 ? "same" : "same"),
			});
		} catch (error) {
			thrown = error;
		}

		expect((thrown as Error).message).toContain("outside this checkout");
		expect((thrown as Error).message).toContain("Regenerate with");
		expect((thrown as Error).message).not.toContain("checkout mutation detected");
		expect(statusCall).toBe(2);
	});

	test("reports a resolver throw through only the unified actionable boundary", () => {
		const resolutionFailure = new Error("resolver unavailable");
		let statusCall = 0;
		let thrown: unknown;
		try {
			runRegisteredConformance({
				resolveExecutable: () => {
					throw resolutionFailure;
				},
				status: () => (statusCall++ === 0 ? "same" : "same"),
			});
		} catch (error) {
			thrown = error;
		}

		expect((thrown as Error).cause).toBe(resolutionFailure);
		expect((thrown as Error).message).toBe(`resolver unavailable\nRecovery: ${recovery}`);
		expect((thrown as Error).message).not.toContain("checkout mutation detected");
		expect((thrown as Error).message).not.toContain(
			"could not capture the post-conformance checkout status",
		);
		expect(statusCall).toBe(2);
	});

	test("reports checkout mutation after a successful conformance", () => {
		let statusCall = 0;
		let thrown: unknown;
		try {
			runRegisteredConformance({
				resolveExecutable: () => syntheticExecutable,
				run: () => ({
					executablePath: syntheticExecutable,
					version: CODEX_PROTOCOL_BINARY_VERSION,
					fileCount: CODEX_PROTOCOL_GENERATED_FILE_COUNT,
					sha256: CODEX_PROTOCOL_GENERATED_TREE_SHA256,
				}),
				status: () => (statusCall++ === 0 ? "before" : "after"),
			});
		} catch (error) {
			thrown = error;
		}

		expect((thrown as Error).message).toContain("checkout mutation detected");
		expect((thrown as Error).message).toContain('status before "before"');
		expect((thrown as Error).message).toContain('status after "after"');
		expect((thrown as Error).message).toContain(
			"review the decoder and generated notification inventory",
		);
		expect(statusCall).toBe(2);
	});

	test("preserves generation failure and checkout mutation evidence together", () => {
		let statusCall = 0;
		const generationFailure = new CodexProtocolConformanceError({
			executablePath: syntheticExecutable,
			phase: "generation",
			message: "could not generate the experimental tree",
		});
		let thrown: unknown;
		try {
			runRegisteredConformance({
				resolveExecutable: () => syntheticExecutable,
				run: () => {
					throw generationFailure;
				},
				status: () => (statusCall++ === 0 ? "before" : "after"),
			});
		} catch (error) {
			thrown = error;
		}

		expect((thrown as Error).cause).toBe(generationFailure);
		expect((thrown as Error).message).toContain("could not generate the experimental tree");
		expect((thrown as Error).message).toContain("checkout mutation detected");
		expect((thrown as Error).message).toContain("Regenerate with");
		expect(statusCall).toBe(2);
	});
});
