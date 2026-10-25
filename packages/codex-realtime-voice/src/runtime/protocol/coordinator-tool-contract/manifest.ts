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
	readonly name: string;
	readonly description: string;
	readonly tools: readonly CanonicalTool[];
}

/** The built-in coordinator namespaces, by the role they play; each host names them itself. */
type CoordinatorNamespaceRole = "workhorse" | "voice";

/** The reviewed bytes of each role's template, whose `{namespace}` the host's name fills. */
const TEMPLATE_DIGESTS = Object.freeze({
	workhorse: "2032ea1899ba0a0dc0fe5bd269075aa61dbc2496aba3d4ff290c07df2ad61767",
	voice: "750c75db9abf2765427c5fa9335758cf3ece9c59be50c82fcff22b2fcf82c85e",
} satisfies Record<CoordinatorNamespaceRole, string>);

const WORKHORSE_TOOL_NAMES = Object.freeze([
	"inspect_workhorse",
	"delegate_to_workhorse",
	"manage_workhorse_queue",
	"steer_workhorse",
	"stop_workhorses",
] as const);
const VOICE_TOOL_NAMES = Object.freeze(["resolve_spoken_approval"] as const);

type WorkhorseToolName = (typeof WORKHORSE_TOOL_NAMES)[number];
type VoiceToolName = (typeof VOICE_TOOL_NAMES)[number];
type CoordinatorToolName = WorkhorseToolName | VoiceToolName;

const EXPECTED_TOOL_NAMES: Readonly<Record<CoordinatorNamespaceRole, readonly string[]>> =
	Object.freeze({ workhorse: WORKHORSE_TOOL_NAMES, voice: VOICE_TOOL_NAMES });

/** A namespace name Codex accepts and a JSON string holds verbatim. */
const NAMESPACE_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

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
		name: z.string().regex(NAMESPACE_NAME),
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
 * Checks one manifest tool against its reviewed position: the expected name and a closed
 * input schema, because the coordinator may only call exactly what was reviewed.
 * @param role - The role of the namespace the tool belongs to.
 * @param tool - The parsed tool entry.
 * @param index - The tool's position in the manifest.
 * @param expectedToolName - The reviewed name for that position, if any.
 */
function assertToolEntry(
	role: CoordinatorNamespaceRole,
	tool: CanonicalTool,
	index: number,
	expectedToolName: string | undefined,
): void {
	if (tool.name !== expectedToolName) {
		throw new TypeError(
			`${role} tool ${index} must be ${expectedToolName ?? "<missing>"}; received ${tool.name}.`,
		);
	}
	if (tool.inputSchema["additionalProperties"] !== false) {
		throw new TypeError(`${role}.${tool.name} must use a closed input schema.`);
	}
}

/**
 * Verifies a parsed manifest holds exactly the reviewed tools of its role in the reviewed order.
 * Type and eager loading are already fixed by the closed schema.
 * @param manifest - The parsed namespace.
 * @param role - The role the caller asked for.
 */
function assertManifestShape(manifest: CanonicalNamespace, role: CoordinatorNamespaceRole): void {
	const expectedNames = EXPECTED_TOOL_NAMES[role];
	if (manifest.tools.length !== expectedNames.length) {
		throw new TypeError(
			`${role} must contain exactly ${expectedNames.length} tools; received ${manifest.tools.length}.`,
		);
	}
	for (const [index, tool] of manifest.tools.entries()) {
		assertToolEntry(role, tool, index, expectedNames[index]);
	}
}

/** One role's namespace as a host names it: its exact bytes, the parsed namespace and their digest. */
interface ReviewedNamespace {
	readonly role: CoordinatorNamespaceRole;
	readonly text: string;
	readonly namespace: CanonicalNamespace;
	readonly sha256: string;
}

/**
 * Reads a reviewed template beside this module and refuses it unless its bytes hash to the fixed
 * reviewed digest, so a silent edit cannot change what the coordinator may call.
 * @param role - The role whose template to load.
 * @returns The canonical template text.
 */
function loadTemplate(role: CoordinatorNamespaceRole): string {
	const label = `${role} manifest template`;
	const bytes = readFileSync(
		new URL(import.meta.resolve(`#runtime/protocol/coordinator-tool-contract/${role}.json`)),
	);
	const text = decodeCanonicalBytes(bytes, label);
	const actualSha256 = sha256(bytes);
	if (actualSha256 !== TEMPLATE_DIGESTS[role]) {
		throw new TypeError(
			`${label} hash drifted. Expected SHA-256 ${TEMPLATE_DIGESTS[role]}, received ${actualSha256}. Human re-review is required before updating this digest.`,
		);
	}
	return text;
}

const TEMPLATES = Object.freeze({
	workhorse: loadTemplate("workhorse"),
	voice: loadTemplate("voice"),
} satisfies Record<CoordinatorNamespaceRole, string>);

/**
 * Fill one role's reviewed template with the namespace name a host gives it, and hash the exact
 * bytes Codex is given: the digest is how a call proves it came through this namespace.
 * @param role - The role.
 * @param name - The host's namespace name for it.
 * @returns The namespace with its bytes and digest.
 * @throws {TypeError} When the name is not a namespace name.
 */
function renderCoordinatorNamespace(
	role: CoordinatorNamespaceRole,
	name: string,
): ReviewedNamespace {
	if (!NAMESPACE_NAME.test(name)) {
		throw new TypeError(`The ${role} namespace name must match ${NAMESPACE_NAME.source}.`);
	}
	const text = TEMPLATES[role].replace('"name": "{namespace}"', `"name": "${name}"`);
	const namespace = parseManifestText(text, `${name} manifest`);
	assertManifestShape(namespace, role);
	return deepFreeze({ role, text, namespace, sha256: sha256(Buffer.from(text, "utf8")) });
}

/**
 * Validate a candidate namespace from exact bytes or a closed object snapshot against the one a
 * host named: exact digest first, then canonical encoding, then shape and content.
 * @param reviewed - The rendered namespace the candidate claims to be.
 * @param candidate - Manifest text, raw bytes, or an already-parsed object.
 * @throws {TypeError} When the candidate is not that namespace byte for byte or field for field.
 */
function assertCanonicalManifest(reviewed: ReviewedNamespace, candidate: unknown): void {
	const label = `${reviewed.namespace.name} manifest`;
	let received: CanonicalNamespace;
	if (typeof candidate === "string" || candidate instanceof Uint8Array) {
		const bytes =
			typeof candidate === "string" ? Buffer.from(candidate, "utf8") : Buffer.from(candidate);
		const actualSha256 = sha256(bytes);
		if (actualSha256 !== reviewed.sha256) {
			throw new TypeError(
				`${label} hash drifted. Expected SHA-256 ${reviewed.sha256}, received ${actualSha256}.`,
			);
		}
		received = parseManifestText(decodeCanonicalBytes(bytes, label), label);
	} else {
		received = CanonicalNamespaceSchema.parse(candidate);
	}
	assertManifestShape(received, reviewed.role);
	if (JSON.stringify(received) !== JSON.stringify(reviewed.namespace)) {
		throw new TypeError(`${label} does not match the reviewed snapshot.`);
	}
}

/** Each role's tools, which no host name changes. */
const TEMPLATE_TOOLS = Object.freeze({
	workhorse: renderCoordinatorNamespace("workhorse", "template").namespace.tools,
	voice: renderCoordinatorNamespace("voice", "template").namespace.tools,
});

/**
 * Finds one reviewed tool declaration by name.
 * @param role - The role of the namespace that declares the tool.
 * @param toolName - The tool to look up.
 * @returns The reviewed tool declaration.
 */
function canonicalTool(
	role: CoordinatorNamespaceRole,
	toolName: CoordinatorToolName,
): CanonicalTool {
	const tool = TEMPLATE_TOOLS[role].find((candidate) => candidate.name === toolName);
	if (!tool) {
		throw new TypeError(`The ${role} namespace does not declare ${toolName}.`);
	}
	return tool;
}

export {
	type JsonSchema,
	type CanonicalTool,
	type CanonicalNamespace,
	type CoordinatorNamespaceRole,
	type ReviewedNamespace,
	WORKHORSE_TOOL_NAMES,
	VOICE_TOOL_NAMES,
	type WorkhorseToolName,
	type VoiceToolName,
	type CoordinatorToolName,
	renderCoordinatorNamespace,
	assertCanonicalManifest,
	canonicalTool,
	deepFreeze,
};
