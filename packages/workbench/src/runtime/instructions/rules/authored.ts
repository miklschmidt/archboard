import {
	composeWorkbenchRoleInstructions,
	readWorkbenchInstructionDocument,
} from "@archboard/codex-realtime-voice/runtime";
import type { VoiceAgentOptions } from "@archboard/codex-realtime-voice/server";
// The executable of a release carries these documents, so they are embedded, not read by path.
import workhorseDocument from "#runtime/instructions/rules/workhorse-developer-instructions.txt" with { type: "text" };
import coordinatorDocument from "#runtime/instructions/rules/coordinator-developer-instructions.txt" with { type: "text" };
type AuthoredInstructionName = keyof VoiceAgentOptions["instructions"];
const DOMAIN_DOCUMENTS = Object.freeze({
	workhorse: {
		text: workhorseDocument,
		sha256: "4bd75a40ef7f37669b9e2964787c35d4113c07be38f5112ebb42cbe304199e52",
	},
	coordinator: {
		text: coordinatorDocument,
		sha256: "0ef63ca63aad6adaf1d1612fee70d440d5db58376d063e430405d7047df19ae2",
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
