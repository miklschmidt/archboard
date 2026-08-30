import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import {
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	CODEX_PROTOCOL_VERSION,
	digestGeneratedTree,
} from "./manifest.js";
import {
	CODEX_PROTOCOL_GENERATED_NOTIFICATION_UNION_PATHS,
	deriveGeneratedNotificationUnionPaths,
	type GeneratedNotificationUnionPath,
} from "./generated-notification-inventory.js";

export type CodexProtocolConformancePhase =
	| "path"
	| "version"
	| "generation"
	| "digest"
	| "inventory";

export interface CodexProtocolConformanceResult {
	readonly executablePath: string;
	readonly version: string;
	readonly fileCount: number;
	readonly sha256: string;
}

export class CodexProtocolConformanceError extends Error {
	readonly executablePath: string;
	readonly phase: CodexProtocolConformancePhase;

	constructor(init: {
		executablePath: string;
		phase: CodexProtocolConformancePhase;
		message: string;
		cause?: unknown;
	}) {
		super(
			`Codex ${CODEX_PROTOCOL_VERSION} generation conformance ${init.phase} failed for ${init.executablePath}: ${init.message}`,
			{ cause: init.cause },
		);
		this.name = "CodexProtocolConformanceError";
		this.executablePath = init.executablePath;
		this.phase = init.phase;
	}
}

function failureDetail(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

function conformanceError(
	executablePath: string,
	phase: CodexProtocolConformancePhase,
	message: string,
	cause?: unknown,
): CodexProtocolConformanceError {
	return new CodexProtocolConformanceError({ executablePath, phase, message, cause });
}

interface CodexProtocolConformanceExpectations {
	readonly binaryVersion: string;
	readonly generatedFileCount: number;
	readonly generatedTreeSha256: string;
	readonly notificationUnionPaths: readonly GeneratedNotificationUnionPath[];
}

const PRODUCTION_EXPECTATIONS: CodexProtocolConformanceExpectations = {
	binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
	generatedFileCount: CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	generatedTreeSha256: CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	notificationUnionPaths: CODEX_PROTOCOL_GENERATED_NOTIFICATION_UNION_PATHS,
};

function notificationPathKey(path: GeneratedNotificationUnionPath): string {
	return `${path.method}:${path.path}`;
}

function duplicateNotificationPaths(paths: readonly GeneratedNotificationUnionPath[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const path of paths) {
		const key = notificationPathKey(path);
		if (seen.has(key)) duplicates.add(key);
		seen.add(key);
	}
	return [...duplicates].toSorted();
}

function notificationInventoryMismatch(
	expected: readonly GeneratedNotificationUnionPath[],
	received: readonly GeneratedNotificationUnionPath[],
): string | null {
	const expectedKeys = expected.map(notificationPathKey);
	const receivedKeys = received.map(notificationPathKey);
	const expectedDuplicates = duplicateNotificationPaths(expected);
	const receivedDuplicates = duplicateNotificationPaths(received);
	const same =
		expectedKeys.length === receivedKeys.length &&
		expectedKeys.every((key, index) => key === receivedKeys[index]);
	if (same && !expectedDuplicates.length && !receivedDuplicates.length) return null;
	const firstDifferentIndex = expectedKeys.findIndex((key, index) => key !== receivedKeys[index]);
	const index =
		firstDifferentIndex === -1
			? Math.min(expectedKeys.length, receivedKeys.length)
			: firstDifferentIndex;
	return [
		`expected ${expectedKeys.length} paths, received ${receivedKeys.length}`,
		`first difference at ${index}: expected ${expectedKeys[index] ?? "<end>"}, received ${receivedKeys[index] ?? "<end>"}`,
		expectedDuplicates.length ? `duplicate expected paths: ${expectedDuplicates.join(", ")}` : "",
		receivedDuplicates.length ? `duplicate received paths: ${receivedDuplicates.join(", ")}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

function runCodexProtocolConformanceWithExpectations(
	executablePath: string,
	expectations: CodexProtocolConformanceExpectations,
): CodexProtocolConformanceResult {
	if (typeof executablePath !== "string" || !isAbsolute(executablePath))
		throw conformanceError(
			executablePath,
			"path",
			"an absolute executable path is required; PATH lookup is intentionally disabled",
		);

	let version: string;
	try {
		version = execFileSync(executablePath, ["--version"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (cause) {
		throw conformanceError(
			executablePath,
			"version",
			`could not run --version. Provide the exact Codex ${expectations.binaryVersion} executable; PATH lookup is disabled. ${failureDetail(cause)}`,
			cause,
		);
	}
	if (version !== expectations.binaryVersion)
		throw conformanceError(
			executablePath,
			"version",
			`expected ${expectations.binaryVersion}, received ${version || "<empty output>"}`,
		);

	let generatedRoot: string;
	try {
		generatedRoot = mkdtempSync(join(tmpdir(), "archboard-codex-generated-"));
	} catch (cause) {
		throw conformanceError(
			executablePath,
			"generation",
			`could not create a temporary generation directory. Check the system temporary directory. ${failureDetail(cause)}`,
			cause,
		);
	}

	try {
		try {
			execFileSync(
				executablePath,
				["app-server", "generate-ts", "--experimental", "--out", generatedRoot],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			);
		} catch (cause) {
			throw conformanceError(
				executablePath,
				"generation",
				`could not generate the experimental tree in the temporary directory. Confirm this is Codex ${expectations.binaryVersion} with app-server generate-ts support. ${failureDetail(cause)}`,
				cause,
			);
		}

		let digest: ReturnType<typeof digestGeneratedTree>;
		try {
			digest = digestGeneratedTree(generatedRoot);
		} catch (cause) {
			throw conformanceError(
				executablePath,
				"digest",
				`could not read the generated tree. Confirm the generator completed successfully. ${failureDetail(cause)}`,
				cause,
			);
		}
		if (
			digest.fileCount !== expectations.generatedFileCount ||
			digest.sha256 !== expectations.generatedTreeSha256
		)
			throw conformanceError(
				executablePath,
				"digest",
				`generated tree mismatch: expected ${expectations.generatedFileCount} files and ${expectations.generatedTreeSha256}, received ${digest.fileCount} files and ${digest.sha256}. Regenerate with the exact Codex ${expectations.binaryVersion} binary.`,
			);

		let generatedNotificationPaths: GeneratedNotificationUnionPath[];
		try {
			generatedNotificationPaths = deriveGeneratedNotificationUnionPaths(generatedRoot);
		} catch (cause) {
			throw conformanceError(
				executablePath,
				"inventory",
				`could not derive the generated notification-union inventory. Confirm the generated tree is complete and compatible with the pinned protocol. ${failureDetail(cause)}`,
				cause,
			);
		}
		const mismatch = notificationInventoryMismatch(
			expectations.notificationUnionPaths,
			generatedNotificationPaths,
		);
		if (mismatch)
			throw conformanceError(
				executablePath,
				"inventory",
				`generated notification-union inventory mismatch: ${mismatch}. Regenerate with the exact Codex ${expectations.binaryVersion} binary.`,
			);

		return {
			executablePath,
			version,
			fileCount: digest.fileCount,
			sha256: digest.sha256,
		};
	} finally {
		rmSync(generatedRoot, { recursive: true, force: true });
	}
}

/**
 * Runs the pinned generator against an explicitly supplied executable path.
 * The only filesystem mutation is a temporary directory, which is removed
 * before this function returns or throws.
 */
export function runCodexProtocolConformance(
	executablePath: string,
): CodexProtocolConformanceResult {
	return runCodexProtocolConformanceWithExpectations(executablePath, PRODUCTION_EXPECTATIONS);
}

/** Test-only manifest injection; intentionally not re-exported from the package entrypoint. */
export function runCodexProtocolConformanceForTest(
	executablePath: string,
	expectations: CodexProtocolConformanceExpectations,
): CodexProtocolConformanceResult {
	return runCodexProtocolConformanceWithExpectations(executablePath, expectations);
}
