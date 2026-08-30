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

export type CodexProtocolConformancePhase = "path" | "version" | "generation" | "digest";

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

/**
 * Runs the pinned generator against an explicitly supplied executable path.
 * The only filesystem mutation is a temporary directory, which is removed
 * before this function returns or throws.
 */
export function runCodexProtocolConformance(
	executablePath: string,
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
			`could not run --version. Provide the exact Codex ${CODEX_PROTOCOL_BINARY_VERSION} executable; PATH lookup is disabled. ${failureDetail(cause)}`,
			cause,
		);
	}
	if (version !== CODEX_PROTOCOL_BINARY_VERSION)
		throw conformanceError(
			executablePath,
			"version",
			`expected ${CODEX_PROTOCOL_BINARY_VERSION}, received ${version || "<empty output>"}`,
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
				`could not generate the experimental tree in the temporary directory. Confirm this is Codex ${CODEX_PROTOCOL_BINARY_VERSION} with app-server generate-ts support. ${failureDetail(cause)}`,
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
			digest.fileCount !== CODEX_PROTOCOL_GENERATED_FILE_COUNT ||
			digest.sha256 !== CODEX_PROTOCOL_GENERATED_TREE_SHA256
		)
			throw conformanceError(
				executablePath,
				"digest",
				`generated tree mismatch: expected ${CODEX_PROTOCOL_GENERATED_FILE_COUNT} files and ${CODEX_PROTOCOL_GENERATED_TREE_SHA256}, received ${digest.fileCount} files and ${digest.sha256}. Regenerate with the exact Codex ${CODEX_PROTOCOL_BINARY_VERSION} binary.`,
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
