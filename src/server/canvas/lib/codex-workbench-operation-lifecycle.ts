import type {
	ChildEpoch,
	ChildId,
	IdentityAuthorities,
	OperationId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	DynamicCallerAuthority,
	DynamicEpochTeardownProof,
	DynamicFatalLifecycleFault,
	DynamicMutationQuarantineIdentity,
	DynamicMutationQuarantineOwner,
	DynamicMutationTerminalProof,
	DynamicOperationIdPort,
	DynamicOperationTerminalDisposition,
	DynamicOperationTerminalResult,
	DynamicToolLifecyclePort,
	DynamicWaitEvent,
	DynamicWaitOwner,
} from "../../../runtime/codex-dynamic-tools/index.js";
import type { CodexWaitGraph, WaitOwner } from "../../../runtime/codex-wait-graph/index.js";
import type { DynamicServerRequest } from "../../../runtime/codex-transport/server-requests.js";

/** The shared OperationId authority plus exact once-only terminal disposition. */
export function createCanvasDynamicOperationIdAdapter(
	authority: IdentityAuthorities["operation"],
): DynamicOperationIdPort {
	const terminal = new Map<OperationId, DynamicOperationTerminalResult>();
	return Object.freeze({
		issueCanonicalOperationId: () => authority.issuer.mintOperationId(),
		validateCurrentUnconsumedOperationId: (operationId: OperationId) => {
			authority.validator.assertCurrentOperationId(operationId);
			if (terminal.has(operationId)) throw new Error("The OperationId is already terminal.");
		},
		serializeForOwnedWireFields: (operationId: OperationId) =>
			authority.decoder.serializeOperationId(operationId),
		terminalizeCanonicalOperationId: (input: {
			readonly operationId: OperationId;
			readonly disposition: DynamicOperationTerminalDisposition;
		}) => {
			authority.validator.assertCurrentOperationId(input.operationId);
			const prior = terminal.get(input.operationId);
			if (prior !== undefined) {
				if (prior.disposition !== input.disposition)
					throw new Error("The OperationId already has a different terminal disposition.");
				return prior;
			}
			const result = Object.freeze({
				operationId: input.operationId,
				disposition: input.disposition,
				terminal: true as const,
			});
			terminal.set(input.operationId, result);
			return result;
		},
		readCanonicalOperationTerminalResult: (operationId: OperationId) => {
			authority.validator.assertCurrentOperationId(operationId);
			return terminal.get(operationId) ?? null;
		},
	});
}

function waitOwner(owner: DynamicWaitOwner): WaitOwner {
	return {
		child: owner.child,
		caller: owner.caller,
		turn: owner.turn,
		call: owner.call,
	};
}

function quarantineKey(identity: DynamicMutationQuarantineIdentity): string {
	return JSON.stringify([identity.child, identity.epoch, identity.callId]);
}

export interface CanvasDynamicLifecycleOwnerOptions {
	readonly waitGraph: CodexWaitGraph;
	readonly waitForTargets: (input: {
		readonly owner: DynamicWaitOwner;
		readonly cursor: string | null;
		readonly timeoutMs: number;
		readonly previousSequence: number;
	}) => Promise<DynamicWaitEvent>;
	readonly shutdownEpoch: (child: ChildId, epoch: ChildEpoch) => Promise<DynamicEpochTeardownProof>;
	readonly onFatal: (fault: DynamicFatalLifecycleFault) => void;
}

export interface CanvasDynamicLifecycleOwner {
	readonly port: DynamicToolLifecyclePort;
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
	readonly shutdown: () => Promise<void>;
}

/** Exact executing-call and wait/quarantine owner for the dynamic dispatcher. */
export function createCanvasDynamicLifecycleOwner(
	options: CanvasDynamicLifecycleOwnerOptions,
): CanvasDynamicLifecycleOwner {
	const quarantines = new Map<
		string,
		{
			readonly identity: DynamicMutationQuarantineIdentity;
			readonly retry: () => Promise<DynamicMutationTerminalProof>;
			readonly owner: DynamicMutationQuarantineOwner;
			readonly resolveExit: () => void;
		}
	>();
	let stopped = false;
	const port: DynamicToolLifecyclePort = Object.freeze({
		assertCallExecuting: (input: {
			readonly request: DynamicServerRequest;
			readonly caller: DynamicCallerAuthority;
		}) => {
			if (stopped || !input.caller.executing || input.caller.status !== "active")
				throw new Error("The logical dynamic call is no longer executing.");
		},
		registerWaitOwner: ({ owner }: { readonly owner: DynamicWaitOwner }) => {
			const result = options.waitGraph.addEdgeSet({
				owner: waitOwner(owner),
				targets: owner.sortedTargetThreadIds,
			});
			if (!result.ok)
				throw new Error(`The wait owner would create a cycle: ${result.cycle.join(" -> ")}`);
		},
		releaseWaitOwner: ({
			owner,
			cause,
		}: Parameters<DynamicToolLifecyclePort["releaseWaitOwner"]>[0]) => {
			options.waitGraph.release({ owner: waitOwner(owner), cause });
		},
		releaseWaitOwnersForChild: ({
			child,
		}: Parameters<DynamicToolLifecyclePort["releaseWaitOwnersForChild"]>[0]) => {
			options.waitGraph.release({ cause: "child-exit", child });
		},
		poisonEpochAndOwnMutationQuarantine: ({
			identity,
			retryTerminalization,
		}: Parameters<DynamicToolLifecyclePort["poisonEpochAndOwnMutationQuarantine"]>[0]) => {
			const key = quarantineKey(identity);
			const prior = quarantines.get(key);
			if (prior !== undefined) return prior.owner;
			let resolveExit!: () => void;
			const childExit = new Promise<{
				readonly child: ChildId;
				readonly epoch: ChildEpoch;
				readonly exited: true;
			}>((resolve) => {
				resolveExit = () => resolve({ child: identity.child, epoch: identity.epoch, exited: true });
			});
			const owner = Object.freeze({
				child: identity.child,
				epoch: identity.epoch,
				poisoned: true as const,
				childExit,
			});
			quarantines.set(key, {
				identity,
				retry: retryTerminalization,
				owner,
				resolveExit,
			});
			return owner;
		},
		failClosedShutdownEpoch: ({
			child,
			epoch,
			reason,
		}: Parameters<DynamicToolLifecyclePort["failClosedShutdownEpoch"]>[0]) => ({
			child,
			epoch,
			reason,
			shutdownInitiated: true as const,
			teardown: options.shutdownEpoch(child, epoch),
		}),
		reportFatalLifecycleFault: options.onFatal,
		waitForTargets: options.waitForTargets,
	});
	const childExit = async (child: ChildId, epoch: ChildEpoch): Promise<void> => {
		for (const entry of quarantines.values()) {
			if (entry.identity.child !== child || entry.identity.epoch !== epoch) continue;
			try {
				await entry.retry();
			} finally {
				entry.resolveExit();
				quarantines.delete(quarantineKey(entry.identity));
			}
		}
		options.waitGraph.release({ cause: "child-exit", child });
	};
	return Object.freeze({
		port,
		childExit,
		shutdown: async () => {
			if (stopped) return;
			stopped = true;
			const exits = new Map<string, { child: ChildId; epoch: ChildEpoch }>();
			for (const entry of quarantines.values())
				exits.set(`${entry.identity.child}:${entry.identity.epoch}`, {
					child: entry.identity.child,
					epoch: entry.identity.epoch,
				});
			for (const exit of exits.values()) await childExit(exit.child, exit.epoch);
		},
	});
}
