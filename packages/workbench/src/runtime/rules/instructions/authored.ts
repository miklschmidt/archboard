import {
	composeWorkbenchRoleInstructions,
	readWorkbenchInstructionDocument,
} from "@archboard/codex-realtime-voice/runtime";
import type { VoiceAgentOptions } from "@archboard/codex-realtime-voice/server";
// The executable of a release carries these documents, so they are embedded, not read by path.
import workhorseDocument from "#runtime/rules/instructions/workhorse-developer-instructions.txt" with { type: "text" };
import coordinatorDocument from "#runtime/rules/instructions/coordinator-developer-instructions.txt" with { type: "text" };
type AuthoredInstructionName = keyof VoiceAgentOptions["instructions"];
const DOMAIN_DOCUMENTS = Object.freeze({
	workhorse: {
		text: workhorseDocument,
		sha256: "4148e5d057abedea90f6a04582de9ff5c2e83236eb06ec96693eaaef08030907",
	},
	coordinator: {
		text: coordinatorDocument,
		sha256: "25f0f2e313c24342ca3eaaeb40f9e33e3f75de49f7238252d5bb9867c09f2b3e",
	},
});
/**
 * Read the domain document with its independently reviewed byte digest.
 * @param name The role whose domain document is read.
 * @returns The domain instruction bytes.
 */
function domainInstructions(name: AuthoredInstructionName): string {
	return readWorkbenchInstructionDocument(
		DOMAIN_DOCUMENTS[name].text,
		`${name} Archboard instructions`,
		DOMAIN_DOCUMENTS[name].sha256,
	);
}
const WORKHORSE_DOMAIN_INSTRUCTIONS = domainInstructions("workhorse");
const COORDINATOR_DOMAIN_INSTRUCTIONS = domainInstructions("coordinator");
const workhorse = composeWorkbenchRoleInstructions("workhorse", WORKHORSE_DOMAIN_INSTRUCTIONS);
const WORKHORSE_DEVELOPER_INSTRUCTIONS = workhorse.text;
const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 = workhorse.sha256;
export {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
};
