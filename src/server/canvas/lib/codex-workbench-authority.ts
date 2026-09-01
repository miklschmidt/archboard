import type {
	IdentityAuthorities,
	OperationId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	createDynamicAuthorityTokenIssuer,
	type DynamicCallerAuthority,
	type DynamicContextAuthority,
	type DynamicContextPort,
	type DynamicTargetAuthority,
	type DynamicThreadAuthorityPort,
} from "../../../runtime/codex-dynamic-tools/index.js";
import type { CodexEpochStore, EpochOperationRecord } from "../../../runtime/codex-epoch/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkClassification,
} from "../../../runtime/codex-thread-link/index.js";
import type { DynamicServerRequest } from "../../../runtime/codex-transport/server-requests.js";
import type { ArchboardContext } from "../../../runtime/codex-instructions/index.js";

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

/** Exact caller/target and pane-context authority over live link and epoch evidence. */
export function createCanvasDynamicAuthorityAdapters(
	options: CanvasDynamicAuthorityOptions,
): CanvasDynamicAuthorityAdapters {
	const issuer = createDynamicAuthorityTokenIssuer();
	const tokens = new Map<string, ReturnType<typeof issuer.issue>>();
	const callerCalls = new Map<
		ReturnType<typeof issuer.issue>,
		DynamicServerRequest["logicalCall"]
	>();
	const tokenFor = (key: string): ReturnType<typeof issuer.issue> => {
		const prior = tokens.get(key);
		if (prior !== undefined && issuer.owns(prior)) return prior;
		const issued = issuer.issue();
		tokens.set(key, issued);
		return issued;
	};
	const paneForThread = (threadId: ThreadId): string | null => {
		for (const paneId of options.paneIds()) {
			const binding = options.threadLink.read(paneId);
			if (binding.link.state === "executable" && binding.link.threadId === threadId) return paneId;
		}
		return null;
	};
	const targetFacts = async (
		threadId: ThreadId,
	): Promise<{
		readonly classification: ThreadLinkClassification;
		readonly base: Omit<DynamicTargetAuthority, "authority" | "role" | "linkClassification">;
	}> => {
		const record = latestThreadRecord(options.epoch, threadId);
		const threadLinkTarget = {
			threadId,
			childId: record?.correlation.childId ?? null,
			epoch: record?.correlation.epoch ?? null,
			operationId: record?.operation.id,
			provenance: record,
		};
		const classification = await options.threadLink.classify(threadLinkTarget);
		if (classification.thread === null) throw new Error("The exact thread is not observable.");
		const activeEpoch = options.epoch.snapshot().manifest.activeEpoch;
		const epochState =
			record === null
				? "unknown"
				: activeEpoch?.childId === record.correlation.childId &&
					  activeEpoch.epoch === record.correlation.epoch
					? "current"
					: "prior";
		return {
			classification,
			base: {
				threadId,
				wireThreadId: options.identity.identity.decoder.serializeCodexIdentity(threadId),
				childId: record?.correlation.childId ?? null,
				epoch: record?.correlation.epoch ?? null,
				epochState,
				ownership:
					record === null
						? "foreign"
						: record.operation.kind === "attached"
							? "attached"
							: "created",
				loaded: classification.observation.loaded,
				directInput: classification.observation.canAcceptDirectInput,
				status: classification.observation.status,
				source: classification.observation.source,
				provenance: classification.proof,
				threadLinkTarget,
			},
		};
	};
	const isLogicalCallItem = (
		item: NonNullable<ThreadLinkClassification["thread"]>["turns"][number]["items"][number],
		callId: DynamicServerRequest["logicalCall"]["callId"],
	): boolean =>
		item.type === "dynamicToolCall" &&
		options.identity.identity.decoder.serializeCodexIdentity(item.id) ===
			options.identity.identity.decoder.serializeCodexIdentity(callId);
	const resolveCaller = async (request: DynamicServerRequest): Promise<DynamicCallerAuthority> => {
		options.identity.identity.validator.assertCurrentEpoch(request.child, request.epoch);
		const facts = await targetFacts(request.logicalCall.threadId);
		if (
			facts.base.ownership !== "created" ||
			facts.base.epochState !== "current" ||
			facts.base.childId === null ||
			facts.base.epoch === null
		)
			throw new Error("The dynamic caller is not in the current child epoch.");
		const turn = facts.classification.thread?.turns.find(
			(candidate) => candidate.id === request.logicalCall.turnId,
		);
		const call = turn?.items.find((item) => isLogicalCallItem(item, request.logicalCall.callId));
		if (
			facts.base.status !== "active" ||
			call?.type !== "dynamicToolCall" ||
			call.status !== "inProgress" ||
			call.namespace !== request.logicalCall.namespace ||
			call.tool !== request.logicalCall.tool
		)
			throw new Error("The exact logical dynamic call is not executing.");
		const authority = tokenFor(`caller:${JSON.stringify(request.logicalCall)}`);
		callerCalls.set(authority, request.logicalCall);
		return Object.freeze({
			...facts.base,
			childId: facts.base.childId,
			epoch: facts.base.epoch,
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
	const classifyTarget = async (
		caller: DynamicCallerAuthority,
		value: unknown,
	): Promise<DynamicTargetAuthority> => {
		const threadId = options.identity.identity.decoder.adoptThreadId(value);
		const facts = await targetFacts(threadId);
		return Object.freeze({
			...facts.base,
			authority: tokenFor(`target:${caller.authority}:${String(threadId)}`),
			linkClassification: facts.classification,
			role: "target",
		});
	};
	const thread: DynamicThreadAuthorityPort = Object.freeze({
		resolveExactLogicalCaller: (
			input: Parameters<DynamicThreadAuthorityPort["resolveExactLogicalCaller"]>[0],
		) => resolveCaller(input.request),
		classifyExactTarget: (
			input: Parameters<DynamicThreadAuthorityPort["classifyExactTarget"]>[0],
		) => classifyTarget(input.caller, input.threadId),
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
		revalidateCaller: async (caller: DynamicCallerAuthority) => {
			if (!issuer.owns(caller.authority)) throw new Error("The caller authority was retired.");
			const logicalCall = callerCalls.get(caller.authority);
			if (logicalCall === undefined) throw new Error("The caller authority has no logical call.");
			const facts = await targetFacts(caller.threadId);
			if (
				facts.base.ownership !== "created" ||
				facts.base.epochState !== "current" ||
				facts.base.childId === null ||
				facts.base.epoch === null
			)
				throw new Error("The dynamic caller left its current child epoch.");
			const turn = facts.classification.thread?.turns.find(
				(candidate) => candidate.id === logicalCall.turnId,
			);
			const call = turn?.items.find((item) => isLogicalCallItem(item, logicalCall.callId));
			if (
				facts.base.status !== "active" ||
				call?.type !== "dynamicToolCall" ||
				call.status !== "inProgress" ||
				call.namespace !== logicalCall.namespace ||
				call.tool !== logicalCall.tool
			)
				throw new Error("The exact logical dynamic call is no longer executing.");
			return Object.freeze({
				...caller,
				...facts.base,
				childId: facts.base.childId,
				epoch: facts.base.epoch,
				linkClassification: facts.classification,
			});
		},
		revalidateTarget: async (target: DynamicTargetAuthority) => {
			if (!issuer.owns(target.authority)) throw new Error("The target authority was retired.");
			const facts = await targetFacts(target.threadId);
			return Object.freeze({ ...target, ...facts.base, linkClassification: facts.classification });
		},
	});
	const context: DynamicContextPort = Object.freeze({
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
		dispose: () => {
			issuer.retireAll();
			tokens.clear();
			callerCalls.clear();
		},
	});
}

/** Adopt only the exact ready workhorse snapshot and its captured link CAS proof. */
