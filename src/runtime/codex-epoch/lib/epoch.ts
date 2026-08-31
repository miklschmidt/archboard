import { join } from "node:path";

import {
	buildManifest,
	decodeManifest,
	emptyManifest,
	encodeManifest,
	manifestBytesHash,
} from "./manifest.js";
import {
	acquireDurableLock,
	defaultCodexEpochFileSystem,
	DurableStorageError,
	ensureEpochDirectory,
	readUtf8File,
	writeEpochStateDurable,
} from "./storage.js";
import { CodexEpochError } from "./contract.js";
import { mapLockError, mapStorageError } from "./errors.js";
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
	assertOutsideCodexStores,
	assertStageGeneration,
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
	assertOutsideCodexStores(rootDirectory, options.codexHome, options.sqliteHome);
	try {
		ensureEpochDirectory(fileSystem, rootDirectory);
	} catch (error) {
		throw mapStorageError(error, "unable to establish the Archboard-owned epoch root");
	}
	const manifestPath = join(rootDirectory, "epoch-manifest.json");
	const recordsPath = join(rootDirectory, "epoch-records.json");
	const lockPath = join(rootDirectory, ".epoch-manifest.lock");
	const now = options.now ?? Date.now;
	let nextTemporaryId = 0;
	let closed = false;
	let poisoned: string | null = null;

	const snapshot = (): EpochSnapshot => {
		assertOpen();
		const state = readDisk();
		return {
			manifest: state.manifest,
			cas: { revision: state.manifest.revision, bytesHash: state.bytesHash },
			manifestPath,
			recordsPath,
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
				writeOrder: "records-first",
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
				writeOrder: "manifest-first",
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
				writeOrder: "manifest-first",
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
				writeOrder: "manifest-first",
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
				writeOrder: "manifest-first",
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

	function readDisk(): DiskState {
		let manifestRaw: string | null;
		let recordsRaw: string | null;
		try {
			manifestRaw = readUtf8File(fileSystem, manifestPath);
			recordsRaw = readUtf8File(fileSystem, recordsPath);
		} catch (error) {
			throw epochError("corrupt_manifest", "epoch state cannot be read", error);
		}
		if (manifestRaw === null && recordsRaw === null) {
			return { manifest: emptyManifest(), bytesHash: null };
		}
		if (manifestRaw === null || recordsRaw === null) {
			throw epochError(
				"corrupt_manifest",
				"epoch manifest and record journal must be published together",
			);
		}
		try {
			const manifest = decodeManifest(manifestRaw);
			const records = decodeManifest(recordsRaw);
			if (encodeManifest(manifest) !== encodeManifest(records)) {
				throw new Error("manifest and record journal disagree");
			}
			assertManifestRelations(manifest);
			return { manifest, bytesHash: manifestBytesHash(manifestRaw) };
		} catch (error) {
			if (error instanceof CodexEpochError) {
				throw error;
			}
			throw epochError("corrupt_manifest", "epoch manifest is corrupt or inconsistent", error);
		}
	}

	function mutate<T>(
		expected: EpochCasToken | undefined,
		action: (current: DiskState) => Mutation<T>,
	): T {
		assertOpen();
		if (poisoned !== null) {
			throw epochError("durability_failed", `epoch store is quarantined: ${poisoned}`);
		}
		let lock: ReturnType<typeof acquireDurableLock> | null = null;
		let value: T | undefined;
		let failure: unknown;
		try {
			try {
				lock = acquireDurableLock(fileSystem, lockPath, rootDirectory);
			} catch (error) {
				const mapped = mapLockError(error);
				if (mapped.code === "durability_failed") poisoned = "lock acquisition failed";
				throw mapped;
			}
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
			writeState(next, mutation.writeOrder);
			value = mutation.result(next);
		} catch (error) {
			failure = error;
		} finally {
			if (lock !== null) {
				try {
					lock.release();
				} catch (error) {
					poisoned = "lock cleanup durability is unknown";
					if (failure === undefined) {
						failure = mapStorageError(error, "epoch lock cleanup failed");
					}
				}
			}
		}
		if (failure !== undefined) {
			throw failure;
		}
		return value as T;
	}
	function writeState(manifest: EpochManifest, order: Mutation<unknown>["writeOrder"]): void {
		const encoded = encodeManifest(manifest);
		try {
			nextTemporaryId = writeEpochStateDurable(
				fileSystem,
				rootDirectory,
				manifestPath,
				recordsPath,
				encoded,
				order,
				nextTemporaryId,
			);
		} catch (error) {
			if (error instanceof DurableStorageError) {
				poisoned = `durability failed during ${error.phase}`;
				throw epochError("durability_failed", poisoned, error);
			}
			throw mapStorageError(error, "epoch state write failed");
		}
	}

	return {
		rootDirectory,
		manifestPath,
		recordsPath,
		lockPath,
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
