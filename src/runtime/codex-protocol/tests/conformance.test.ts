import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	CodexProtocolConformanceError,
	digestGeneratedTree,
	runCodexProtocolConformance,
} from "../index.js";
import { runCodexProtocolConformanceForTest } from "../conformance.js";
import { deriveGeneratedProtocolMethodInventories } from "../generated-method-inventory.js";
import { deriveGeneratedNotificationUnionPaths } from "../generated-notification-inventory.js";

function temporaryGenerationDirectories(): string[] {
	return readdirSync(tmpdir())
		.filter((entry) => entry.startsWith("archboard-codex-generated-"))
		.toSorted();
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function fakeCodexExecutable(root: string, action: string): string {
	const executablePath = join(root, "fake-codex");
	const script = [
		"#!/bin/sh",
		"set -eu",
		'if [ "${1-}" = "--version" ]; then',
		`printf '%s\\n' '${CODEX_PROTOCOL_BINARY_VERSION}'`,
		"exit 0",
		"fi",
		'if [ "${1-}" = "app-server" ]; then',
		action,
		"fi",
		"exit 64",
	].join("\n");
	writeFileSync(executablePath, script);
	chmodSync(executablePath, 0o755);
	return executablePath;
}

function copyGeneratedFixtureAction(fixtureRoot: string): string {
	return [
		'out=""',
		'while [ "$#" -gt 0 ]; do',
		'if [ "$1" = "--out" ]; then out="$2"; fi',
		"shift",
		"done",
		'mkdir -p "$out"',
		`cp -R ${shellQuote(fixtureRoot)}/. "$out"/`,
		"exit 0",
	].join("\n");
}

type MethodDirection = "response" | "clientNotification" | "serverRequest" | "serverNotification";

const methodFixtureFiles = {
	response: "ClientRequest.ts",
	clientNotification: "ClientNotification.ts",
	serverRequest: "ServerRequest.ts",
	serverNotification: "ServerNotification.ts",
} as const;

const methodFixtureNames = {
	response: "fixture/response",
	clientNotification: "fixture/client",
	serverRequest: "fixture/request",
	serverNotification: "fixture/notification",
} as const;

const methodFixtureTypeNames = {
	response: "ClientRequest",
	clientNotification: "ClientNotification",
	serverRequest: "ServerRequest",
	serverNotification: "ServerNotification",
} as const;

function writeMethodFixtures(fixtureRoot: string, missingDirection?: MethodDirection): void {
	for (const direction of Object.keys(methodFixtureFiles) as MethodDirection[]) {
		const method =
			direction === missingDirection
				? `${methodFixtureNames[direction]}/other`
				: methodFixtureNames[direction];
		const params = direction === "clientNotification" ? "" : ', "params": FixtureParams';
		writeFileSync(
			join(fixtureRoot, methodFixtureFiles[direction]),
			`export type ${methodFixtureTypeNames[direction]} = { "method": "${method}"${params} };\n`,
		);
	}
}

function writeNotificationUnionFixture(fixtureRoot: string): void {
	writeFileSync(
		join(fixtureRoot, "ServerNotification.ts"),
		'export type ServerNotification = { "method": "fixture", "params": { item: { "type": "first" } | { "type": "second" } } };\n',
	);
}

function expectTemporaryGenerationDirectoriesToBe(before: readonly string[]): void {
	expect(temporaryGenerationDirectories()).toEqual([...before]);
}

describe("portable Codex protocol conformance", () => {
	test("digests the same TypeScript tree independent of creation order", () => {
		const firstRoot = mkdtempSync(join(tmpdir(), "archboard-digest-first-"));
		const secondRoot = mkdtempSync(join(tmpdir(), "archboard-digest-second-"));
		try {
			for (const root of [firstRoot, secondRoot]) mkdirSync(join(root, "nested"));
			writeFileSync(join(firstRoot, "a.ts"), "export const a = 1;\n");
			writeFileSync(join(firstRoot, "nested", "b.ts"), "export const b = 2;\n");
			writeFileSync(join(firstRoot, "ignored.txt"), "not part of the digest\n");
			writeFileSync(join(secondRoot, "nested", "b.ts"), "export const b = 2;\n");
			writeFileSync(join(secondRoot, "a.ts"), "export const a = 1;\n");

			const expected = {
				fileCount: 2,
				sha256: "ffed8b1a09fdaa99df806f3f5e3faea1b43042a4d46ebdd93f62c6339633b006",
			};
			expect(digestGeneratedTree(firstRoot)).toEqual(expected);
			expect(digestGeneratedTree(secondRoot)).toEqual(expected);
		} finally {
			rmSync(firstRoot, { recursive: true, force: true });
			rmSync(secondRoot, { recursive: true, force: true });
		}
	});

	test("requires an explicit absolute executable path without PATH lookup", () => {
		let thrown: unknown;
		try {
			runCodexProtocolConformance("codex");
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
		expect(thrown).toMatchObject({ phase: "path", executablePath: "codex" });
		expect((thrown as Error).message).toContain("PATH lookup is intentionally disabled");
	});

	test("reports a missing explicit executable as an actionable version failure", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-missing-codex-"));
		const executablePath = join(root, "codex");
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformance(executablePath);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "version", executablePath });
			expect((thrown as Error).message).toContain("could not run --version");
			expect((thrown as Error).message).toContain(CODEX_PROTOCOL_BINARY_VERSION);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects an explicit executable with the wrong Codex version", () => {
		let thrown: unknown;
		try {
			runCodexProtocolConformance(process.execPath);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
		expect(thrown).toMatchObject({ phase: "version", executablePath: process.execPath });
		expect((thrown as Error).message).toContain(`expected ${CODEX_PROTOCOL_BINARY_VERSION}`);
	});

	test("reports generator command failures as generation failures and cleans up", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-generator-failure-"));
		const executablePath = fakeCodexExecutable(root, "exit 23");
		const before = temporaryGenerationDirectories();
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformance(executablePath);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "generation", executablePath });
			expect((thrown as Error).message).toContain("could not generate the experimental tree");
			expect((thrown as Error).message).toContain(CODEX_PROTOCOL_BINARY_VERSION);
			expectTemporaryGenerationDirectoriesToBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports generated file-count mismatches with digest details and cleans up", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-generator-count-"));
		const fixtureRoot = join(root, "fixture");
		mkdirSync(fixtureRoot);
		writeFileSync(join(fixtureRoot, "only.ts"), "export type Only = string;\n");
		const executablePath = fakeCodexExecutable(root, copyGeneratedFixtureAction(fixtureRoot));
		const received = digestGeneratedTree(fixtureRoot);
		const before = temporaryGenerationDirectories();
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformance(executablePath);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "digest", executablePath });
			expect((thrown as Error).message).toContain(
				`expected ${CODEX_PROTOCOL_GENERATED_FILE_COUNT} files and ${CODEX_PROTOCOL_GENERATED_TREE_SHA256}`,
			);
			expect((thrown as Error).message).toContain(
				`received ${received.fileCount} files and ${received.sha256}`,
			);
			expectTemporaryGenerationDirectoriesToBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports same-count byte mismatches with the received digest and cleans up", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-generator-bytes-"));
		const fixtureRoot = join(root, "fixture");
		mkdirSync(fixtureRoot);
		for (let index = 0; index < CODEX_PROTOCOL_GENERATED_FILE_COUNT; index += 1)
			writeFileSync(
				join(fixtureRoot, `fixture-${index}.ts`),
				`export type Fixture${index} = string;\n`,
			);
		const executablePath = fakeCodexExecutable(root, copyGeneratedFixtureAction(fixtureRoot));
		const received = digestGeneratedTree(fixtureRoot);
		expect(received.fileCount).toBe(CODEX_PROTOCOL_GENERATED_FILE_COUNT);
		const before = temporaryGenerationDirectories();
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformance(executablePath);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "digest", executablePath });
			expect((thrown as Error).message).toContain(
				`received ${CODEX_PROTOCOL_GENERATED_FILE_COUNT} files and ${received.sha256}`,
			);
			expectTemporaryGenerationDirectoriesToBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("accepts a generated fixture through the narrow test-only manifest helper", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-generator-success-"));
		const fixtureRoot = join(root, "fixture");
		mkdirSync(fixtureRoot);
		writeMethodFixtures(fixtureRoot);
		writeNotificationUnionFixture(fixtureRoot);
		writeFileSync(
			join(fixtureRoot, "FixtureParams.ts"),
			'export type FixtureParams = { item: FixtureItem };\nexport type FixtureItem = { "type": "first" } | { "type": "second" };\n',
		);
		const digest = digestGeneratedTree(fixtureRoot);
		const notificationUnionPaths = deriveGeneratedNotificationUnionPaths(fixtureRoot);
		const methodInventories = deriveGeneratedProtocolMethodInventories(fixtureRoot);
		const executablePath = fakeCodexExecutable(root, copyGeneratedFixtureAction(fixtureRoot));
		const before = temporaryGenerationDirectories();
		try {
			const result = runCodexProtocolConformanceForTest(executablePath, {
				binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
				generatedFileCount: digest.fileCount,
				generatedTreeSha256: digest.sha256,
				notificationUnionPaths,
				methodInventories,
			});
			expect(result).toEqual({
				executablePath,
				version: CODEX_PROTOCOL_BINARY_VERSION,
				fileCount: digest.fileCount,
				sha256: digest.sha256,
			});
			expectTemporaryGenerationDirectoriesToBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports generated notification inventory mismatches and cleans up", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-generator-inventory-"));
		const fixtureRoot = join(root, "fixture");
		mkdirSync(fixtureRoot);
		writeMethodFixtures(fixtureRoot);
		writeNotificationUnionFixture(fixtureRoot);
		writeFileSync(
			join(fixtureRoot, "FixtureParams.ts"),
			"export type FixtureParams = { item: string };\n",
		);
		const digest = digestGeneratedTree(fixtureRoot);
		const executablePath = fakeCodexExecutable(root, copyGeneratedFixtureAction(fixtureRoot));
		const before = temporaryGenerationDirectories();
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformanceForTest(executablePath, {
					binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
					generatedFileCount: digest.fileCount,
					generatedTreeSha256: digest.sha256,
					notificationUnionPaths: [{ method: "fixture", path: "item.future" }],
				});
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "inventory", executablePath });
			expect((thrown as Error).message).toContain(
				"generated notification-union inventory mismatch",
			);
			expect((thrown as Error).message).toContain("expected 1 paths, received 1");
			expectTemporaryGenerationDirectoriesToBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test.each(Object.keys(methodFixtureFiles) as MethodDirection[])(
		"reports a missing generated %s method as an actionable decoder gap",
		(direction) => {
			const root = mkdtempSync(join(tmpdir(), `archboard-generator-method-${direction}-`));
			const fixtureRoot = join(root, "fixture");
			mkdirSync(fixtureRoot);
			writeMethodFixtures(fixtureRoot, direction);
			const digest = digestGeneratedTree(fixtureRoot);
			const executablePath = fakeCodexExecutable(root, copyGeneratedFixtureAction(fixtureRoot));
			const methodInventories = {
				response: [methodFixtureNames.response],
				clientNotification: [methodFixtureNames.clientNotification],
				serverRequest: [methodFixtureNames.serverRequest],
				serverNotification: [methodFixtureNames.serverNotification],
			};
			try {
				let thrown: unknown;
				try {
					runCodexProtocolConformanceForTest(executablePath, {
						binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
						generatedFileCount: digest.fileCount,
						generatedTreeSha256: digest.sha256,
						notificationUnionPaths: [],
						methodInventories,
					});
				} catch (error) {
					thrown = error;
				}
				expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
				expect(thrown).toMatchObject({ phase: "inventory", executablePath });
				expect((thrown as Error).message).toContain("decoder gap");
				expect((thrown as Error).message).toContain(methodFixtureNames[direction]);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test.each(Object.keys(methodFixtureFiles) as MethodDirection[])(
		"reports a missing authored %s decoder method as an actionable decoder gap",
		(direction) => {
			const root = mkdtempSync(join(tmpdir(), `archboard-decoder-method-${direction}-`));
			const executablePath = fakeCodexExecutable(root, "exit 23");
			const methodInventories = {
				response: [methodFixtureNames.response],
				clientNotification: [methodFixtureNames.clientNotification],
				serverRequest: [methodFixtureNames.serverRequest],
				serverNotification: [methodFixtureNames.serverNotification],
			};
			const decoderMethodInventories = {
				...methodInventories,
				[direction]: [],
			};
			try {
				let thrown: unknown;
				try {
					runCodexProtocolConformanceForTest(executablePath, {
						binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
						generatedFileCount: 0,
						generatedTreeSha256: "",
						notificationUnionPaths: [],
						methodInventories,
						decoderMethodInventories,
					});
				} catch (error) {
					thrown = error;
				}
				expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
				expect(thrown).toMatchObject({ phase: "inventory", executablePath });
				expect((thrown as Error).message).toContain("authored decoder registry mismatch");
				expect((thrown as Error).message).toContain(methodFixtureNames[direction]);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	test("keeps the manifest expectations explicit for manual conformance", () => {
		expect(CODEX_PROTOCOL_GENERATED_FILE_COUNT).toBe(820);
		expect(CODEX_PROTOCOL_GENERATED_TREE_SHA256).toBe(
			"cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273",
		);
	});
});
