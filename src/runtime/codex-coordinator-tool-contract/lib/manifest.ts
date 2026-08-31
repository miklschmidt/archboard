import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface CanonicalTool {
	readonly type: "function";
	readonly name: string;
	readonly description: string;
	readonly inputSchema: JsonSchema;
	readonly deferLoading: false;
}

export interface CanonicalNamespace {
	readonly type: "namespace";
	readonly name: NamespaceName;
	readonly description: string;
	readonly tools: readonly CanonicalTool[];
}

export type NamespaceName = "archboard_workhorse" | "archboard_voice";
export type ManifestName = "workhorse" | "voice";

export const ARCHBOARD_WORKHORSE_MANIFEST_SHA256 =
	"fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f" as const;
export const ARCHBOARD_VOICE_MANIFEST_SHA256 =
	"792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393" as const;

const MANIFEST_FILES = Object.freeze({
	archboard_workhorse: "archboard-workhorse.json",
	archboard_voice: "archboard-voice.json",
} satisfies Record<NamespaceName, string>);

const MANIFEST_DIGESTS = Object.freeze({
	archboard_workhorse: ARCHBOARD_WORKHORSE_MANIFEST_SHA256,
	archboard_voice: ARCHBOARD_VOICE_MANIFEST_SHA256,
} satisfies Record<NamespaceName, string>);

export const ARCHBOARD_WORKHORSE_TOOL_NAMES = Object.freeze([
	"inspect_workhorse",
	"delegate_to_workhorse",
	"manage_workhorse_queue",
	"steer_workhorse",
] as const);
export const ARCHBOARD_VOICE_TOOL_NAMES = Object.freeze(["resolve_spoken_approval"] as const);

export type WorkhorseToolName = (typeof ARCHBOARD_WORKHORSE_TOOL_NAMES)[number];
export type VoiceToolName = (typeof ARCHBOARD_VOICE_TOOL_NAMES)[number];
export type CoordinatorToolName = WorkhorseToolName | VoiceToolName;

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

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function decodeCanonicalBytes(bytes: Buffer, label: string): string {
	if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
		throw new TypeError(`${label} must be UTF-8 without a BOM.`);

	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		throw new TypeError(`${label} is not valid UTF-8.`, { cause: error });
	}
	if (text.includes("\r")) throw new TypeError(`${label} must use LF line endings.`);
	if (!text.endsWith("\n") || text.endsWith("\n\n"))
		throw new TypeError(`${label} must end in exactly one terminal LF.`);
	if (!Buffer.from(text, "utf8").equals(bytes))
		throw new TypeError(`${label} contains bytes that do not round-trip as UTF-8.`);
	return text;
}

function parseManifestText(text: string, label: string): CanonicalNamespace {
	let value: unknown;
	try {
		value = JSON.parse(text) as unknown;
	} catch (error) {
		throw new TypeError(`${label} is not valid JSON.`, { cause: error });
	}
	return CanonicalNamespaceSchema.parse(value) as CanonicalNamespace;
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	Object.freeze(value);
	return value;
}

function expectedToolNames(namespace: NamespaceName): readonly string[] {
	return EXPECTED_TOOL_NAMES[namespace];
}

function assertManifestShape(manifest: CanonicalNamespace, expectedName: NamespaceName): void {
	if (manifest.type !== "namespace") throw new TypeError(`${expectedName} must be a namespace.`);
	if (manifest.name !== expectedName)
		throw new TypeError(`Expected ${expectedName}, received ${manifest.name}.`);
	const expectedNames = expectedToolNames(expectedName);
	if (manifest.tools.length !== expectedNames.length)
		throw new TypeError(
			`${expectedName} must contain exactly ${expectedNames.length} tools; received ${manifest.tools.length}.`,
		);
	for (const [index, tool] of manifest.tools.entries()) {
		const expectedToolName = expectedNames[index];
		if (tool.name !== expectedToolName)
			throw new TypeError(
				`${expectedName} tool ${index} must be ${expectedToolName ?? "<missing>"}; received ${tool.name}.`,
			);
		if (tool.deferLoading) throw new TypeError(`${expectedName}.${tool.name} must remain eager.`);
		if (tool.inputSchema.additionalProperties !== false)
			throw new TypeError(`${expectedName}.${tool.name} must use a closed input schema.`);
	}
}

interface LoadedManifest {
	readonly text: string;
	readonly manifest: CanonicalNamespace;
	readonly sha256: string;
}

function loadManifest(namespace: NamespaceName): LoadedManifest {
	const label = `${namespace} manifest`;
	const bytes = readFileSync(new URL(`../${MANIFEST_FILES[namespace]}`, import.meta.url));
	const text = decodeCanonicalBytes(bytes, label);
	const actualSha256 = sha256(bytes);
	const expectedSha256 = MANIFEST_DIGESTS[namespace];
	if (actualSha256 !== expectedSha256)
		throw new TypeError(
			`${label} hash drifted. Expected SHA-256 ${expectedSha256}, received ${actualSha256}. Human re-review is required before updating this digest.`,
		);
	const manifest = parseManifestText(text, label);
	assertManifestShape(manifest, namespace);
	return { text, manifest: deepFreeze(manifest), sha256: actualSha256 };
}

const WORKHORSE = loadManifest("archboard_workhorse");
const VOICE = loadManifest("archboard_voice");

export const ARCHBOARD_WORKHORSE_NAMESPACE = WORKHORSE.manifest;
export const ARCHBOARD_VOICE_NAMESPACE = VOICE.manifest;
export const ARCHBOARD_WORKHORSE_MANIFEST_JSON = WORKHORSE.text;
export const ARCHBOARD_VOICE_MANIFEST_JSON = VOICE.text;

export const COORDINATOR_TOOL_MANIFEST_DIGESTS = Object.freeze({
	workhorse: WORKHORSE.sha256,
	voice: VOICE.sha256,
});

export interface CoordinatorManifestIntegrity {
	readonly workhorseSha256: string;
	readonly voiceSha256: string;
}

function manifestFor(namespace: NamespaceName): CanonicalNamespace {
	return namespace === "archboard_workhorse"
		? ARCHBOARD_WORKHORSE_NAMESPACE
		: ARCHBOARD_VOICE_NAMESPACE;
}

function expectedDigest(namespace: NamespaceName): string {
	return MANIFEST_DIGESTS[namespace];
}

function parseCandidate(
	namespace: NamespaceName,
	candidate: string | Uint8Array,
): CanonicalNamespace {
	const bytes =
		typeof candidate === "string" ? Buffer.from(candidate, "utf8") : Buffer.from(candidate);
	const actualSha256 = sha256(bytes);
	if (actualSha256 !== expectedDigest(namespace))
		throw new TypeError(
			`${namespace} manifest hash drifted. Expected SHA-256 ${expectedDigest(namespace)}, received ${actualSha256}.`,
		);
	const text = decodeCanonicalBytes(bytes, `${namespace} manifest`);
	const manifest = parseManifestText(text, `${namespace} manifest`);
	assertManifestShape(manifest, namespace);
	return manifest;
}

/** Validate a reviewed namespace from exact bytes or a closed object snapshot. */
export function assertCanonicalManifest(namespace: NamespaceName, candidate: unknown): void {
	const expected = manifestFor(namespace);
	const received =
		typeof candidate === "string" || candidate instanceof Uint8Array
			? parseCandidate(namespace, candidate)
			: (CanonicalNamespaceSchema.parse(candidate) as CanonicalNamespace);
	assertManifestShape(received, namespace);
	if (JSON.stringify(received) !== JSON.stringify(expected))
		throw new TypeError(`${namespace} manifest does not match the reviewed snapshot.`);
}

/** Re-read both canonical files and verify their fixed reviewed digests. */
export function verifyCoordinatorManifestIntegrity(): CoordinatorManifestIntegrity {
	const workhorse = loadManifest("archboard_workhorse");
	const voice = loadManifest("archboard_voice");
	return Object.freeze({ workhorseSha256: workhorse.sha256, voiceSha256: voice.sha256 });
}

export function canonicalTool(
	namespace: NamespaceName,
	toolName: CoordinatorToolName,
): CanonicalTool {
	const tool = manifestFor(namespace).tools.find((candidate) => candidate.name === toolName);
	if (!tool) throw new TypeError(`${namespace} does not declare ${toolName}.`);
	return tool;
}
