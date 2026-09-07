import { createHash } from "node:crypto";

import {
	COORDINATOR_TOOL_MANIFEST_DIGESTS,
	verifyCoordinatorManifestIntegrity,
} from "@/runtime/codex-coordinator-tool-contract";
import {
	COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
	verifyAuthoredInstructionIntegrity,
} from "@/runtime/codex-instructions";
import type {
	CoordinatorReviewHashes,
	CoordinatorSettings,
} from "@/runtime/codex-coordinator/lib/contract";

const CATALOGUE_HASH_INPUT = JSON.stringify({
	workhorse: COORDINATOR_TOOL_MANIFEST_DIGESTS.workhorse,
	voice: COORDINATOR_TOOL_MANIFEST_DIGESTS.voice,
});

const COORDINATOR_CATALOGUE_HASH = createHash("sha256")
	.update(CATALOGUE_HASH_INPUT, "utf8")
	.digest("hex");

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
 * The hashes that say this coordinator is the reviewed one: its composed instructions, its two
 * tool manifests, the catalogue they form, and its settings. The instruction and manifest digests
 * are re-derived here and compared against the reviewed constants, so a drifted artifact refuses
 * to start a coordinator rather than quietly changing what it is.
 * @param settingsHash - The digest of the coordinator's settings.
 * @returns The frozen review hashes.
 * @throws {Error} When any reviewed digest has drifted.
 */
function reviewedCoordinatorHashes(settingsHash: string): CoordinatorReviewHashes {
	const instruction = verifyAuthoredInstructionIntegrity();
	const manifests = verifyCoordinatorManifestIntegrity();
	if (
		instruction.composedCoordinatorSha256 !== COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256 ||
		manifests.workhorseSha256 !== COORDINATOR_TOOL_MANIFEST_DIGESTS.workhorse ||
		manifests.voiceSha256 !== COORDINATOR_TOOL_MANIFEST_DIGESTS.voice
	) {
		throw new Error("reviewed coordinator instruction or tool-manifest hashes drifted");
	}
	return Object.freeze({
		instructionHash: COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
		catalogueHash: COORDINATOR_CATALOGUE_HASH,
		workhorseCatalogueHash: COORDINATOR_TOOL_MANIFEST_DIGESTS.workhorse,
		voiceCatalogueHash: COORDINATOR_TOOL_MANIFEST_DIGESTS.voice,
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

export { COORDINATOR_CATALOGUE_HASH, hashCoordinatorSettings, reviewedCoordinatorHashes };
