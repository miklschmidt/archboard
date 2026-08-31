import type { EpochExecutionProof, EpochOperationRecord } from "../../codex-epoch/index.js";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "../../codex-thread-link/index.js";
import type {
	ChildEpoch,
	ChildId,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_CLEANUP_RPC,
	WORKHORSE_INSTRUCTION_HASH,
	WORKHORSE_MANIFEST_HASH,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
	WORKHORSE_THREAD_SOURCE,
	WORKHORSE_THREAD_SOURCE_TAG,
} from "./model.js";
import type {
	CodexWorkhorseStartOptions,
	WorkhorseStartFacts,
	WorkhorseStartResponse,
	WorkhorseThread,
} from "./contract.js";
import { cloneAndFreeze } from "./immutability.js";

export interface ValidatedWorkhorseStart {
	readonly thread: WorkhorseThread;
	readonly threadId: ThreadId;
	readonly facts: WorkhorseStartFacts;
}

export function validateWorkhorseStartResponse(
	response: WorkhorseStartResponse,
	options: CodexWorkhorseStartOptions,
): ValidatedWorkhorseStart {
	const threadId = options.identity.decoder.parseThreadId(response.thread.id);
	if (
		response.thread.id !== threadId ||
		response.model.length === 0 ||
		response.modelProvider.length === 0 ||
		response.thread.modelProvider !== response.modelProvider ||
		response.serviceTier?.length === 0 ||
		response.cwd !== options.checkoutRoot ||
		response.runtimeWorkspaceRoots.length !== 1 ||
		response.runtimeWorkspaceRoots[0] !== options.checkoutRoot ||
		response.thread.cwd !== options.checkoutRoot ||
		response.thread.historyMode !== "paginated" ||
		response.thread.source !== WORKHORSE_THREAD_SOURCE ||
		response.thread.threadSource !== WORKHORSE_THREAD_SOURCE_TAG ||
		response.thread.ephemeral ||
		response.approvalPolicy === undefined ||
		response.approvalPolicy === null ||
		response.approvalsReviewer === undefined ||
		response.approvalsReviewer === null ||
		response.sandbox === undefined ||
		response.sandbox === null ||
		!Object.hasOwn(response, "activePermissionProfile")
	) {
		throw new Error("The workhorse thread/start response does not match the authored profile.");
	}

	const facts: WorkhorseStartFacts = cloneAndFreeze({
		threadId,
		cwd: response.cwd,
		runtimeWorkspaceRoots: [...response.runtimeWorkspaceRoots],
		historyMode: "paginated",
		source: WORKHORSE_THREAD_SOURCE,
		threadSource: WORKHORSE_THREAD_SOURCE_TAG,
		model: response.model,
		modelProvider: response.modelProvider,
		serviceTier: response.serviceTier,
		approvalPolicy: response.approvalPolicy,
		approvalsReviewer: response.approvalsReviewer,
		sandbox: response.sandbox,
		activePermissionProfile: response.activePermissionProfile,
		instructionHash: WORKHORSE_INSTRUCTION_HASH,
		manifestHash: WORKHORSE_MANIFEST_HASH,
	});
	return Object.freeze({ thread: cloneAndFreeze(response.thread), threadId, facts });
}

export function isCommittedStartRecord(
	record: EpochOperationRecord,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	threadId: ThreadId,
	checkoutRoot: string,
): boolean {
	return (
		record.correlation.childId === childId &&
		record.correlation.epoch === epoch &&
		record.correlation.operationId === operationId &&
		record.operation.id === operationId &&
		record.operation.kind === WORKHORSE_OPERATION_KIND &&
		record.operation.rpc === WORKHORSE_RPC &&
		record.status === "committed" &&
		record.outcome === "delivered" &&
		record.provenance.childId === childId &&
		record.provenance.epoch === epoch &&
		record.provenance.threadId === threadId &&
		record.provenance.threadSource === WORKHORSE_THREAD_SOURCE &&
		record.provenance.workspaceRoot === checkoutRoot &&
		record.provenance.instructionHash === WORKHORSE_INSTRUCTION_HASH &&
		record.provenance.manifestHash === WORKHORSE_MANIFEST_HASH &&
		record.provenance.confirmedAtMs !== null
	);
}

export function isCurrentStartProof(
	proof: EpochExecutionProof,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	threadId: ThreadId,
	checkoutRoot: string,
): boolean {
	return isCommittedStartRecord(proof.record, childId, epoch, operationId, threadId, checkoutRoot);
}

export function isCommittedCleanupRecord(
	record: EpochOperationRecord,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	threadId: ThreadId,
	checkoutRoot: string,
): boolean {
	return (
		record.correlation.childId === childId &&
		record.correlation.epoch === epoch &&
		record.correlation.operationId === operationId &&
		record.operation.id === operationId &&
		record.operation.kind === WORKHORSE_CLEANUP_OPERATION_KIND &&
		record.operation.rpc === WORKHORSE_CLEANUP_RPC &&
		record.status === "committed" &&
		record.outcome === "delivered" &&
		record.provenance.childId === childId &&
		record.provenance.epoch === epoch &&
		record.provenance.threadId === threadId &&
		record.provenance.threadSource === WORKHORSE_THREAD_SOURCE &&
		record.provenance.workspaceRoot === checkoutRoot &&
		record.provenance.instructionHash === WORKHORSE_INSTRUCTION_HASH &&
		record.provenance.manifestHash === WORKHORSE_MANIFEST_HASH &&
		record.provenance.confirmedAtMs !== null
	);
}

/** Deletion is permitted only for the exact newly-created, empty, idle root. */
export function isExactIdleWorkhorseRoot(
	thread: WorkhorseThread,
	started: ValidatedWorkhorseStart,
): boolean {
	return (
		thread.id === started.threadId &&
		thread.cwd === started.facts.cwd &&
		thread.modelProvider === started.facts.modelProvider &&
		thread.historyMode === started.facts.historyMode &&
		thread.source === started.facts.source &&
		thread.threadSource === started.facts.threadSource &&
		!thread.ephemeral &&
		thread.forkedFromId === null &&
		thread.parentThreadId === null &&
		thread.turns.length === 0 &&
		thread.status.type === "idle"
	);
}

export function isExecutableWorkhorseBinding(
	binding: ThreadLinkBindingSnapshot,
	paneId: string,
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
): boolean {
	const link: ThreadLinkSnapshot = binding.link;
	return (
		binding.paneId === paneId &&
		link.state === "executable" &&
		link.childId === childId &&
		link.epoch === epoch &&
		link.threadId === threadId &&
		link.loaded &&
		link.canAcceptDirectInput
	);
}
