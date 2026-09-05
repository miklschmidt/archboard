import { createHash } from "node:crypto";

import {
	COORDINATOR_TOOL_MANIFEST_DIGESTS,
	verifyCoordinatorManifestIntegrity,
} from "../../codex-coordinator-tool-contract/index.js";
import {
	COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
	verifyAuthoredInstructionIntegrity,
} from "../../codex-instructions/index.js";
import type { CoordinatorReviewHashes, CoordinatorSettings } from "./contract.js";

const CATALOGUE_HASH_INPUT = JSON.stringify({
	workhorse: COORDINATOR_TOOL_MANIFEST_DIGESTS.workhorse,
	voice: COORDINATOR_TOOL_MANIFEST_DIGESTS.voice,
});

export const COORDINATOR_CATALOGUE_HASH = createHash("sha256")
	.update(CATALOGUE_HASH_INPUT, "utf8")
	.digest("hex");

export function hashCoordinatorSettings(settings: CoordinatorSettings): string {
	return createHash("sha256").update(canonicalJson(settings), "utf8").digest("hex");
}

export function reviewedCoordinatorHashes(settingsHash: string): CoordinatorReviewHashes {
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

function canonicalJson(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "number") {
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
