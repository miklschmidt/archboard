import {
	composeWorkbenchRoleInstructions,
	assertWorkbenchInstructionBytes,
	readWorkbenchInstructionDocument,
} from "@archboard/codex-realtime-voice/runtime";
import type { VoiceAgentOptions } from "@archboard/codex-realtime-voice/server";
type AuthoredInstructionName = keyof VoiceAgentOptions["instructions"];
const DOMAIN_DOCUMENTS = Object.freeze({
	workhorse: "4148e5d057abedea90f6a04582de9ff5c2e83236eb06ec96693eaaef08030907",
	coordinator: "25f0f2e313c24342ca3eaaeb40f9e33e3f75de49f7238252d5bb9867c09f2b3e",
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
const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 = workhorse.sha256;
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
export {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	AUTHORED_INSTRUCTION_DIGESTS,
	assertCanonicalInstructionBytes,
	type AuthoredInstructionName,
};
