import { CORE_ROLE_INSTRUCTIONS } from "#runtime/rules/host/authored.ts";
import {
	assertWorkbenchThreadTools,
	isReservedWorkbenchNamespace,
} from "#runtime/rules/host/tools.ts";
import { cloneAndFreeze } from "#runtime/rules/host/immutability.ts";
import { coordinatorDynamicTools } from "#runtime/rules/host/tools.ts";
import { ARCHBOARD_COORDINATOR_NAMESPACE } from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { VoiceAgentIdentity } from "#runtime/protocol/host/identity.ts";
import type {
	WorkbenchDynamicTools,
	WorkbenchInstructions,
	WorkbenchRoleInstructions,
	WorkbenchThreadProfile,
} from "#runtime/protocol/host/instructions.ts";

// Compose without trimming or normalizing any host bytes, then hash exactly what Codex receives.
/**
 * Join core and host instruction bytes without normalization and hash the exact result.
 * @param role The built-in role whose instructions are composed.
 * @param domain The exact host instruction text.
 * @returns The exact composed text and its SHA-256 digest.
 */
function composeWorkbenchRoleInstructions(
	role: keyof typeof CORE_ROLE_INSTRUCTIONS,
	domain: string,
): WorkbenchRoleInstructions {
	const core = CORE_ROLE_INSTRUCTIONS[role];
	const text = `${core}\n${domain}`;
	return Object.freeze({ text, sha256: createHash("sha256").update(text, "utf8").digest("hex") });
}

// Copy tools at the installation boundary so later host mutation cannot alter reviewed evidence.
/**
 * Bind host instructions and tools to immutable built-in coordination rules.
 * @param input The captured input and its operation identity.
 * @param input.identity How the host names itself to Codex; both profiles of a host share it.
 * @param input.role The role value.
 * @param input.domainInstructions The domainInstructions value.
 * @param input.dynamicTools The dynamicTools value.
 * @returns The immutable host profile with its built-in coordination tools.
 */
function createWorkbenchThreadProfile(input: {
	readonly identity: VoiceAgentIdentity;
	readonly role: "coordinator" | "workhorse";
	readonly domainInstructions: string;
	readonly dynamicTools: WorkbenchDynamicTools;
}): WorkbenchThreadProfile {
	const identity: VoiceAgentIdentity = Object.freeze({
		serviceName: input.identity.serviceName,
		threadSource: input.identity.threadSource,
	});
	if ([identity.serviceName, identity.threadSource, input.domainInstructions].some((value) => !value)) {
		throw new TypeError("A workbench role requires app identity and domain instructions.");
	}
	const builtIns =
		input.role === "coordinator" ? coordinatorDynamicTools() : [ARCHBOARD_COORDINATOR_NAMESPACE];
	if (input.dynamicTools.some((tool) => isReservedWorkbenchNamespace(tool.name)))
		throw new TypeError("Host tools cannot replace workbench coordination tools.");
	const dynamicTools = cloneAndFreeze(
		input.role === "coordinator"
			? [...builtIns, ...input.dynamicTools]
			: [...input.dynamicTools, ...builtIns],
	);
	assertWorkbenchThreadTools(dynamicTools, input.role);
	return Object.freeze({
		identity,
		instructions: composeWorkbenchRoleInstructions(input.role, input.domainInstructions),
		dynamicTools,
		manifestHash: createHash("sha256").update(JSON.stringify(dynamicTools), "utf8").digest("hex"),
	});
}

// Capture exact profile bytes once. Hashes are evidence, not caller assertions.
/**
 * Capture an independent profile and reject instruction or tool hash drift.
 * @param profile The immutable exact thread profile.
 * @param role The known role, when its required built-ins must be present.
 * @returns The independent immutable profile with proven byte digests.
 */
function captureThreadProfile(
	profile: WorkbenchThreadProfile,
	role?: "coordinator" | "workhorse",
): WorkbenchThreadProfile {
	const captured = cloneAndFreeze(profile);
	assertWorkbenchThreadTools(captured.dynamicTools, role);
	if (
		role !== undefined &&
		!captured.instructions.text.startsWith(`${CORE_ROLE_INSTRUCTIONS[role]}\n`)
	) {
		throw new TypeError(`The ${role} profile must retain its core role instructions.`);
	}
	if (
		createHash("sha256").update(captured.instructions.text, "utf8").digest("hex") !==
			captured.instructions.sha256 ||
		createHash("sha256").update(JSON.stringify(captured.dynamicTools), "utf8").digest("hex") !==
			captured.manifestHash
	) {
		throw new TypeError(
			"The workbench thread profile does not match its instruction or tool hash.",
		);
	}
	return captured;
}
/**
 * Capture both role profiles of a host and refuse two that name the host differently: the
 * coordinator and its workhorses are one voice agent, and Codex must see one identity on both.
 * @param instructions The host's coordinator and workhorse profiles.
 * @returns The independent immutable profiles, each with proven byte digests.
 * @throws {TypeError} When a profile drifted or the two profiles carry different identities.
 */
function captureWorkbenchInstructions(instructions: WorkbenchInstructions): WorkbenchInstructions {
	const coordinator = captureThreadProfile(instructions.coordinator, "coordinator");
	const workhorse = captureThreadProfile(instructions.workhorse, "workhorse");
	if (!isDeepStrictEqual(coordinator.identity, workhorse.identity)) {
		throw new TypeError(
			"The coordinator and workhorse profiles must carry the same identity; build both with one identity.",
		);
	}
	return Object.freeze({ coordinator, workhorse });
}

export {
	createWorkbenchThreadProfile,
	captureThreadProfile,
	captureWorkbenchInstructions,
	composeWorkbenchRoleInstructions,
};
