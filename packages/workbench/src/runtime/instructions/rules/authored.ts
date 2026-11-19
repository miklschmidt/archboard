import { composeRoleInstructions, type VoiceAgentOptions } from "@archboard/codex-realtime-voice/server";
// The executable of a release carries these documents, so they are embedded, not read by path.
import workhorseDocument from "#runtime/instructions/rules/workhorse-developer-instructions.txt" with { type: "text" };
import coordinatorDocument from "#runtime/instructions/rules/coordinator-developer-instructions.txt" with { type: "text" };

/** Archboard's own document for each role, with the SHA-256 it was reviewed at. */
const DOMAIN_DOCUMENTS = Object.freeze({
	workhorse: {
		text: workhorseDocument,
		sha256: "4148e5d057abedea90f6a04582de9ff5c2e83236eb06ec96693eaaef08030907",
	},
	coordinator: {
		text: coordinatorDocument,
		sha256: "25f0f2e313c24342ca3eaaeb40f9e33e3f75de49f7238252d5bb9867c09f2b3e",
	},
} satisfies Record<keyof NonNullable<VoiceAgentOptions["instructions"]>, unknown>);
// Composing both roles proves each document's digest once, when the module loads.
const workhorse = composeRoleInstructions("workhorse", DOMAIN_DOCUMENTS.workhorse);
composeRoleInstructions("coordinator", DOMAIN_DOCUMENTS.coordinator);
const WORKHORSE_DOMAIN_INSTRUCTIONS = DOMAIN_DOCUMENTS.workhorse.text;
const COORDINATOR_DOMAIN_INSTRUCTIONS = DOMAIN_DOCUMENTS.coordinator.text;
const WORKHORSE_DEVELOPER_INSTRUCTIONS = workhorse.text;
const WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256 = workhorse.sha256;
export {
	WORKHORSE_DOMAIN_INSTRUCTIONS,
	COORDINATOR_DOMAIN_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
};
