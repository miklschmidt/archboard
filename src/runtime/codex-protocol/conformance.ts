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
	CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS,
	deriveGeneratedProtocolMethodInventories,
	type GeneratedProtocolMethodDirection,
	type GeneratedProtocolMethodInventories,
} from "./generated-method-inventory.js";
import {
	CODEX_PROTOCOL_GENERATED_NOTIFICATION_UNION_PATHS,
	deriveGeneratedNotificationUnionPaths,
	type GeneratedNotificationUnionPath,
} from "./generated-notification-inventory.js";
import { CLIENT_NOTIFICATION_SCHEMAS, SERVER_REQUEST_SCHEMAS } from "./lib/request-schemas.js";
import { RESPONSE_SCHEMAS } from "./lib/response-schemas.js";
import { SERVER_NOTIFICATION_SCHEMAS } from "./lib/notification-schemas.js";
import {
	CLIENT_NOTIFICATION_METHODS,
	RESPONSE_METHODS,
	SERVER_NOTIFICATION_METHODS,
	SERVER_REQUEST_METHODS,
} from "./lib/methods.js";

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
	readonly methodInventories?: GeneratedProtocolMethodInventories;
	readonly decoderMethodInventories?: GeneratedProtocolMethodInventories;
	readonly clientRequestResponseAlias?: string;
	readonly clientRequestExcludedMethods?: readonly string[];
}

const AUTHORED_METHOD_INVENTORIES: GeneratedProtocolMethodInventories = {
	response: RESPONSE_METHODS,
	clientNotification: CLIENT_NOTIFICATION_METHODS,
	serverRequest: SERVER_REQUEST_METHODS,
	serverNotification: SERVER_NOTIFICATION_METHODS,
};

const PRODUCTION_EXPECTATIONS: CodexProtocolConformanceExpectations = {
	binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
	generatedFileCount: CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	generatedTreeSha256: CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	notificationUnionPaths: CODEX_PROTOCOL_GENERATED_NOTIFICATION_UNION_PATHS,
	methodInventories: AUTHORED_METHOD_INVENTORIES,
	decoderMethodInventories: {
		response: Object.keys(RESPONSE_SCHEMAS).toSorted(),
		clientNotification: Object.keys(CLIENT_NOTIFICATION_SCHEMAS).toSorted(),
		serverRequest: Object.keys(SERVER_REQUEST_SCHEMAS).toSorted(),
		serverNotification: Object.keys(SERVER_NOTIFICATION_SCHEMAS).toSorted(),
	},
	clientRequestResponseAlias: "currentTime/read",
	clientRequestExcludedMethods: CODEX_PROTOCOL_GENERATED_CLIENT_REQUEST_EXCLUDED_METHODS,
};

const GENERATED_METHOD_DIRECTION_NAMES: Readonly<Record<GeneratedProtocolMethodDirection, string>> =
	Object.freeze({
		response: "ClientRequest responses",
		clientNotification: "ClientNotification",
		serverRequest: "ServerRequest",
		serverNotification: "ServerNotification",
	});

function methodListDifference(expected: readonly string[], received: readonly string[]): string[] {
	const receivedSet = new Set(received);
	return expected.filter((method) => !receivedSet.has(method));
}

function compareMethodInventories(
	expected: GeneratedProtocolMethodInventories,
	received: GeneratedProtocolMethodInventories,
	exactDirections: readonly GeneratedProtocolMethodDirection[],
): string | null {
	const exact = new Set(exactDirections);
	const differences: string[] = [];
	for (const direction of Object.keys(
		GENERATED_METHOD_DIRECTION_NAMES,
	) as GeneratedProtocolMethodDirection[]) {
		const expectedMethods = expected[direction];
		const receivedMethods = received[direction];
		const missing = methodListDifference(expectedMethods, receivedMethods);
		const unexpected = exact.has(direction)
			? methodListDifference(receivedMethods, expectedMethods)
			: [];
		if (missing.length || unexpected.length)
			differences.push(
				`${GENERATED_METHOD_DIRECTION_NAMES[direction]} decoder gap: expected ${expectedMethods.length} authored methods, generated ${receivedMethods.length}; missing ${missing.length ? missing.join(", ") : "<none>"}; unexpected ${unexpected.length ? unexpected.join(", ") : "<none>"}`,
			);
	}
	return differences.length ? differences.join("; ") : null;
}

function decoderRegistryMismatch(
	authored: GeneratedProtocolMethodInventories,
	decoder: GeneratedProtocolMethodInventories,
): string | null {
	return compareMethodInventories(authored, decoder, [
		"response",
		"clientNotification",
		"serverRequest",
		"serverNotification",
	]);
}

function duplicateMethods(methods: readonly string[]): string[] {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const method of methods) {
		if (seen.has(method)) duplicates.add(method);
		seen.add(method);
	}
	return [...duplicates].toSorted();
}

function methodInventoryShapeMismatch(
	name: string,
	inventories: GeneratedProtocolMethodInventories,
): string | null {
	const differences: string[] = [];
	for (const direction of Object.keys(
		GENERATED_METHOD_DIRECTION_NAMES,
	) as GeneratedProtocolMethodDirection[]) {
		const duplicates = duplicateMethods(inventories[direction]);
		if (duplicates.length)
			differences.push(
				`${name} ${GENERATED_METHOD_DIRECTION_NAMES[direction]} has duplicate methods: ${duplicates.join(", ")}`,
			);
	}
	return differences.length ? differences.join("; ") : null;
}

function clientRequestInventoryMismatch(
	expected: GeneratedProtocolMethodInventories,
	generated: GeneratedProtocolMethodInventories,
	responseAlias: string,
	excludedMethods: readonly string[],
): string | null {
	const expectedClientResponses = expected.response.filter((method) => method !== responseAlias);
	const duplicateExcluded = duplicateMethods(excludedMethods);
	const excludedSet = new Set(excludedMethods);
	const overlap = expectedClientResponses.filter((method) => excludedSet.has(method));
	const aliasExcluded = excludedSet.has(responseAlias);
	const sortedExcluded = excludedMethods.toSorted();
	const orderingChanged = excludedMethods.some((method, index) => method !== sortedExcluded[index]);
	const covered = [...new Set([...expectedClientResponses, ...excludedMethods])].toSorted();
	const missing = methodListDifference(covered, generated.response);
	const unexpected = methodListDifference(generated.response, covered);
	const differences: string[] = [];
	if (duplicateExcluded.length)
		differences.push(`duplicate exclusions: ${duplicateExcluded.join(", ")}`);
	if (overlap.length)
		differences.push(`supported/excluded overlap: ${overlap.toSorted().join(", ")}`);
	if (aliasExcluded) differences.push(`response alias is excluded: ${responseAlias}`);
	if (orderingChanged) differences.push("excluded methods are not in stable sorted order");
	if (missing.length) differences.push(`missing ${missing.join(", ")}`);
	if (unexpected.length) differences.push(`unexpected ${unexpected.join(", ")}`);
	if (!differences.length) return null;
	return [
		`expected ${expectedClientResponses.length} supported ClientRequest responses plus ${excludedMethods.length} explicit exclusions (${covered.length} unique methods), generated ${generated.response.length}`,
		...differences,
	].join("; ");
}

function responseAliasMismatch(
	expected: GeneratedProtocolMethodInventories,
	decoder: GeneratedProtocolMethodInventories | undefined,
	generated: GeneratedProtocolMethodInventories | undefined,
	responseAlias: string,
): string | null {
	const differences: string[] = [];
	if (!expected.response.includes(responseAlias))
		differences.push(`authored response registry is missing required alias ${responseAlias}`);
	if (!expected.serverRequest.includes(responseAlias))
		differences.push(`authored server-request registry is missing required alias ${responseAlias}`);
	if (decoder && !decoder.response.includes(responseAlias))
		differences.push(`response decoder registry is missing required alias ${responseAlias}`);
	if (generated && !generated.serverRequest.includes(responseAlias))
		differences.push(
			`generated ServerRequest inventory is missing required alias ${responseAlias}`,
		);
	return differences.length ? differences.join("; ") : null;
}

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
	const methodShapeMismatch = expectations.methodInventories
		? methodInventoryShapeMismatch("authored", expectations.methodInventories)
		: null;
	if (methodShapeMismatch)
		throw conformanceError(
			executablePath,
			"inventory",
			`authored method inventory is invalid: ${methodShapeMismatch}`,
		);
	const decoderShapeMismatch = expectations.decoderMethodInventories
		? methodInventoryShapeMismatch("decoder", expectations.decoderMethodInventories)
		: null;
	if (decoderShapeMismatch)
		throw conformanceError(
			executablePath,
			"inventory",
			`decoder method inventory is invalid: ${decoderShapeMismatch}`,
		);
	const registryMismatch =
		expectations.methodInventories && expectations.decoderMethodInventories
			? decoderRegistryMismatch(
					expectations.methodInventories,
					expectations.decoderMethodInventories,
				)
			: null;
	if (registryMismatch)
		throw conformanceError(
			executablePath,
			"inventory",
			`authored decoder registry mismatch: ${registryMismatch}`,
		);
	if (
		expectations.methodInventories &&
		expectations.clientRequestResponseAlias &&
		expectations.decoderMethodInventories
	) {
		const aliasMismatch = responseAliasMismatch(
			expectations.methodInventories,
			expectations.decoderMethodInventories,
			undefined,
			expectations.clientRequestResponseAlias,
		);
		if (aliasMismatch)
			throw conformanceError(
				executablePath,
				"inventory",
				`response alias inventory mismatch: ${aliasMismatch}`,
			);
	}

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

		let generatedMethodInventories: GeneratedProtocolMethodInventories;
		try {
			generatedMethodInventories = deriveGeneratedProtocolMethodInventories(generatedRoot);
		} catch (cause) {
			throw conformanceError(
				executablePath,
				"inventory",
				`could not derive the generated API method inventory. Confirm the generated tree is complete and compatible with the pinned protocol. ${failureDetail(cause)}`,
				cause,
			);
		}
		const methodExpected =
			expectations.methodInventories && expectations.clientRequestResponseAlias
				? {
						...expectations.methodInventories,
						response: expectations.methodInventories.response.filter(
							(method) => method !== expectations.clientRequestResponseAlias,
						),
					}
				: expectations.methodInventories;
		const methodMismatch = methodExpected
			? compareMethodInventories(methodExpected, generatedMethodInventories, [
					"clientNotification",
					"serverRequest",
					"serverNotification",
				])
			: null;
		if (methodMismatch)
			throw conformanceError(
				executablePath,
				"inventory",
				`generated API method inventory mismatch: ${methodMismatch}. Regenerate with the exact Codex ${expectations.binaryVersion} binary.`,
			);
		if (
			expectations.methodInventories &&
			expectations.clientRequestResponseAlias &&
			expectations.clientRequestExcludedMethods
		) {
			const clientRequestMismatch = clientRequestInventoryMismatch(
				expectations.methodInventories,
				generatedMethodInventories,
				expectations.clientRequestResponseAlias,
				expectations.clientRequestExcludedMethods,
			);
			if (clientRequestMismatch)
				throw conformanceError(
					executablePath,
					"inventory",
					`generated ClientRequest coverage mismatch: ${clientRequestMismatch}. Regenerate with the exact Codex ${expectations.binaryVersion} binary and review the explicit exclusion inventory.`,
				);
			const aliasMismatch = responseAliasMismatch(
				expectations.methodInventories,
				expectations.decoderMethodInventories,
				generatedMethodInventories,
				expectations.clientRequestResponseAlias,
			);
			if (aliasMismatch)
				throw conformanceError(
					executablePath,
					"inventory",
					`response alias inventory mismatch: ${aliasMismatch}. Regenerate with the exact Codex ${expectations.binaryVersion} binary and review the decoder inventory.`,
				);
		}

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
