import type { WorkbenchThreadProfile } from "#runtime/protocol/host/instructions.ts";
import { createHash } from "node:crypto";

import { createVoiceToolset } from "#runtime/rules/host/toolset.ts";
import type {
	CoordinatorReviewHashes,
	CoordinatorSettings,
} from "#runtime/protocol/coordinator/contract.ts";

/**
 * The digest of one coordinator's settings, taken over their canonical form so the same settings
 * always hash the same way whatever order Codex reported them in.
 * @param settings - The coordinator's settings.
 * @returns The hex digest.
 */
function hashCoordinatorSettings(settings: CoordinatorSettings): string {
	return createHash("sha256").update(canonicalJson(settings), "utf8").digest("hex");
}

/**
 * Read the exact immutable profile hashes alongside the coordinator settings hash.
 * The constructor captures the profile and proves both byte digests before any start.
 * @param settingsHash The canonical digest of effective settings.
 * @param profile The captured host profile and its built-in tools.
 * @returns The exact instruction, tool, and settings evidence retained for reuse.
 */
function reviewedCoordinatorHashes(
	settingsHash: string,
	profile: WorkbenchThreadProfile,
): CoordinatorReviewHashes {
	const tools = createVoiceToolset(profile.identity);
	return Object.freeze({
		instructionHash: profile.instructions.sha256,
		catalogueHash: profile.manifestHash,
		workhorseCatalogueHash: tools.workhorse.sha256,
		voiceCatalogueHash: tools.voice.sha256,
		settingsHash,
	});
}

/** The JSON scalars settings may hold, each with a single canonical spelling. */
const CANONICAL_SCALARS: ReadonlySet<string> = new Set(["string", "boolean", "number"]);

/**
 * Serialize settings with object keys in sorted order, so the same settings always produce the
 * same bytes and therefore the same digest. A value that is not JSON is refused rather than
 * serialized into something the digest cannot describe.
 * @param value - The settings value.
 * @returns The canonical JSON text.
 * @throws {TypeError} When the settings hold a value JSON cannot represent.
 */
function canonicalJson(value: unknown): string {
	if (value === null || CANONICAL_SCALARS.has(typeof value)) {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.toSorted()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
			.join(",")}}`;
	}
	throw new TypeError("coordinator settings contain a non-JSON value");
}

/**
 * Whether a value is a plain object whose keys can be sorted.
 * @param value - Any value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export { hashCoordinatorSettings, reviewedCoordinatorHashes };
