import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

type JsonSchema = Readonly<Record<string, unknown>>;

interface CanonicalTool {
	readonly type: "function";
	readonly name: string;
	readonly description: string;
	readonly inputSchema: JsonSchema;
	readonly deferLoading: false;
}

interface CanonicalNamespace {
	readonly type: "namespace";
	readonly name: NamespaceName;
	readonly description: string;
	readonly tools: readonly CanonicalTool[];
}

type NamespaceName = "archboard_workhorse" | "archboard_voice";
type ManifestName = "workhorse" | "voice";

const ARCHBOARD_WORKHORSE_MANIFEST_SHA256 =
	"fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f" as const;
const ARCHBOARD_VOICE_MANIFEST_SHA256 =
	"792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393" as const;

const MANIFEST_FILES = Object.freeze({
	archboard_workhorse: "archboard-workhorse.json",
	archboard_voice: "archboard-voice.json",
} satisfies Record<NamespaceName, string>);

const MANIFEST_DIGESTS = Object.freeze({
	archboard_workhorse: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	archboard_voice: ARCHBOARD_VOICE_MANIFEST_SHA256,
} satisfies Record<NamespaceName, string>);

const ARCHBOARD_WORKHORSE_TOOL_NAMES = Object.freeze([
	"inspect_workhorse",
	"delegate_to_workhorse",
	"manage_workhorse_queue",
	"steer_workhorse",
] as const);
const ARCHBOARD_VOICE_TOOL_NAMES = Object.freeze(["resolve_spoken_approval"] as const);

type WorkhorseToolName = (typeof ARCHBOARD_WORKHORSE_TOOL_NAMES)[number];
type VoiceToolName = (typeof ARCHBOARD_VOICE_TOOL_NAMES)[number];
type CoordinatorToolName = WorkhorseToolName | VoiceToolName;

const EXPECTED_TOOL_NAMES: Readonly<Record<NamespaceName, readonly string[]>> = Object.freeze({
	archboard_workhorse: ARCHBOARD_WORKHORSE_TOOL_NAMES,
	archboard_voice: ARCHBOARD_VOICE_TOOL_NAMES,
});

const JsonSchemaSchema = z.record(z.string(), z.json());
const CanonicalToolSchema = z
	.object({
		type: z.literal("function"),
		name: z.string().min(1),
		description: z.string().min(1),
		inputSchema: JsonSchemaSchema,
		deferLoading: z.literal(false),
	})
	.strict();
const CanonicalNamespaceSchema = z
	.object({
		type: z.literal("namespace"),
		name: z.enum(["archboard_workhorse", "archboard_voice"]),
		description: z.string().min(1),
		tools: z.array(CanonicalToolSchema),
	})
	.strict();

/**
 * Hashes exact manifest bytes so a reviewed digest can be compared byte for byte.
 * @param bytes - The manifest content exactly as stored on disk or supplied by a caller.
 * @returns The lowercase hexadecimal SHA-256 digest of the bytes.
 */
function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Decodes bytes as strict UTF-8, refusing anything the decoder cannot represent losslessly.
 * @param bytes - The candidate manifest bytes.
 * @param label - Names the manifest in the refusal message.
 * @returns The decoded text.
 */
function decodeStrictUtf8(bytes: Buffer, label: string): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		throw new TypeError(`${label} is not valid UTF-8.`, { cause: error });
	}
}

/**
 * Refuses text whose line endings would make two reviewed manifests hash differently
 * while reading the same: carriage returns, a missing terminal newline, or a doubled one.
 * @param text - The decoded manifest text.
 * @param label - Names the manifest in the refusal message.
 */
function assertCanonicalLineEndings(text: string, label: string): void {
	if (text.includes("\r")) {
		throw new TypeError(`${label} must use LF line endings.`);
	}
	if (!text.endsWith("\n") || text.endsWith("\n\n")) {
		throw new TypeError(`${label} must end in exactly one terminal LF.`);
	}
}

/**
 * Decodes manifest bytes only when they are in the one canonical encoding the reviewed
 * digest was computed over: BOM-less UTF-8, LF endings, one terminal newline, round-trippable.
 * @param bytes - The candidate manifest bytes.
 * @param label - Names the manifest in refusal messages.
 * @returns The canonical manifest text.
 */
function decodeCanonicalBytes(bytes: Buffer, label: string): string {
	if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
		throw new TypeError(`${label} must be UTF-8 without a BOM.`);
	}
	const text = decodeStrictUtf8(bytes, label);
	assertCanonicalLineEndings(text, label);
	if (!Buffer.from(text, "utf8").equals(bytes)) {
		throw new TypeError(`${label} contains bytes that do not round-trip as UTF-8.`);
	}
	return text;
}

/**
 * Parses canonical manifest text into a closed namespace, so no unreviewed field survives.
 * @param text - The canonical manifest text.
 * @param label - Names the manifest in the refusal message.
 * @returns The validated namespace.
 */
function parseManifestText(text: string, label: string): CanonicalNamespace {
	let value: unknown;
	try {
		value = JSON.parse(text) as unknown;
	} catch (error) {
		throw new TypeError(`${label} is not valid JSON.`, { cause: error });
	}
	return CanonicalNamespaceSchema.parse(value);
}

/**
 * Freezes a value and everything reachable from it, so a reviewed contract cannot be
 * mutated after load by any consumer holding a reference.
 * @param value - The value to freeze in place.
 * @returns The same value, now deeply frozen.
 */
function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) {
		deepFreeze(child);
	}
	Object.freeze(value);
	return value;
}

/**
 * Looks up the reviewed tool order for a namespace.
 * @param namespace - The namespace whose tools are expected.
 * @returns The tool names in their reviewed order.
 */
function expectedToolNames(namespace: NamespaceName): readonly string[] {
	return EXPECTED_TOOL_NAMES[namespace];
}

/**
 * Checks one manifest tool against its reviewed position: the expected name and a closed
 * input schema, because the coordinator may only call exactly what was reviewed.
 * @param namespace - The namespace the tool belongs to.
 * @param tool - The parsed tool entry.
 * @param index - The tool's position in the manifest.
 * @param expectedToolName - The reviewed name for that position, if any.
 */
function assertToolEntry(
	namespace: NamespaceName,
	tool: CanonicalTool,
	index: number,
	expectedToolName: string | undefined,
): void {
	if (tool.name !== expectedToolName) {
		throw new TypeError(
			`${namespace} tool ${index} must be ${expectedToolName ?? "<missing>"}; received ${tool.name}.`,
		);
	}
	if (tool.inputSchema["additionalProperties"] !== false) {
		throw new TypeError(`${namespace}.${tool.name} must use a closed input schema.`);
	}
}

/**
 * Verifies a parsed manifest is the namespace it claims, with exactly the reviewed tools in
 * the reviewed order. Type and eager loading are already fixed by the closed schema.
 * @param manifest - The parsed namespace.
 * @param expectedName - The namespace the caller asked for.
 */
function assertManifestShape(manifest: CanonicalNamespace, expectedName: NamespaceName): void {
	if (manifest.name !== expectedName) {
		throw new TypeError(`Expected ${expectedName}, received ${manifest.name}.`);
	}
	const expectedNames = expectedToolNames(expectedName);
	if (manifest.tools.length !== expectedNames.length) {
		throw new TypeError(
			`${expectedName} must contain exactly ${expectedNames.length} tools; received ${manifest.tools.length}.`,
		);
	}
	for (const [index, tool] of manifest.tools.entries()) {
		assertToolEntry(expectedName, tool, index, expectedNames[index]);
	}
}

interface LoadedManifest {
	readonly text: string;
	readonly manifest: CanonicalNamespace;
	readonly sha256: string;
}

/**
 * Reads a reviewed manifest file beside this module and refuses it unless its bytes hash to
 * the fixed reviewed digest, so a silent edit cannot change what the coordinator may call.
 * @param namespace - The namespace whose manifest file to load.
 * @returns The canonical text, the frozen parsed namespace and the verified digest.
 */
function loadManifest(namespace: NamespaceName): LoadedManifest {
	const label = `${namespace} manifest`;
	const bytes = readFileSync(new URL(`../${MANIFEST_FILES[namespace]}`, import.meta.url));
	const text = decodeCanonicalBytes(bytes, label);
	const actualSha256 = sha256(bytes);
	const expectedSha256 = MANIFEST_DIGESTS[namespace];
	if (actualSha256 !== expectedSha256) {
		throw new TypeError(
			`${label} hash drifted. Expected SHA-256 ${expectedSha256}, received ${actualSha256}. Human re-review is required before updating this digest.`,
		);
	}
	const manifest = parseManifestText(text, label);
	assertManifestShape(manifest, namespace);
	return { text, manifest: deepFreeze(manifest), sha256: actualSha256 };
}

const WORKHORSE = loadManifest("archboard_workhorse");
const VOICE = loadManifest("archboard_voice");

const ARCHBOARD_WORKHORSE_NAMESPACE = WORKHORSE.manifest;
const ARCHBOARD_VOICE_NAMESPACE = VOICE.manifest;
const ARCHBOARD_WORKHORSE_MANIFEST_JSON = WORKHORSE.text;
const ARCHBOARD_VOICE_MANIFEST_JSON = VOICE.text;

const COORDINATOR_TOOL_MANIFEST_DIGESTS = Object.freeze({
	workhorse: WORKHORSE.sha256,
	voice: VOICE.sha256,
});

interface CoordinatorManifestIntegrity {
	readonly workhorseSha256: string;
	readonly voiceSha256: string;
}

/**
 * Selects the loaded namespace for a name.
 * @param namespace - The namespace name.
 * @returns The frozen reviewed namespace.
 */
function manifestFor(namespace: NamespaceName): CanonicalNamespace {
	return namespace === "archboard_workhorse"
		? ARCHBOARD_WORKHORSE_NAMESPACE
		: ARCHBOARD_VOICE_NAMESPACE;
}

/**
 * Looks up the fixed reviewed digest for a namespace.
 * @param namespace - The namespace name.
 * @returns The reviewed SHA-256 digest.
 */
function expectedDigest(namespace: NamespaceName): string {
	return MANIFEST_DIGESTS[namespace];
}

/**
 * Validates caller-supplied manifest bytes or text the same way the file on disk is
 * validated: exact digest first, then canonical encoding, then shape.
 * @param namespace - The namespace the candidate claims to be.
 * @param candidate - The manifest as text or raw bytes.
 * @returns The parsed namespace.
 */
function parseCandidate(
	namespace: NamespaceName,
	candidate: string | Uint8Array,
): CanonicalNamespace {
	const bytes =
		typeof candidate === "string" ? Buffer.from(candidate, "utf8") : Buffer.from(candidate);
	const actualSha256 = sha256(bytes);
	if (actualSha256 !== expectedDigest(namespace)) {
		throw new TypeError(
			`${namespace} manifest hash drifted. Expected SHA-256 ${expectedDigest(namespace)}, received ${actualSha256}.`,
		);
	}
	const text = decodeCanonicalBytes(bytes, `${namespace} manifest`);
	const manifest = parseManifestText(text, `${namespace} manifest`);
	assertManifestShape(manifest, namespace);
	return manifest;
}

/**
 * Validate a reviewed namespace from exact bytes or a closed object snapshot.
 * @param namespace - The namespace the candidate claims to be.
 * @param candidate - Manifest text, raw bytes, or an already-parsed object.
 */
function assertCanonicalManifest(namespace: NamespaceName, candidate: unknown): void {
	const expected = manifestFor(namespace);
	const received =
		typeof candidate === "string" || candidate instanceof Uint8Array
			? parseCandidate(namespace, candidate)
			: CanonicalNamespaceSchema.parse(candidate);
	assertManifestShape(received, namespace);
	if (JSON.stringify(received) !== JSON.stringify(expected)) {
		throw new TypeError(`${namespace} manifest does not match the reviewed snapshot.`);
	}
}

/**
 * Re-read both canonical files and verify their fixed reviewed digests.
 * @returns The verified digest of each manifest.
 */
function verifyCoordinatorManifestIntegrity(): CoordinatorManifestIntegrity {
	const workhorse = loadManifest("archboard_workhorse");
	const voice = loadManifest("archboard_voice");
	return Object.freeze({ workhorseSha256: workhorse.sha256, voiceSha256: voice.sha256 });
}

/**
 * Finds one reviewed tool declaration by name.
 * @param namespace - The namespace that declares the tool.
 * @param toolName - The tool to look up.
 * @returns The reviewed tool declaration.
 */
function canonicalTool(namespace: NamespaceName, toolName: CoordinatorToolName): CanonicalTool {
	const tool = manifestFor(namespace).tools.find((candidate) => candidate.name === toolName);
	if (!tool) {
		throw new TypeError(`${namespace} does not declare ${toolName}.`);
	}
	return tool;
}

export {
	type JsonSchema,
	type CanonicalTool,
	type CanonicalNamespace,
	type NamespaceName,
	type ManifestName,
	ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	ARCHBOARD_VOICE_MANIFEST_SHA256,
	ARCHBOARD_WORKHORSE_TOOL_NAMES,
	ARCHBOARD_VOICE_TOOL_NAMES,
	type WorkhorseToolName,
	type VoiceToolName,
	type CoordinatorToolName,
	ARCHBOARD_WORKHORSE_NAMESPACE,
	ARCHBOARD_VOICE_NAMESPACE,
	ARCHBOARD_WORKHORSE_MANIFEST_JSON,
	ARCHBOARD_VOICE_MANIFEST_JSON,
	COORDINATOR_TOOL_MANIFEST_DIGESTS,
	type CoordinatorManifestIntegrity,
	assertCanonicalManifest,
	verifyCoordinatorManifestIntegrity,
	canonicalTool,
	deepFreeze,
};
