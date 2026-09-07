import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
	buildManifest,
	decodeManifest,
	emptyManifest,
	encodeManifest,
	manifestBytesHash,
} from "@/runtime/codex-epoch/lib/manifest";
import {
	defaultCodexEpochFileSystem,
	ensureEpochDirectory,
	readManifestText,
	writeFileAtomic,
} from "@/runtime/codex-epoch/lib/storage";
import { CodexEpochError } from "@/runtime/codex-epoch/lib/contract";
import { assertSafeStorageRoots } from "@/runtime/codex-epoch/lib/path-safety";
import type { EpochManifest, EpochOperationRecord } from "@/runtime/codex-epoch/lib/manifest";
import type {
	CodexEpochStore,
	CodexEpochStoreOptions,
	DiskState,
	EpochCasToken,
	EpochConfirmation,
	EpochExecutionProof,
	EpochExecutionRequest,
	EpochSnapshot,
	EpochStageInput,
	EpochTransaction,
	Mutation,
} from "@/runtime/codex-epoch/lib/contract";
import {
	EPOCH_START_KIND,
	assertCurrentGeneration,
	assertExactConfirmation,
	assertExecutionThread,
	assertManifestRelations,
	assertStageGeneration,
	assertThreadProvenanceEligible,
	casFor,
	casForState,
	committedProvenance,
	findRecord,
	findStagedRecord,
	freezeRecord,
	epochError,
	normalizeRoot,
	prepareCas,
	prepareExecutionRequest,
	prepareInput,
	prepareReason,
	replaceRecord,
	sameCas,
	sameRecordInput,
	timestamp,
	uncertainProvenance,
} from "@/runtime/codex-epoch/lib/validation";
/**
 * Create the durable epoch ledger: the record of which child epoch owns which thread, kept
 * outside both Codex storage roots so Codex can never rewrite Archboard's own evidence.
 * @param options - Where the ledger lives, the Codex roots it must avoid, and its seams.
 * @returns The store.
 */
export function createCodexEpochStore(options: CodexEpochStoreOptions): CodexEpochStore {
	const fileSystem = options.fileSystem ?? defaultCodexEpochFileSystem;
	const rootDirectory = normalizeRoot(options.rootDirectory);
	assertSafeStorageRoots(fileSystem, rootDirectory, options.codexHome, options.sqliteHome);
	try {
		ensureEpochDirectory(fileSystem, rootDirectory);
	} catch (error) {
		throw storageError("unable to establish the Archboard-owned epoch root", error);
	}
	const manifestPath = join(rootDirectory, "epoch-manifest.json");
	const now = options.now ?? Date.now;
	let nextTemporaryId = 0;
	let closed = false;

	/**
	 * Read the durable state as it is now.
	 * @returns The manifest, its CAS token and where it lives.
	 */
	const snapshot = (): EpochSnapshot => {
		assertOpen();
		const state = readDisk();
		return {
			manifest: state.manifest,
			cas: { revision: state.manifest.revision, bytesHash: state.bytesHash },
			manifestPath,
		};
	};

	/**
	 * Record an operation as staged before it is attempted, so an attempt that never settles
	 * still leaves durable evidence that it was made.
	 * @param input - The operation to stage.
	 * @returns The transaction its settlement is quoted against.
	 */
	const stageOperation = (input: EpochStageInput): EpochTransaction => {
		const prepared = prepareInput(input);
		const expected = input.expected === undefined ? undefined : prepareCas(input.expected);
		return mutate(expected, (current) => {
			if (expected === undefined && current.manifest.activeEpoch !== null) {
				throw epochError(
					"invalid_input",
					"every mutation after epoch startup requires an explicit CAS token",
				);
			}
			assertStageGeneration(current.manifest, prepared);
			if (
				current.manifest.records.some(
					(record) => record.correlation.operationId === prepared.operationId,
				)
			) {
				throw epochError(
					"invalid_transition",
					`operation ${prepared.operationId} has already been recorded`,
				);
			}
			const createdAtMs = timestamp(now(), "createdAtMs");
			const record: EpochOperationRecord = freezeRecord({
				correlation: {
					childId: prepared.childId,
					epoch: prepared.epoch,
					operationId: prepared.operationId,
				},
				operation: {
					id: prepared.operationId,
					kind: prepared.kind,
					rpc: prepared.rpc,
				},
				status: "staged",
				outcome: "pending",
				provenance: {
					childId: prepared.childId,
					epoch: prepared.epoch,
					threadId: null,
					turnId: null,
					threadSource: null,
					workspaceRoot: prepared.workspaceRoot,
					instructionHash: prepared.instructionHash,
					manifestHash: prepared.manifestHash,
					confirmedAtMs: null,
				},
				reason: null,
				createdAtMs,
				updatedAtMs: createdAtMs,
			});
			return {
				payload: {
					activeEpoch: current.manifest.activeEpoch,
					records: [...current.manifest.records, record],
				},
				/**
				 * The staged transaction, quoted against the manifest this write published.
				 * @param manifest - The published manifest.
				 * @returns The transaction its settlement must present.
				 */
				result: (manifest) =>
					Object.freeze({
						record,
						cas: casFor(manifest, manifestBytesHash(encodeManifest(manifest))),
					}),
			};
		});
	};

	/**
	 * Stage the operation that starts a child epoch.
	 * @param input - The epoch start to stage.
	 * @returns The transaction its commit is quoted against.
	 */
	const stageEpoch = (input: EpochStageInput): EpochTransaction => {
		if (input.kind !== EPOCH_START_KIND) {
			throw epochError("invalid_input", "epoch staging must use kind epoch_start");
		}
		return stageOperation(input);
	};

	/**
	 * Settle a staged operation as delivered, recording what it reached.
	 * @param transaction - The staged transaction.
	 * @param confirmation - What was observed, when anything.
	 * @returns The committed record.
	 */
	const commitOperation = (
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord => {
		return mutate(transaction.cas, (current) => {
			const record = findStagedRecord(current.manifest, transaction);
			if (record.operation.kind !== EPOCH_START_KIND) {
				assertCurrentGeneration(current.manifest, record.correlation);
			}
			const provenance = committedProvenance(record, confirmation, now);
			assertThreadProvenanceEligible(current.manifest, record, provenance.threadId);
			const committed = freezeRecord({
				...record,
				status: "committed",
				outcome: "delivered",
				provenance,
				reason: record.operation.kind === EPOCH_START_KIND ? "epoch committed" : "effect confirmed",
				updatedAtMs: timestamp(now(), "updatedAtMs", record.createdAtMs),
			});
			return {
				payload: {
					activeEpoch: activeEpochAfter(record, current.manifest.activeEpoch),
					records: replaceRecord(current.manifest.records, committed),
				},
				/**
				 * The committed record, which does not depend on the published manifest.
				 * @returns The committed record.
				 */
				result: () => committed,
			};
		});
	};

	/**
	 * Settle a staged epoch start, which makes that child epoch the active one.
	 * @param transaction - The staged epoch-start transaction.
	 * @param confirmation - What was observed, when anything.
	 * @returns The committed record.
	 */
	const commitEpoch = (
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord => {
		if (transaction.record.operation.kind !== EPOCH_START_KIND) {
			throw epochError("invalid_input", "epoch commit requires an epoch_start transaction");
		}
		return commitOperation(transaction, confirmation);
	};

	/**
	 * Stage and commit a child epoch in one step, for a start that cannot fail in between.
	 * @param input - The epoch start.
	 * @returns The committed record.
	 */
	const startEpoch = (input: EpochStageInput): EpochOperationRecord =>
		commitEpoch(stageEpoch(input));

	/**
	 * Settle a staged operation that provably never reached Codex.
	 * @param transaction - The staged transaction.
	 * @param reason - Why it was rolled back.
	 * @returns The rolled-back record.
	 */
	const rollbackOperation = (
		transaction: EpochTransaction,
		reason: string,
	): EpochOperationRecord => {
		const normalizedReason = prepareReason(reason);
		return mutate(transaction.cas, (current) => {
			const record = findStagedRecord(current.manifest, transaction);
			const rolledBack = freezeRecord({
				...record,
				status: "rolled_back",
				outcome: "not_delivered",
				reason: normalizedReason,
				updatedAtMs: timestamp(now(), "updatedAtMs", record.createdAtMs),
			});
			return {
				payload: {
					activeEpoch: current.manifest.activeEpoch,
					records: replaceRecord(current.manifest.records, rolledBack),
				},
				/**
				 * The rolled-back record, which does not depend on the published manifest.
				 * @returns The rolled-back record.
				 */
				result: () => rolledBack,
			};
		});
	};

	/**
	 * Settle a staged operation whose outcome cannot be established, which makes anything it
	 * may have touched inspect-only until an exact confirmation arrives.
	 * @param transaction - The staged transaction.
	 * @param reason - Why the outcome is unknown.
	 * @param confirmation - Whatever was observed, when anything.
	 * @returns The inspect-only record.
	 */
	const markOutcomeUnknown = (
		transaction: EpochTransaction,
		reason: string,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord => {
		const normalizedReason = prepareReason(reason);
		return mutate(transaction.cas, (current) => {
			const record = findStagedRecord(current.manifest, transaction);
			const unknown = freezeRecord({
				...record,
				status: "inspect_only",
				outcome: "outcome_unknown",
				provenance: uncertainProvenance(record, confirmation),
				reason: normalizedReason,
				updatedAtMs: timestamp(now(), "updatedAtMs", record.createdAtMs),
			});
			return {
				payload: {
					activeEpoch: current.manifest.activeEpoch,
					records: replaceRecord(current.manifest.records, unknown),
				},
				/**
				 * The inspect-only record, which does not depend on the published manifest.
				 * @returns The inspect-only record.
				 */
				result: () => unknown,
			};
		});
	};

	/**
	 * Promote an inspect-only record to committed once an exact correlation proves what it
	 * reached, which is the only way an unknown outcome becomes executable again.
	 * @param transaction - The transaction the record belongs to.
	 * @param confirmation - The exact correlation observed.
	 * @returns The committed record.
	 */
	const confirmOutcome = (
		transaction: EpochTransaction,
		confirmation: EpochConfirmation,
	): EpochOperationRecord => {
		return mutate(undefined, (current) => {
			const record = findRecord(current.manifest, transaction);
			if (!sameRecordInput(record, transaction.record)) {
				throw epochError("conflict", "confirmation correlation does not match the durable record");
			}
			if (record.status !== "inspect_only" || record.outcome !== "outcome_unknown") {
				throw epochError("invalid_transition", "only an outcome_unknown record can be confirmed");
			}
			assertConfirmableGeneration(current.manifest, record);
			const provenance = committedProvenance(record, confirmation, now);
			assertExactConfirmation(record.provenance, provenance);
			assertThreadProvenanceEligible(current.manifest, record, provenance.threadId);
			const confirmed = freezeRecord({
				...record,
				status: "committed",
				outcome: "delivered",
				provenance,
				reason: "effect confirmed by exact correlation",
				updatedAtMs: timestamp(now(), "updatedAtMs", record.createdAtMs),
			});
			return {
				payload: {
					activeEpoch: activeEpochAfter(record, current.manifest.activeEpoch),
					records: replaceRecord(current.manifest.records, confirmed),
				},
				/**
				 * The confirmed record, which does not depend on the published manifest.
				 * @returns The confirmed record.
				 */
				result: () => confirmed,
			};
		});
	};

	/**
	 * Prove that an operation is committed, delivered, and owned by the active child epoch,
	 * which is what a caller must hold before acting on the thread it created.
	 * @param request - The identity to prove.
	 * @returns The proof, naming the record and the manifest revision it was read at.
	 */
	const assertCurrent = (request: EpochExecutionRequest): EpochExecutionProof => {
		const prepared = prepareExecutionRequest(request);
		const current = readDisk();
		assertCurrentGeneration(current.manifest, {
			childId: prepared.childId,
			epoch: prepared.epoch,
			operationId: prepared.operationId,
		});
		const record = current.manifest.records.find(
			(candidate) => candidate.correlation.operationId === prepared.operationId,
		);
		if (record === undefined) {
			throw epochError(
				"unknown_provenance",
				`operation ${prepared.operationId} has no durable provenance`,
			);
		}
		assertRecordGeneration(record, prepared.childId, prepared.epoch);
		assertRecordExecutable(record, prepared.operationId);
		assertExecutionThread(record, prepared.threadId);
		assertThreadProvenanceEligible(current.manifest, record, record.provenance.threadId);
		return { record, manifestRevision: current.manifest.revision };
	};

	/**
	 * Whether an identity would prove current, without raising the reason it would not.
	 * @param request - The identity to test.
	 * @returns True when the proof would succeed.
	 */
	const canExecute = (request: EpochExecutionRequest): boolean => {
		try {
			assertCurrent(request);
			return true;
		} catch {
			return false;
		}
	};

	/** Close the store; every later operation is refused. */
	const close = (): void => {
		closed = true;
	};

	/** Refuse to act through a store that has been closed. */
	function assertOpen(): void {
		if (closed) {
			throw epochError("closed", "codex epoch store is closed");
		}
	}

	/**
	 * A missing, unreadable, malformed, non-canonical or internally inconsistent
	 * manifest reads as "no prior epochs". Every thread from before is then
	 * inspect-only and the next write replaces the file, which is the safe
	 * direction for a ledger whose only job is to refuse resuming older threads.
	 * @returns The manifest on disk with the digest of its bytes, or an empty manifest.
	 */
	function readDisk(): DiskState {
		const raw = readManifestText(fileSystem, manifestPath);
		if (raw === null) {
			return { manifest: emptyManifest(), bytesHash: null };
		}
		try {
			const manifest = decodeManifest(raw);
			assertManifestRelations(manifest);
			return { manifest, bytesHash: manifestBytesHash(raw) };
		} catch {
			return { manifest: emptyManifest(), bytesHash: null };
		}
	}

	/**
	 * Read, transform and publish the durable state under an optional compare-and-swap.
	 * Every operation is synchronous and the server is one process, so writes are serialised
	 * by the call stack; there is no lock and nothing to wait on.
	 * @param expected - The state the caller believes is on disk, when it holds a token.
	 * @param action - Produces the next payload and the caller's result.
	 * @returns Whatever the action's result produced from the published manifest.
	 */
	function mutate<T>(
		expected: EpochCasToken | undefined,
		action: (current: DiskState) => Mutation<T>,
	): T {
		assertOpen();
		const current = readDisk();
		if (expected !== undefined && !sameCas(expected, casForState(current))) {
			throw epochError(
				"conflict",
				`epoch CAS conflict: expected revision ${expected.revision}, found ${current.manifest.revision}`,
			);
		}
		const mutation = action(current);
		const next = buildManifest({
			schema: 1,
			revision: current.manifest.revision + 1,
			activeEpoch: mutation.payload.activeEpoch,
			records: mutation.payload.records,
		});
		assertManifestRelations(next);
		writeState(next);
		return mutation.result(next);
	}

	/**
	 * Publish a manifest through one temporary file and a rename, under a name no concurrent
	 * writer in this process can collide with.
	 * @param manifest - The manifest to publish.
	 */
	function writeState(manifest: EpochManifest): void {
		const temporaryPath = join(
			rootDirectory,
			`.epoch-manifest.${process.pid}.${nextTemporaryId++}.${randomUUID()}.tmp`,
		);
		try {
			writeFileAtomic(fileSystem, manifestPath, temporaryPath, encodeManifest(manifest));
		} catch (error) {
			throw storageError("epoch manifest write failed", error);
		}
	}

	return {
		rootDirectory,
		manifestPath,
		snapshot,
		stageEpoch,
		startEpoch,
		commitEpoch,
		stageOperation,
		commitOperation,
		rollbackOperation,
		markOutcomeUnknown,
		confirmOutcome,
		assertCurrent,
		canExecute,
		close,
	};
}

/**
 * Refuse a proof for a record that belongs to a replaced child or a prior epoch.
 * @param record - The durable record.
 * @param childId - The child the caller claims.
 * @param epoch - The epoch the caller claims.
 */
function assertRecordGeneration(
	record: EpochOperationRecord,
	childId: EpochOperationRecord["correlation"]["childId"],
	epoch: EpochOperationRecord["correlation"]["epoch"],
): void {
	if (record.correlation.childId !== childId) {
		throw epochError("stale_child", "the operation provenance belongs to a replaced child");
	}
	if (record.correlation.epoch !== epoch) {
		throw epochError("prior_epoch", "the operation provenance belongs to a prior epoch");
	}
}

/**
 * Refuse a proof for a record that did not settle as delivered: an inspect-only record says
 * so by name, and anything else is simply not executable yet.
 * @param record - The durable record.
 * @param operationId - The operation, for the refusal message.
 */
function assertRecordExecutable(record: EpochOperationRecord, operationId: string): void {
	if (record.status === "inspect_only") {
		throw epochError(
			"inspect_only",
			`operation ${operationId} is inspect-only after an uncertain outcome`,
		);
	}
	if (record.status !== "committed" || record.outcome !== "delivered") {
		throw epochError(
			"not_executable",
			`operation ${operationId} is not executable in its current state`,
		);
	}
}

/**
 * The active epoch after a record settles: an epoch start becomes the active epoch, and any
 * other operation leaves it as it was.
 * @param record - The record that just settled.
 * @param current - The active epoch before it settled.
 * @returns The active epoch to publish.
 */
function activeEpochAfter(
	record: EpochOperationRecord,
	current: EpochManifest["activeEpoch"],
): EpochManifest["activeEpoch"] {
	if (record.operation.kind !== EPOCH_START_KIND) {
		return current;
	}
	return {
		childId: record.correlation.childId,
		epoch: record.correlation.epoch,
		operationId: record.correlation.operationId,
	};
}

/**
 * Refuse to confirm a record the current generation no longer admits: an ordinary operation
 * must belong to the active epoch, and an epoch start cannot be confirmed once replaced.
 * @param manifest - The durable manifest.
 * @param record - The record being confirmed.
 */
function assertConfirmableGeneration(manifest: EpochManifest, record: EpochOperationRecord): void {
	if (record.operation.kind !== EPOCH_START_KIND) {
		assertCurrentGeneration(manifest, record.correlation);
		return;
	}
	const active = manifest.activeEpoch;
	if (
		active !== null &&
		(active.childId !== record.correlation.childId || active.epoch !== record.correlation.epoch)
	) {
		throw epochError("stale_child", "an older epoch cannot be confirmed after replacement");
	}
}

/**
 * Report a storage failure, keeping an epoch error that already says something more precise.
 * @param message - What could not be done.
 * @param cause - The underlying failure.
 * @returns The error to raise.
 */
function storageError(message: string, cause: unknown): CodexEpochError {
	return cause instanceof CodexEpochError ? cause : epochError("storage_failure", message, cause);
}
