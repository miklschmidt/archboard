import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

import { parseStrictJson } from "./json.js";

export const ARCHBOARD_APP_MANIFEST_SHA256 =
	"df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e" as const;

export const ARCHBOARD_APP_TOOL_NAMES = [
	"create_thread",
	"fork_thread",
	"list_threads",
	"read_thread",
	"send_message_to_thread",
	"wait_threads",
] as const;

export const GeneralThreadToolNameSchema = z.enum(ARCHBOARD_APP_TOOL_NAMES);
export type GeneralThreadToolName = (typeof ARCHBOARD_APP_TOOL_NAMES)[number];

const DynamicToolFunctionSchema = z.strictObject({
	type: z.literal("function"),
	name: z.string().min(1),
	description: z.string().min(1),
	inputSchema: z.json(),
	deferLoading: z.literal(false),
});

const ArchboardAppManifestSchema = z.strictObject({
	type: z.literal("namespace"),
	name: z.literal("archboard_app"),
	description: z.string().min(1),
	tools: z.array(DynamicToolFunctionSchema).length(ARCHBOARD_APP_TOOL_NAMES.length),
});

export type ArchboardAppNamespaceSpec = z.infer<typeof ArchboardAppManifestSchema>;
export type ArchboardAppToolSpec = ArchboardAppNamespaceSpec["tools"][number];

function freezeDeep<T>(value: T): T {
	if (typeof value !== "object" || value === null) {
		return value;
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

function decodeManifestBytes(bytes: Uint8Array): string {
	const buffer = Buffer.from(bytes);
	if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
		throw new TypeError("archboard_app manifest must be UTF-8 without a BOM.");
	}
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
	} catch (error) {
		throw new TypeError("archboard_app manifest is not valid UTF-8.", { cause: error });
	}
	if (text.includes("\r")) {
		throw new TypeError("archboard_app manifest must use LF line endings.");
	}
	if (!text.endsWith("\n") || text.endsWith("\n\n")) {
		throw new TypeError("archboard_app manifest must end in exactly one terminal LF.");
	}
	if (!Buffer.from(text, "utf8").equals(buffer)) {
		throw new TypeError("archboard_app manifest does not round-trip as UTF-8.");
	}
	return text;
}

function digest(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function parseManifestBytes(bytes: Uint8Array): {
	readonly text: string;
	readonly manifest: ArchboardAppNamespaceSpec;
	readonly sha256: string;
} {
	const text = decodeManifestBytes(bytes);
	const sha256 = digest(bytes);
	if (sha256 !== ARCHBOARD_APP_MANIFEST_SHA256) {
		throw new TypeError(
			`archboard_app manifest hash drifted. Expected ${ARCHBOARD_APP_MANIFEST_SHA256}, received ${sha256}. Human re-review is required before updating this digest.`,
		);
	}
	const parsed = ArchboardAppManifestSchema.safeParse(
		parseStrictJson(text, "archboard_app manifest"),
	);
	if (!parsed.success) {
		throw new TypeError(`Invalid archboard_app manifest: ${parsed.error.message}`);
	}
	const names = parsed.data.tools.map((tool) => tool.name);
	if (names.some((name, index) => name !== ARCHBOARD_APP_TOOL_NAMES[index])) {
		throw new TypeError("archboard_app manifest tools are not in the reviewed order.");
	}
	return Object.freeze({ text, manifest: freezeDeep(parsed.data), sha256 });
}

const LOADED_MANIFEST = parseManifestBytes(
	readFileSync(new URL("../archboard-app-manifest.json", import.meta.url)),
);

export const ARCHBOARD_APP_MANIFEST_BYTES = LOADED_MANIFEST.text;
export const ARCHBOARD_APP_MANIFEST = LOADED_MANIFEST.manifest;
export const ARCHBOARD_APP_NAMESPACE = ARCHBOARD_APP_MANIFEST;
export const ARCHBOARD_APP_DYNAMIC_TOOLS = Object.freeze([ARCHBOARD_APP_NAMESPACE] as const);

/** Re-validate candidate bytes against the reviewed manifest, including its digest. */
export function parseArchboardAppManifest(
	candidate: string | Uint8Array,
): ArchboardAppNamespaceSpec {
	return parseManifestBytes(
		typeof candidate === "string" ? Buffer.from(candidate, "utf8") : candidate,
	).manifest;
}

/** Assert that candidate bytes are the exact reviewed eager namespace manifest. */
export function assertCanonicalArchboardAppManifest(candidate: string | Uint8Array): void {
	parseArchboardAppManifest(candidate);
}
