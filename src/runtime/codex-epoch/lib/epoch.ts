import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
	buildManifest,
	decodeManifest,
	emptyManifest,
	encodeManifest,
	manifestBytesHash,
} from "./manifest.js";
import {
	defaultCodexEpochFileSystem,
	ensureEpochDirectory,
	readManifestText,
	writeFileAtomic,
} from "./storage.js";
import { CodexEpochError } from "./contract.js";
import { assertSafeStorageRoots } from "./path-safety.js";
import type { EpochManifest, EpochOperationRecord } from "./manifest.js";
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
} from "./contract.js";
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
} from "./validation.js";
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

	const snapshot = (): EpochSnapshot => {
		assertOpen();
		const state = readDisk();
		return {
			manifest: state.manifest,
			cas: { revision: state.manifest.revision, bytesHash: state.bytesHash },
			manifestPath,
		};
	};

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
				result: (manifest) =>
					Object.freeze({
						record,
						cas: casFor(manifest, manifestBytesHash(encodeManifest(manifest))),
					}),
			};
		});
	};

	const stageEpoch = (input: EpochStageInput): EpochTransaction => {
		if (input.kind !== EPOCH_START_KIND) {
			throw epochError("invalid_input", "epoch staging must use kind epoch_start");
		}
		return stageOperation(input);
	};

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
			const activeEpoch =
				record.operation.kind === EPOCH_START_KIND
					? {
							childId: record.correlation.childId,
							epoch: record.correlation.epoch,
							operationId: record.correlation.operationId,
						}
					: current.manifest.activeEpoch;
			return {
				payload: {
					activeEpoch,
					records: replaceRecord(current.manifest.records, committed),
				},
				result: () => committed,
			};
		});
	};

	const commitEpoch = (
		transaction: EpochTransaction,
		confirmation?: EpochConfirmation,
	): EpochOperationRecord => {
		if (transaction.record.operation.kind !== EPOCH_START_KIND) {
			throw epochError("invalid_input", "epoch commit requires an epoch_start transaction");
		}
		return commitOperation(transaction, confirmation);
	};

	const startEpoch = (input: EpochStageInput): EpochOperationRecord =>
		commitEpoch(stageEpoch(input));

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
				result: () => rolledBack,
			};
		});
	};

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
				result: () => unknown,
			};
		});
	};

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
			if (record.operation.kind !== EPOCH_START_KIND) {
				assertCurrentGeneration(current.manifest, record.correlation);
			} else if (
				current.manifest.activeEpoch !== null &&
				(current.manifest.activeEpoch.childId !== record.correlation.childId ||
					current.manifest.activeEpoch.epoch !== record.correlation.epoch)
			) {
				throw epochError("stale_child", "an older epoch cannot be confirmed after replacement");
			}
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
			const activeEpoch =
				record.operation.kind === EPOCH_START_KIND
					? {
							childId: record.correlation.childId,
							epoch: record.correlation.epoch,
							operationId: record.correlation.operationId,
						}
					: current.manifest.activeEpoch;
			return {
				payload: {
					activeEpoch,
					records: replaceRecord(current.manifest.records, confirmed),
				},
				result: () => confirmed,
			};
		});
	};

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
		if (record.correlation.childId !== prepared.childId) {
			throw epochError("stale_child", "the operation provenance belongs to a replaced child");
		}
		if (record.correlation.epoch !== prepared.epoch) {
			throw epochError("prior_epoch", "the operation provenance belongs to a prior epoch");
		}
		if (record.status === "inspect_only") {
			throw epochError(
				"inspect_only",
				`operation ${prepared.operationId} is inspect-only after an uncertain outcome`,
			);
		}
		if (record.status !== "committed" || record.outcome !== "delivered") {
			throw epochError(
				"not_executable",
				`operation ${prepared.operationId} is not executable in its current state`,
			);
		}
		assertExecutionThread(record, prepared.threadId);
		assertThreadProvenanceEligible(current.manifest, record, record.provenance.threadId);
		return { record, manifestRevision: current.manifest.revision };
	};

	const canExecute = (request: EpochExecutionRequest): boolean => {
		try {
			assertCurrent(request);
			return true;
		} catch {
			return false;
		}
	};

	const close = (): void => void (closed = true);

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

	// Every operation is synchronous and the server is one process, so writes
	// are serialised by the call stack; there is no lock and nothing to wait on.
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

function storageError(message: string, cause: unknown): CodexEpochError {
	return cause instanceof CodexEpochError ? cause : epochError("storage_failure", message, cause);
}
