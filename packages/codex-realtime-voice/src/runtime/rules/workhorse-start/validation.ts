import type { WorkbenchThreadProfile } from "#runtime/protocol/host/instructions.ts";
import type { EpochExecutionProof } from "#runtime/store/epoch/contract.ts";
import type { EpochOperationRecord } from "#runtime/store/epoch/manifest-contract.ts";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "#runtime/rules/thread-link/contract.ts";
import type {
	ChildEpoch,
	ChildId,
	OperationId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import {
	WORKHORSE_CLEANUP_OPERATION_KIND,
	WORKHORSE_CLEANUP_RPC,
	WORKHORSE_OPERATION_KIND,
	WORKHORSE_RPC,
	WORKHORSE_THREAD_SOURCE,
} from "#runtime/rules/workhorse-start/model.ts";
import type {
	CodexWorkhorseStartOptions,
	WorkhorseStartFacts,
	WorkhorseStartResponse,
	WorkhorseThread,
} from "#runtime/protocol/workhorse-start/contract.ts";
import { cloneAndFreeze } from "#runtime/rules/host/immutability.ts";

interface ValidatedWorkhorseStart {
	readonly thread: WorkhorseThread;
	readonly threadId: ThreadId;
	readonly facts: WorkhorseStartFacts;
}

/**
 * Every field of a thread/start response that must match the authored workhorse profile, named so
 * a refusal can say exactly which ones did not. The decoded response already proves each field is
 * present; these checks prove it holds the value Archboard asked for.
 * @param response - The decoded thread/start response.
 * @param options - The start options carrying the checkout root.
 * @param threadId - The thread identity adopted from the response.
 * @returns One entry per field, true where the field does not match.
 */
function startProfileMismatches(
	response: WorkhorseStartResponse,
	options: CodexWorkhorseStartOptions,
	threadId: ThreadId,
): Readonly<Record<string, boolean>> {
	return {
		"thread.id": response.thread.id !== threadId,
		model: response.model.length === 0,
		modelProvider: response.modelProvider.length === 0,
		"thread.modelProvider": response.thread.modelProvider !== response.modelProvider,
		serviceTier: response.serviceTier?.length === 0,
		cwd: response.cwd !== options.checkoutRoot,
		runtimeWorkspaceRoots:
			response.runtimeWorkspaceRoots.length !== 1 ||
			response.runtimeWorkspaceRoots[0] !== options.checkoutRoot,
		"thread.cwd": response.thread.cwd !== options.checkoutRoot,
		"thread.historyMode": response.thread.historyMode !== "paginated",
		"thread.source": response.thread.source !== WORKHORSE_THREAD_SOURCE,
		"thread.threadSource": response.thread.threadSource !== options.profile.identity.threadSource,
		"thread.ephemeral": response.thread.ephemeral,
		activePermissionProfile: !Object.hasOwn(response, "activePermissionProfile"),
	};
}

/**
 * Prove a thread/start response is the workhorse Archboard authored, and reduce it to the facts
 * the pane keeps. A response that differs anywhere is refused whole: a workhorse that is not the
 * authored profile is not one Archboard will drive.
 * @param response - The decoded thread/start response.
 * @param options - The start options carrying the identity authority and checkout root.
 * @returns The thread, its adopted identity and the start facts.
 * @throws {Error} When any field does not match the authored profile.
 */
function validateWorkhorseStartResponse(
	response: WorkhorseStartResponse,
	options: CodexWorkhorseStartOptions,
): ValidatedWorkhorseStart {
	const threadId = options.identity.decoder.parseThreadId(response.thread.id);
	const mismatches = Object.entries(startProfileMismatches(response, options, threadId))
		.filter(([, mismatched]) => mismatched)
		.map(([field]) => field);
	if (mismatches.length > 0) {
		throw new Error(
			`The workhorse thread/start response does not match the authored profile: ${mismatches.join(", ")}.`,
		);
	}

	const facts: WorkhorseStartFacts = cloneAndFreeze({
		threadId,
		cwd: response.cwd,
		runtimeWorkspaceRoots: [...response.runtimeWorkspaceRoots],
		historyMode: "paginated",
		source: WORKHORSE_THREAD_SOURCE,
		threadSource: options.profile.identity.threadSource,
		model: response.model,
		modelProvider: response.modelProvider,
		serviceTier: response.serviceTier,
		approvalPolicy: response.approvalPolicy,
		approvalsReviewer: response.approvalsReviewer,
		sandbox: response.sandbox,
		activePermissionProfile: response.activePermissionProfile,
		instructionHash: options.profile.instructions.sha256,
		manifestHash: options.profile.manifestHash,
	});
	return Object.freeze({ thread: cloneAndFreeze(response.thread), threadId, facts });
}

/** The operation one committed epoch record must describe. */
interface ExpectedWorkhorseOperation {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: OperationId;
	readonly threadId: ThreadId;
	readonly checkoutRoot: string;
	readonly profile: WorkbenchThreadProfile;
	/** The operation kind the record must name. */
	readonly kind: string;
	/** The wire RPC the record must name. */
	readonly rpc: string;
}

/**
 * Whether a durable epoch record is the committed, delivered proof of one workhorse operation on
 * this child, thread and checkout, authored from these exact instructions and tool manifest.
 * Every field is checked, because a record that agrees only in part proves nothing.
 * @param record - The durable record.
 * @param expected - The operation the record must describe.
 * @returns True when every field matches.
 */
function isCommittedRecord(
	record: EpochOperationRecord,
	expected: ExpectedWorkhorseOperation,
): boolean {
	const checks = [
		record.correlation.childId === expected.childId,
		record.correlation.epoch === expected.epoch,
		record.correlation.operationId === expected.operationId,
		record.operation.id === expected.operationId,
		record.operation.kind === expected.kind,
		record.operation.rpc === expected.rpc,
		record.status === "committed",
		record.outcome === "delivered",
		record.provenance.childId === expected.childId,
		record.provenance.epoch === expected.epoch,
		record.provenance.threadId === expected.threadId,
		record.provenance.threadSource === WORKHORSE_THREAD_SOURCE,
		record.provenance.workspaceRoot === expected.checkoutRoot,
		record.provenance.instructionHash === expected.profile.instructions.sha256,
		record.provenance.manifestHash === expected.profile.manifestHash,
		record.provenance.confirmedAtMs !== null,
	];
	return checks.every((matched) => matched);
}

/**
 * Whether a record is the committed proof that this workhorse thread was started.
 * @param record - The durable record.
 * @param childId - The Codex child the start ran on.
 * @param epoch - That child's epoch.
 * @param operationId - The start operation identity.
 * @param threadId - The started thread.
 * @param checkoutRoot - The checkout the workhorse was started against.
 * @returns True when the record proves the start.
 * @param profile The host policy for this operation.
 */
function isCommittedStartRecord(
	record: EpochOperationRecord,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	threadId: ThreadId,
	checkoutRoot: string,
	profile: WorkbenchThreadProfile,
): boolean {
	return isCommittedRecord(record, {
		childId,
		epoch,
		operationId,
		threadId,
		checkoutRoot,
		profile,
		kind: WORKHORSE_OPERATION_KIND,
		rpc: WORKHORSE_RPC,
	});
}

/**
 * Whether an execution proof is the committed proof of this workhorse start.
 * @param proof - The epoch execution proof.
 * @param childId - The Codex child the start ran on.
 * @param epoch - That child's epoch.
 * @param operationId - The start operation identity.
 * @param threadId - The started thread.
 * @param checkoutRoot - The checkout the workhorse was started against.
 * @returns True when the proof's record proves the start.
 * @param profile The host policy for this operation.
 */
function isCurrentStartProof(
	proof: EpochExecutionProof,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	threadId: ThreadId,
	checkoutRoot: string,
	profile: WorkbenchThreadProfile,
): boolean {
	return isCommittedStartRecord(
		proof.record,
		childId,
		epoch,
		operationId,
		threadId,
		checkoutRoot,
		profile,
	);
}

/**
 * Whether a record is the committed proof that this workhorse thread was deleted.
 * @param record - The durable record.
 * @param childId - The Codex child the cleanup ran on.
 * @param epoch - That child's epoch.
 * @param operationId - The cleanup operation identity.
 * @param threadId - The deleted thread.
 * @param checkoutRoot - The checkout the workhorse belonged to.
 * @returns True when the record proves the deletion.
 * @param profile The host policy for this operation.
 */
function isCommittedCleanupRecord(
	record: EpochOperationRecord,
	childId: ChildId,
	epoch: ChildEpoch,
	operationId: OperationId,
	threadId: ThreadId,
	checkoutRoot: string,
	profile: WorkbenchThreadProfile,
): boolean {
	return isCommittedRecord(record, {
		childId,
		epoch,
		operationId,
		threadId,
		checkoutRoot,
		profile,
		kind: WORKHORSE_CLEANUP_OPERATION_KIND,
		rpc: WORKHORSE_CLEANUP_RPC,
	});
}

/**
 * Deletion is permitted only for the exact newly-created, empty, idle root this start produced:
 * a thread with a turn, a fork, or a parent is somebody's work, not Archboard's to remove.
 * @param thread - The thread being considered for deletion.
 * @param started - What the start proved about the thread it created.
 * @returns True when the thread is that exact root.
 */
function isExactIdleWorkhorseRoot(
	thread: WorkhorseThread,
	started: ValidatedWorkhorseStart,
): boolean {
	const checks = [
		thread.id === started.threadId,
		thread.cwd === started.facts.cwd,
		thread.modelProvider === started.facts.modelProvider,
		thread.historyMode === started.facts.historyMode,
		thread.source === started.facts.source,
		thread.threadSource === started.facts.threadSource,
		!thread.ephemeral,
		thread.forkedFromId === null,
		thread.parentThreadId === null,
		thread.turns.length === 0,
		thread.status.type === "idle",
	];
	return checks.every((matched) => matched);
}

/**
 * Whether the pane's binding is the executable link to this workhorse thread on this child.
 * `loaded` is not re-checked: an executable link already carries it.
 * @param binding - The pane's thread-link binding.
 * @param paneId - The pane the workhorse belongs to.
 * @param childId - The Codex child it runs on.
 * @param epoch - That child's epoch.
 * @param threadId - The workhorse thread.
 * @returns True when the binding is that executable link.
 */
function isExecutableWorkhorseBinding(
	binding: ThreadLinkBindingSnapshot,
	paneId: string,
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
): boolean {
	const link: ThreadLinkSnapshot = binding.link;
	const checks = [
		binding.paneId === paneId,
		link.state === "executable",
		link.childId === childId,
		link.epoch === epoch,
		link.threadId === threadId,
		link.canAcceptDirectInput,
	];
	return checks.every((matched) => matched);
}

export {
	type ValidatedWorkhorseStart,
	validateWorkhorseStartResponse,
	isCommittedStartRecord,
	isCurrentStartProof,
	isCommittedCleanupRecord,
	isExactIdleWorkhorseRoot,
	isExecutableWorkhorseBinding,
};
