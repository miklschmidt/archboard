import {
	composeWorkbenchRoleInstructions,
	assertWorkbenchInstructionBytes,
	readWorkbenchInstructionDocument,
} from "@archboard/agent-workbench/runtime";
import type { WorkbenchInstructions } from "@archboard/agent-workbench/runtime";
type AuthoredInstructionName = keyof WorkbenchInstructions;
interface AuthoredInstructionIntegrity {
	readonly workhorseSha256: string;
	readonly coordinatorSha256: string;
}
const DOMAIN_DOCUMENTS = Object.freeze({
	workhorse: "ab89886ecb7015bad9fe81a726aa6d9711d416920f02817a0a49dee4a659b0a7",
	coordinator: "4d593ba77d22b958deda261dadc4d71ad83c796638d12957055cf016d2b44e2b",
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
