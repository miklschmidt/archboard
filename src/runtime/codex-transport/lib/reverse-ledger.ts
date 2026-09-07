import { CODEX_APP_SERVER_CAPACITY } from "@/shared/codex-app-server-capacity";
import type { ReverseRecord } from "@/runtime/codex-transport/lib/internals";
import type { TransportServerRequest } from "@/runtime/codex-transport/lib/types";

interface ReverseLedgerOptions {
	readonly reverseRequests: Map<string, ReverseRecord>;
	readonly reverseHandles: WeakMap<TransportServerRequest, ReverseRecord>;
	readonly completedReverseIds: Set<string>;
}

interface ReverseLedger {
	readonly pendingBytes: () => number;
	readonly addPendingBytes: (bytes: number) => void;
	readonly removePendingBytes: (bytes: number) => void;
	readonly retainCompletedId: (key: string) => void;
	readonly accept: (record: ReverseRecord) => void;
	readonly release: (record: ReverseRecord) => void;
	readonly forgetAll: () => void;
	readonly drain: (refuse: (record: ReverseRecord) => void) => void;
	readonly ownedBy: (
		request: TransportServerRequest,
		owner: TransportServerRequest["owner"],
	) => boolean;
}

/** The byte accounting a router needs to admit or release a reverse request. */
type ReverseByteAccounting = Pick<
	ReverseLedger,
	"pendingBytes" | "addPendingBytes" | "removePendingBytes"
>;

/**
 * Creates the ledger of reverse requests awaiting an answer: their byte accounting, the
 * ids already answered, and the transitions a response frame's write drives.
 * @param options The shared reverse-request tables.
 * @returns The ledger.
 */
function createReverseLedger(options: ReverseLedgerOptions): ReverseLedger {
	let pendingReverseBytes = 0;

	/**
	 * Bytes held by unanswered reverse requests.
	 * @returns The pending byte count.
	 */
	const pendingBytes = (): number => pendingReverseBytes;

	/**
	 * Charges a newly pending request's frame.
	 * @param bytes The frame size.
	 */
	const addPendingBytes = (bytes: number): void => {
		pendingReverseBytes += bytes;
	};

	/**
	 * Releases a request's frame bytes, never below zero.
	 * @param bytes The frame size.
	 */
	const removePendingBytes = (bytes: number): void => {
		pendingReverseBytes = Math.max(0, pendingReverseBytes - bytes);
	};

	/**
	 * Remembers an answered reverse id, evicting the oldest past the retention bound.
	 * @param key The wire key.
	 */
	const retainCompletedId = (key: string): void => {
		if (
			options.completedReverseIds.size >= CODEX_APP_SERVER_CAPACITY.retention.completedReverseIds
		) {
			const oldest = options.completedReverseIds.values().next().value;
			if (oldest !== undefined) {
				options.completedReverseIds.delete(oldest);
			}
		}
		options.completedReverseIds.add(key);
	};

	/**
	 * Whether a record is still the live entry for its key and unanswered.
	 * @param record The record.
	 * @returns True when a write may change its state.
	 */
	const isLive = (record: ReverseRecord): boolean =>
		!record.responded && options.reverseRequests.get(record.key) === record;

	/**
	 * Marks a reverse request answered once its response frame is handed to stdin.
	 * @param record The reverse record.
	 */
	const accept = (record: ReverseRecord): void => {
		if (!isLive(record)) {
			return;
		}
		record.responding = false;
		record.responded = true;
		options.reverseRequests.delete(record.key);
		options.reverseHandles.delete(record.request);
		removePendingBytes(record.bytes);
		retainCompletedId(record.key);
	};

	/**
	 * Lets a reverse request be answered again after its response frame failed to write.
	 * @param record The reverse record.
	 */
	const release = (record: ReverseRecord): void => {
		if (!isLive(record)) {
			return;
		}
		record.responding = false;
	};

	/** Forgets every pending reverse request without answering it. */
	const forgetAll = (): void => {
		for (const record of options.reverseRequests.values()) {
			options.reverseHandles.delete(record.request);
		}
		options.reverseRequests.clear();
		pendingReverseBytes = 0;
	};

	/**
	 * Answers every pending reverse request through the given refusal and forgets it.
	 * @param refuse Answers one record.
	 */
	const drain = (refuse: (record: ReverseRecord) => void): void => {
		for (const record of Array.from(options.reverseRequests.values())) {
			refuse(record);
			options.reverseHandles.delete(record.request);
			options.reverseRequests.delete(record.key);
			pendingReverseBytes -= record.bytes;
		}
		pendingReverseBytes = 0;
	};

	/**
	 * Whether an owner still holds an unanswered reverse request.
	 * @param request The request handle.
	 * @param owner The owner asking.
	 * @returns True when the request is pending under that owner.
	 */
	const ownedBy = (
		request: TransportServerRequest,
		owner: TransportServerRequest["owner"],
	): boolean => {
		const record = options.reverseHandles.get(request);
		return (
			record?.request.owner === owner &&
			!record.responded &&
			!record.responding &&
			options.reverseRequests.get(record.key) === record
		);
	};

	return Object.freeze({
		pendingBytes,
		addPendingBytes,
		removePendingBytes,
		retainCompletedId,
		accept,
		release,
		forgetAll,
		drain,
		ownedBy,
	});
}

export { createReverseLedger };
export type { ReverseByteAccounting, ReverseLedger, ReverseLedgerOptions };
