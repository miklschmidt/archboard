import {
	composeWorkbenchRoleInstructions,
	assertWorkbenchInstructionBytes,
	readWorkbenchInstructionDocument,
} from "@archboard/codex-realtime-voice/runtime";
import type { VoiceAgentOptions } from "@archboard/codex-realtime-voice/server";
type AuthoredInstructionName = keyof VoiceAgentOptions["instructions"];
interface AuthoredInstructionIntegrity {
	readonly workhorseSha256: string;
	readonly coordinatorSha256: string;
}
const DOMAIN_DOCUMENTS = Object.freeze({
	workhorse: "38a867901baadffd41b3b82f65d843e51806d543ad334e4ab51adeca071bf328",
	coordinator: "244de35348dbd91a118acdbefbd3819836babbb5792dc72ed6655ec7e2c6e635",
});
/**
 * Read the domain document with its independently reviewed byte digest.
 * @param name The role whose domain document is read.
 * @returns The domain instruction bytes.
 */
function domainInstructions(name: AuthoredInstructionName): string {
	return readWorkbenchInstructionDocument(
		new URL(import.meta.resolve(`#runtime/rules/instructions/${name}-developer-instructions.txt`)),
		`${name} Archboard instructions`,
		DOMAIN_DOCUMENTS[name],
	);
}
const WORKHORSE_DOMAIN_INSTRUCTIONS = domainInstructions("workhorse");
const COORDINATOR_DOMAIN_INSTRUCTIONS = domainInstructions("coordinator");
const workhorse = composeWorkbenchRoleInstructions("workhorse", WORKHORSE_DOMAIN_INSTRUCTIONS);
const coordinator = composeWorkbenchRoleInstructions(
	"coordinator",
	COORDINATOR_DOMAIN_INSTRUCTIONS,
);
const WORKHORSE_DEVELOPER_INSTRUCTIONS = workhorse.text;
const COORDINATOR_DEVELOPER_INSTRUCTIONS = coordinator.text;
const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 = workhorse.sha256;
const COORDINATOR_DEVELOPER_INSTRUCTIONS_SHA256 = coordinator.sha256;
const AUTHORED_INSTRUCTION_DIGESTS = Object.freeze({
	workhorse: workhorse.sha256,
	coordinator: coordinator.sha256,
});
/**
 * Refuse a complete role document whose composed bytes changed.
 * @param name The role.
 * @param candidate The candidate complete role document.
 */
function assertCanonicalInstructionBytes(
	name: AuthoredInstructionName,
	candidate: string | Uint8Array,
): void {
	assertWorkbenchInstructionBytes(
		candidate,
		`${name} developer instructions`,
		AUTHORED_INSTRUCTION_DIGESTS[name],
	);
}
/**
 * Read and compose both domain documents through the same core instruction owner.
 * @returns The complete role instruction digests.
 */
function verifyAuthoredInstructionIntegrity(): AuthoredInstructionIntegrity {
	return Object.freeze({
		workhorseSha256: composeWorkbenchRoleInstructions("workhorse", domainInstructions("workhorse"))
			.sha256,
		coordinatorSha256: composeWorkbenchRoleInstructions(
			"coordinator",
			domainInstructions("coordinator"),
		).sha256,
	});
}
export {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	COORDINATOR_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	COORDINATOR_DEVELOPER_INSTRUCTIONS_SHA256,
	AUTHORED_INSTRUCTION_DIGESTS,
	assertCanonicalInstructionBytes,
	verifyAuthoredInstructionIntegrity,
	type AuthoredInstructionName,
	type AuthoredInstructionIntegrity,
};
