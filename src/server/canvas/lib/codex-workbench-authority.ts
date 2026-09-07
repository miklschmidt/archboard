import type {
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	OperationId,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import {
	createDynamicAuthorityTokenIssuer,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicContextPort,
	type DynamicTargetAuthority,
	type DynamicThreadAuthorityPort,
} from "@/runtime/codex-dynamic-tools";
import type { CodexEpochStore, EpochOperationRecord } from "@/runtime/codex-epoch";
import type { CodexThreadLinkPort, ThreadLinkClassification } from "@/runtime/codex-thread-link";
import type { DynamicServerRequest } from "@/runtime/codex-transport/server-requests";
import type { ArchboardContext } from "@/runtime/codex-instructions";

export interface CanvasDynamicAuthorityOptions {
	readonly identity: IdentityAuthorities;
	readonly epoch: Pick<CodexEpochStore, "snapshot">;
	readonly threadLink: Pick<CodexThreadLinkPort, "classify" | "read">;
	readonly paneIds: () => readonly string[];
	readonly contextFor: (input: {
		readonly caller: DynamicCallerAuthority;
		readonly authority: DynamicContextAuthority;
		readonly operationId: OperationId;
		readonly kind:
			| "create_thread_initial_turn"
			| "fork_thread_initial_turn"
			| "send_message_to_thread";
		readonly targetThreadId?: ThreadId;
	}) => Promise<ArchboardContext> | ArchboardContext;
}

export interface CanvasDynamicAuthorityAdapters {
	readonly thread: DynamicThreadAuthorityPort;
	readonly context: DynamicContextPort;
	readonly paneForThread: (threadId: ThreadId) => string | null;
	readonly dispose: () => void;
}

/** What every authority over one thread is built from, before its role and token. */
type TargetFactsBase = Omit<DynamicTargetAuthority, "authority" | "role" | "linkClassification">;

/** One turn item, as the classified thread carries it. */
type ClassifiedItem = NonNullable<ThreadLinkClassification["thread"]>["turns"][number]["items"][number];

/**
 * The most recent committed operation that owns one thread, whichever epoch
 * committed it.
 * @param epoch The epoch store.
 * @param threadId The thread.
 * @returns The record, or null when nothing here owns the thread.
 */
function latestThreadRecord(
	epoch: Pick<CodexEpochStore, "snapshot">,
	threadId: ThreadId,
): EpochOperationRecord | null {
	return (
		epoch
			.snapshot()
			.manifest.records.findLast(
				(record) => record.status === "committed" && record.provenance.threadId === threadId,
			) ?? null
	);
}

/**
 * The thread as the link port is asked about it: the thread itself, plus
 * whatever provenance this host already holds for it.
 * @param threadId The thread.
 * @param record The operation owning it, or null.
 * @returns The target.
 */
function threadRecordTarget(threadId: ThreadId, record: EpochOperationRecord | null) {
	return {
		threadId,
		childId: record?.correlation.childId ?? null,
		epoch: record?.correlation.epoch ?? null,
		...(record ? { operationId: record.operation.id } : {}),
		provenance: record,
	};
}

/**
 * Whether the epoch that owns a thread is the one running now: work may only
 * be done under the current one.
 * @param record The operation owning the thread, or null.
 * @param activeEpoch The epoch running now.
 * @returns Which epoch state the thread is in.
 */
function epochStateOf(
	record: EpochOperationRecord | null,
	activeEpoch: ReturnType<CodexEpochStore["snapshot"]>["manifest"]["activeEpoch"],
): TargetFactsBase["epochState"] {
	if (record === null) {
		return "unknown";
	}
	const current =
		activeEpoch?.childId === record.correlation.childId &&
		activeEpoch.epoch === record.correlation.epoch;
	return current ? "current" : "prior";
}

/**
 * How this host came by a thread: it created it, adopted one that existed, or
 * does not own it at all.
 * @param record The operation owning the thread, or null.
 * @returns The ownership.
 */
function ownershipOf(record: EpochOperationRecord | null): TargetFactsBase["ownership"] {
	if (record === null) {
		return "foreign";
	}
	return record.operation.kind === "attached" ? "attached" : "created";
}

/** The child epoch a caller is running in, once it is known to be the current one. */
interface CallerEpochFacts {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}

/**
 * The child epoch a caller may act under: only a thread this host created, in
 * the epoch running now, and naming both.
 * @param base The thread's facts.
 * @returns The child epoch, or null when the caller may not act.
 */
function callerEpochFacts(base: TargetFactsBase): CallerEpochFacts | null {
	if (
		base.ownership !== "created" ||
		base.epochState !== "current" ||
		base.childId === null ||
		base.epoch === null
	) {
		return null;
	}
	return { childId: base.childId, epoch: base.epoch };
}

/**
 * Whether the call a request names is the one actually running: the thread is
 * active, and the item is this exact tool, still in progress.
 * @param base The thread's facts.
 * @param call The item the thread carries for the call, if any.
 * @param logicalCall The call the request names.
 * @returns True when the call is executing.
 */
function callIsExecuting(
	base: TargetFactsBase,
	call: ClassifiedItem | undefined,
	logicalCall: DynamicServerRequest["logicalCall"],
): boolean {
	return (
		base.status === "active" &&
		call?.type === "dynamicToolCall" &&
		call.status === "inProgress" &&
		call.namespace === logicalCall.namespace &&
		call.tool === logicalCall.tool
	);
}

/**
 * Exact caller/target and pane-context authority over live link and epoch
 * evidence.
 * @param options The identities, the epoch store, the link port, which panes
 * exist, and how one pane's context is read.
 * @returns The adapters.
 */
export function createCanvasDynamicAuthorityAdapters(
	options: CanvasDynamicAuthorityOptions,
): CanvasDynamicAuthorityAdapters {
	const issuer = createDynamicAuthorityTokenIssuer();
	const tokens = new Map<string, ReturnType<typeof issuer.issue>>();
	const callerCalls = new Map<
		ReturnType<typeof issuer.issue>,
		DynamicServerRequest["logicalCall"]
	>();
	/**
	 * The live token one authority is held under, reissued once the issuer has
	 * retired the previous one.
	 * @param key What the token is held under.
	 * @returns The token.
	 */
	const tokenFor = (key: string): ReturnType<typeof issuer.issue> => {
		const prior = tokens.get(key);
		if (prior !== undefined && issuer.owns(prior)) return prior;
		const issued = issuer.issue();
		tokens.set(key, issued);
		return issued;
	};
	/**
	 * The pane whose link can run turns on one thread, which is the pane whose
	 * context that thread's agent may read.
	 * @param threadId The thread.
	 * @returns The pane, or null when no pane is linked to it.
	 */
	const paneForThread = (threadId: ThreadId): string | null => {
		for (const paneId of options.paneIds()) {
			const binding = options.threadLink.read(paneId);
			if (binding.link.state === "executable" && binding.link.threadId === threadId) return paneId;
		}
		return null;
	};
	/**
	 * Everything an authority over one thread is decided from, read fresh from
	 * the link port and the epoch manifest rather than from anything retained.
	 * @param threadId The thread.
	 * @returns The classification and the facts built from it.
	 */
	const targetFacts = async (
		threadId: ThreadId,
	): Promise<{
		readonly classification: ThreadLinkClassification;
		readonly base: TargetFactsBase;
	}> => {
		const record = latestThreadRecord(options.epoch, threadId);
		const threadLinkTarget = threadRecordTarget(threadId, record);
		const classification = await options.threadLink.classify(threadLinkTarget);
		if (classification.thread === null) throw new Error("The exact thread is not observable.");
		return {
			classification,
			base: {
				threadId,
				wireThreadId: options.identity.identity.decoder.serializeCodexIdentity(threadId),
				childId: threadLinkTarget.childId,
				epoch: threadLinkTarget.epoch,
				epochState: epochStateOf(record, options.epoch.snapshot().manifest.activeEpoch),
				ownership: ownershipOf(record),
				loaded: classification.observation.loaded,
				directInput: classification.observation.canAcceptDirectInput,
				status: classification.observation.status,
				source: classification.observation.source,
				provenance: classification.proof,
				threadLinkTarget,
			},
		};
	};
	/**
	 * Whether one turn item is the dynamic call a request claims to be.
	 * @param item The item.
	 * @param callId The call the request claims.
	 * @returns True when they are the same call.
	 */
	const isLogicalCallItem = (
		item: ClassifiedItem,
		callId: DynamicServerRequest["logicalCall"]["callId"],
	): boolean =>
		item.type === "dynamicToolCall" &&
		options.identity.identity.decoder.serializeCodexIdentity(item.id) ===
			options.identity.identity.decoder.serializeCodexIdentity(callId);
	/**
	 * The item in the thread that is the logical call a request names, if the
	 * thread still carries it.
	 * @param classification The thread as it was just classified.
	 * @param logicalCall The call the request names.
	 * @returns The item, or undefined.
	 */
	const logicalCallItem = (
		classification: ThreadLinkClassification,
		logicalCall: DynamicServerRequest["logicalCall"],
	): ClassifiedItem | undefined => {
		const turn = classification.thread?.turns.find(
			(candidate) => candidate.id === logicalCall.turnId,
		);
		return turn?.items.find((item) => isLogicalCallItem(item, logicalCall.callId));
	};
	/**
	 * The caller authority one request may act under, refused unless the thread
	 * is this epoch's own and the call it names is still running.
	 * @param request The request.
	 * @returns The caller authority.
	 */
	const resolveCaller = async (request: DynamicServerRequest): Promise<DynamicCallerAuthority> => {
		options.identity.identity.validator.assertCurrentEpoch(request.child, request.epoch);
		const facts = await targetFacts(request.logicalCall.threadId);
		const epochFacts = callerEpochFacts(facts.base);
		if (epochFacts === null)
			throw new Error("The dynamic caller is not in the current child epoch.");
		const call = logicalCallItem(facts.classification, request.logicalCall);
		if (!callIsExecuting(facts.base, call, request.logicalCall))
			throw new Error("The exact logical dynamic call is not executing.");
		const authority = tokenFor(`caller:${JSON.stringify(request.logicalCall)}`);
		callerCalls.set(authority, request.logicalCall);
		return Object.freeze({
			...facts.base,
			childId: epochFacts.childId,
			epoch: epochFacts.epoch,
			authority,
			linkClassification: facts.classification,
			role: "caller",
			turnId: request.logicalCall.turnId,
			wireTurnId: options.identity.identity.decoder.serializeCodexIdentity(
				request.logicalCall.turnId,
			),
			executing: true,
		});
	};
	/**
	 * The target authority for a thread a caller named, however it spelled it.
	 * @param caller Who is naming the target.
	 * @param value The thread as the caller spelled it.
	 * @returns The target authority.
	 */
	const classifyTarget = async (
		caller: DynamicCallerAuthority,
		value: unknown,
	): Promise<DynamicTargetAuthority> => {
		let threadId: ThreadId;
		try {
			threadId = options.identity.identity.decoder.parseThreadId(value);
		} catch {
			threadId = options.identity.identity.decoder.resolveThreadId(value);
		}
		const facts = await targetFacts(threadId);
		return Object.freeze({
			...facts.base,
			authority: tokenFor(`target:${caller.authority}:${String(threadId)}`),
			linkClassification: facts.classification,
			role: "target",
		});
	};
	const thread: DynamicThreadAuthorityPort = Object.freeze({
		/**
		 * The authority the caller of one request may act under.
		 * @param input The request.
		 * @returns The caller authority.
		 */
		resolveExactLogicalCaller: (
			input: Parameters<DynamicThreadAuthorityPort["resolveExactLogicalCaller"]>[0],
		) => resolveCaller(input.request),
		/**
		 * The authority over the thread a caller named as its target.
		 * @param input The caller and the thread it named.
		 * @returns The target authority.
		 */
		classifyExactTarget: (
			input: Parameters<DynamicThreadAuthorityPort["classifyExactTarget"]>[0],
		) => classifyTarget(input.caller, input.threadId),
		/**
		 * The turn a fork is taken before: the caller's own turn when forking
		 * itself, and otherwise a turn the target thread actually carries.
		 * @param input The caller, the target, the requested boundary, and how
		 * the two threads are related.
		 * @returns The boundary turn, or null when the fork takes the whole thread.
		 */
		resolveExactTurnBoundary: async (
			input: Parameters<DynamicThreadAuthorityPort["resolveExactTurnBoundary"]>[0],
		) => {
			const { caller, target, requestedBeforeTurnId, relation } = input;
			if (relation === "self") return caller.turnId;
			if (requestedBeforeTurnId === null) return null;
			const turnId = options.identity.identity.decoder.adoptTurnId(requestedBeforeTurnId);
			const found = target.linkClassification?.thread?.turns.find(
				(candidate) => candidate.id === turnId,
			);
			if (found === undefined)
				throw new Error("The requested fork boundary is not in the target thread.");
			return found.id;
		},
		/**
		 * Re-prove a caller's authority against live evidence, because time has
		 * passed since it was issued and neither the epoch nor the call is
		 * guaranteed to still be what it was.
		 * @param caller The caller authority.
		 * @returns The caller authority, refreshed.
		 */
		revalidateCaller: async (caller: DynamicCallerAuthority) => {
			if (!issuer.owns(caller.authority)) throw new Error("The caller authority was retired.");
			const logicalCall = callerCalls.get(caller.authority);
			if (logicalCall === undefined) throw new Error("The caller authority has no logical call.");
			const facts = await targetFacts(caller.threadId);
			const epochFacts = callerEpochFacts(facts.base);
			if (epochFacts === null)
				throw new Error("The dynamic caller left its current child epoch.");
			const call = logicalCallItem(facts.classification, logicalCall);
			if (!callIsExecuting(facts.base, call, logicalCall))
				throw new Error("The exact logical dynamic call is no longer executing.");
			return Object.freeze({
				...caller,
				...facts.base,
				childId: epochFacts.childId,
				epoch: epochFacts.epoch,
				linkClassification: facts.classification,
			});
		},
		/**
		 * Re-prove a target's authority against live evidence.
		 * @param target The target authority.
		 * @returns The target authority, refreshed.
		 */
		revalidateTarget: async (target: DynamicTargetAuthority) => {
			if (!issuer.owns(target.authority)) throw new Error("The target authority was retired.");
			const facts = await targetFacts(target.threadId);
			return Object.freeze({ ...target, ...facts.base, linkClassification: facts.classification });
		},
	});
	const context: DynamicContextPort = Object.freeze({
		/**
		 * The authority to read one pane's context, issued against the pane the
		 * caller's thread is linked to and refused once that link has moved.
		 * @param input The caller, and any authority it already holds.
		 * @returns The pane context authority.
		 */
		issueAndRevalidatePaneLinkAuthority: (
			input: Parameters<DynamicContextPort["issueAndRevalidatePaneLinkAuthority"]>[0],
		) => {
			const { caller, existing } = input;
			const paneId = paneForThread(caller.threadId);
			if (paneId === null) throw new Error("The dynamic caller has no executable pane binding.");
			if (existing !== undefined) {
				if (!issuer.owns(existing.token) || existing.paneId !== paneId)
					throw new Error("The pane context authority is stale.");
				return existing;
			}
			return Object.freeze({
				token: tokenFor(`context:${caller.authority}:${paneId}`),
				paneId,
				childId: caller.childId,
				epoch: caller.epoch,
				threadId: caller.threadId,
				turnId: caller.turnId,
			});
		},
		/**
		 * One reading of the board as the pane shows it, refused if the pane link
		 * moved between the authority being issued and the context being read.
		 * @param input The authority, the caller, and what the context is for.
		 * @returns The context.
		 */
		readOneFreshArchboardContext: async (
			input: Parameters<DynamicContextPort["readOneFreshArchboardContext"]>[0],
		) => {
			if (!issuer.owns(input.authority.token))
				throw new Error("The context authority was retired.");
			if (paneForThread(input.caller.threadId) !== input.authority.paneId)
				throw new Error("The pane link changed before context capture.");
			return await options.contextFor(input);
		},
	});
	return Object.freeze({
		thread,
		context,
		paneForThread,
		/** Retire every authority this adapter issued, so none outlives it. */
		dispose: () => {
			issuer.retireAll();
			tokens.clear();
			callerCalls.clear();
		},
	});
}
