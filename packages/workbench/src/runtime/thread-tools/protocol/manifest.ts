import type { z } from "zod";
// The executable of a release carries the manifest, so it is embedded, not read by path.
import archboardAppManifest from "#runtime/thread-tools/protocol/archboard-app-manifest.json" with { type: "text" };
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	GeneralThreadToolNameSchema,
	parseManifestBytes,
	type ArchboardAppNamespaceSpec,
} from "#runtime/thread-tools/protocol/manifest-load.ts";

type GeneralThreadToolName = z.infer<typeof GeneralThreadToolNameSchema>;

/**
 * The text of the manifest. TypeScript types a JSON module as its parsed value whatever its
 * attributes, so this proves at run time that the `text` import gave the text.
 * @param module - The manifest's default import.
 * @returns The manifest text.
 * @throws {TypeError} When the import gave anything but text.
 */
function manifestText(module: unknown): string {
	if (typeof module !== "string") {
		throw new TypeError("The archboard_app manifest was not imported as text.");
	}
	return module;
}

const NAMESPACE = parseManifestBytes(
	Buffer.from(manifestText(archboardAppManifest), "utf8"),
).manifest;

/**
 * What every call and every stored record of an archboard_app tool is bound to: the namespace
 * and the digest of the reviewed manifest.
 * @returns The namespace name and the manifest hash.
 */
export function archboardAppBinding(): {
	readonly namespace: typeof NAMESPACE.name;
	readonly manifestHash: typeof ARCHBOARD_APP_MANIFEST_SHA256;
} {
	return { namespace: NAMESPACE.name, manifestHash: ARCHBOARD_APP_MANIFEST_SHA256 };
}

/**
 * Whether a value names the reviewed archboard_app namespace.
 * @param namespace - The claimed namespace name.
 * @returns True when it is the reviewed one.
 */
export function isArchboardAppNamespace(namespace: unknown): boolean {
	return namespace === NAMESPACE.name;
}

/**
 * Whether a value is the digest of the reviewed manifest.
 * @param manifestHash - The claimed digest.
 * @returns True when it is the reviewed one.
 */
export function isArchboardAppManifestHash(manifestHash: unknown): boolean {
	return manifestHash === ARCHBOARD_APP_MANIFEST_SHA256;
}

/**
 * Whether a catalogue is byte-for-byte the reviewed manifest. No catalogue means the reviewed one.
 * @param catalogue - The catalogue a caller supplied, if any.
 * @returns True when it is the reviewed manifest.
 */
export function isReviewedCatalogue(catalogue: unknown): boolean {
	return JSON.stringify(catalogue ?? NAMESPACE) === JSON.stringify(NAMESPACE);
}

/**
 * The dynamic tools a workhorse is started with: the reviewed namespace.
 * @returns A new list holding the reviewed, frozen namespace.
 */
export function archboardAppDynamicTools(): ArchboardAppNamespaceSpec[] {
	return [NAMESPACE];
}

/**
 * Whether a value is one of the reviewed archboard_app tool names.
 * @param tool - The claimed tool name.
 * @returns True when it is a reviewed tool.
 */
export function isGeneralThreadToolName(tool: unknown): tool is GeneralThreadToolName {
	return GeneralThreadToolNameSchema.safeParse(tool).success;
}

export type { GeneralThreadToolName };
