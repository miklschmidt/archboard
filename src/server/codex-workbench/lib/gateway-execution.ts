import type { createCodexBrowserModel } from "@/shared/codex-browser-model";
import type { BrowserSnapshot, DeliveryOutcome } from "@/shared/codex-browser-model";
import type { BrowserCommandId } from "@/shared/codex-workbench-identity";
import {
	CodexWorkbenchGatewayError,
	type BrowserActionResult,
	type BrowserConnectionId,
	type BrowserConnectionInstance,
	type BrowserGatewayAccountReadResult,
	type BrowserGatewayCommandResult,
	type BrowserLeaseRecord,
	type CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench/lib/contract";
import {
	actionContext,
	actionOutcome,
	errorCode,
	errorOutcome,
	fingerprintCommand,
	isRecord,
	isThreadLinkCommand,
	normalizeBrowserCommand,
	staticMessage,
	type OwnedBrowserCommand,
} from "@/server/codex-workbench/lib/browser-command";
import {
	createCommandAdmission,
	ensureAccountReadiness,
} from "@/server/codex-workbench/lib/command-admission";
import {
	createBrowserActionDispatch,
	invokeBrowserAction,
} from "@/server/codex-workbench/lib/command-dispatch";
import type {
	BrowserConnections,
	ConnectionState,
} from "@/server/codex-workbench/lib/gateway-connections";
import type { LeaseOwner } from "@/server/codex-workbench/lib/gateway-leases";

/** A command whose result is replayable, so a retried id answers what it answered. */
interface CachedCommand {
	readonly fingerprint: string;
	readonly browserId: BrowserConnectionId;
	readonly paneId: string;
	readonly connection: BrowserConnectionInstance;
	readonly result: Promise<BrowserGatewayCommandResult>;
}

const BROWSER_SETTLED_COMMAND_LIMIT = 64;

/** What the executor needs from the gateway around it. */
interface CommandExecutorOwners {
	readonly options: CodexWorkbenchGatewayOptions;
	readonly model: ReturnType<typeof createCodexBrowserModel>;
	readonly now: () => number;
	readonly connections: BrowserConnections;
	readonly leases: LeaseOwner;
	/** Whether the gateway has been disposed, which stops the settled cache growing. */
	readonly isDisposed: () => boolean;
}

/** The gateway's command surface, and the caches a retry is answered from. */
interface CommandExecutor {
	readonly command: (
		browserId: BrowserConnectionId,
		value: unknown,
		paneIdOverride?: string,
		instance?: BrowserConnectionInstance,
	) => Promise<BrowserGatewayCommandResult>;
	readonly accountRead: (
		browserId: BrowserConnectionId,
		paneId: string,
		instance?: BrowserConnectionInstance,
	) => Promise<BrowserGatewayAccountReadResult>;
	/** Refuse a command whose readiness is not account-capable; the lease claim uses this too. */
	readonly ensureAccountReadiness: (snapshot: BrowserSnapshot) => void;
	readonly forgetInFlightFor: (instance: BrowserConnectionInstance) => void;
	readonly forgetCommand: (commandId: BrowserCommandId) => void;
	readonly clearCaches: () => void;
}

/**
 * The refusal code an outcome answers with.
 * @param outcome What became of the command.
 * @returns The code, or null when it was delivered.
 */
function codeForOutcome(outcome: DeliveryOutcome): CodexWorkbenchGatewayError["code"] | null {
	if (outcome === "delivered") return null;
	return outcome === "outcome_unknown" ? "outcome_unknown" : "command_failed";
}

/**
 * The pane a command names, either because the caller knows it or because the
 * command itself says so.
 * @param value The command as it arrived.
 * @param paneIdOverride The pane the caller knows, when it knows one.
 * @returns The pane.
 */
function paneIdOf(value: unknown, paneIdOverride?: string): string {
	const paneId =
		paneIdOverride ??
		(isRecord(value) && typeof value["paneId"] === "string" ? value["paneId"] : null);
	if (paneId === null)
		throw new CodexWorkbenchGatewayError(
			"invalid_input",
			"A browser command must identify its pane.",
		);
	return paneId;
}

/**
 * The extra fields a delivered command carries back beyond its outcome.
 * @param command The command.
 * @param outcome What became of it.
 * @param result What the action reported.
 * @returns The extra answer fields.
 */
function deliveredExtras(
	command: OwnedBrowserCommand,
	outcome: DeliveryOutcome,
	result: BrowserActionResult,
): Record<string, unknown> {
	if (result === undefined || result === null) {
		return {};
	}
	if (command.command === "realtimeStart") {
		return realtimeExtras(result);
	}
	return startedTurnExtras(command, outcome, result);
}

/**
 * The turn a delivered start produced, which nothing else carries back.
 * @param command The command.
 * @param outcome What became of it.
 * @param result What the action reported.
 * @returns The turn id, or nothing.
 */
function startedTurnExtras(
	command: OwnedBrowserCommand,
	outcome: DeliveryOutcome,
	result: Exclude<BrowserActionResult, void>,
): Record<string, unknown> {
	if (command.command !== "start" || outcome !== "delivered" || !result.turnId) {
		return {};
	}
	return { turnId: result.turnId };
}

/**
 * What starting the voice session carries back: the answer it produced and the
 * handle the browser plays it through.
 * @param result What the action reported.
 * @returns The extra answer fields.
 */
function realtimeExtras(result: Exclude<BrowserActionResult, void>): Record<string, unknown> {
	return {
		...(result.realtimeAnswer ? { realtimeAnswer: result.realtimeAnswer } : {}),
		...(result.realtimeSessionHandle
			? { realtimeSessionHandle: result.realtimeSessionHandle }
			: {}),
	};
}

/**
 * The oldest settled command that may be evicted, which is any but the one
 * the lease is currently for.
 * @param settled The settled cache, in insertion order.
 * @param activeCommandId The lease's own command, when there is a lease.
 * @returns The command to evict, or undefined when only the lease's is left.
 */
function oldestEvictable(
	settled: ReadonlyMap<BrowserCommandId, CachedCommand>,
	activeCommandId: BrowserCommandId | undefined,
): BrowserCommandId | undefined {
	for (const candidate of settled.keys()) {
		if (candidate !== activeCommandId) {
			return candidate;
		}
	}
	return undefined;
}

/**
 * Own the gateway's command surface: what a command is checked against, what
 * carries it out, and what a retried command id answers.
 * @param owners What the gateway around it provides.
 * @returns The executor.
 */
function createCommandExecutor(owners: CommandExecutorOwners): CommandExecutor {
	const { options, model, connections, leases } = owners;
	const inFlightCommands = new Map<BrowserCommandId, CachedCommand>();
	const settledCommands = new Map<BrowserCommandId, CachedCommand>();
	const dispatch = createBrowserActionDispatch(options);
	const admitCommand = createCommandAdmission({
		options,
		model,
		now: owners.now,
		leases,
		snapshotFor: connections.snapshotFor,
	});

	/**
	 * Answer a command that was refused, recording the refusal as the pane's
	 * current operation outcome so every browser sees it.
	 * @param state The connection.
	 * @param commandId The command, when the refusal names one.
	 * @param code Why it was refused.
	 * @param outcome What became of it.
	 * @returns The command result.
	 */
	const refusal = async (
		state: ConnectionState,
		commandId: BrowserCommandId | null,
		code: CodexWorkbenchGatewayError["code"],
		outcome: DeliveryOutcome = "not_delivered",
	): Promise<BrowserGatewayCommandResult> => {
		const message = staticMessage(outcome, code);
		if (commandId !== null)
			state.operation = Object.freeze({
				kind: "operation_outcome",
				operationId: commandId,
				outcome,
				message,
			});
		const snapshot = connections.updateSnapshot(state).snapshot;
		return Object.freeze({ kind: "command_result", commandId, outcome, code, message, snapshot });
	};

	/**
	 * Whether the pane's link still stands after a command that did not change
	 * it. A link that moved under a command makes its outcome unknown.
	 * @param state The connection.
	 * @param command The command.
	 * @param record The lease it ran under.
	 * @returns True when the outcome is still knowable.
	 */
	const outcomeStillKnowable = (
		state: ConnectionState,
		command: OwnedBrowserCommand,
		record: BrowserLeaseRecord,
	): boolean => {
		if (isThreadLinkCommand(command)) {
			return true;
		}
		try {
			leases.ensureLeaseBinding(state, record);
			return true;
		} catch (error) {
			if (error instanceof CodexWorkbenchGatewayError && error.code === "link_changed") {
				return false;
			}
			throw error;
		}
	};

	/**
	 * Answer a command the action carried out, recording its outcome as the
	 * pane's current one.
	 * @param state The connection.
	 * @param command The command.
	 * @param actionResult What the action reported.
	 * @returns The command result.
	 */
	const delivered = (
		state: ConnectionState,
		command: OwnedBrowserCommand,
		actionResult: BrowserActionResult,
	): BrowserGatewayCommandResult => {
		const outcome =
			leases.manager.current()?.lease.commandId === command.commandId
				? actionOutcome(actionResult)
				: "outcome_unknown";
		const code = codeForOutcome(outcome);
		const message = staticMessage(outcome, code);
		state.operation = Object.freeze({
			kind: "operation_outcome",
			operationId: command.commandId,
			outcome,
			message,
		});
		const nextSnapshot = connections.updateSnapshot(state).snapshot;
		if (command.command === "approvalRespond")
			options.actions.ordinaryApprovals.acknowledge(command.requestId);
		return Object.freeze({
			kind: "command_result",
			commandId: command.commandId,
			outcome,
			code,
			message,
			snapshot: nextSnapshot,
			...deliveredExtras(command, outcome, actionResult),
		});
	};

	/**
	 * Carry out one command and answer what became of it.
	 * @param state The connection.
	 * @param command The command.
	 * @returns The command result.
	 */
	const execute = async (
		state: ConnectionState,
		command: OwnedBrowserCommand,
	): Promise<BrowserGatewayCommandResult> => {
		let actionStarted = false;
		try {
			const record = admitCommand(state, command);
			actionStarted = true;
			const actionResult = await invokeBrowserAction(dispatch, command, actionContext(record));
			if (!outcomeStillKnowable(state, command, record)) {
				return await refusal(state, command.commandId, "outcome_unknown", "outcome_unknown");
			}
			return delivered(state, command, actionResult);
		} catch (error) {
			if (actionStarted && leases.manager.current()?.lease.commandId !== command.commandId)
				return refusal(state, command.commandId, "outcome_unknown", "outcome_unknown");
			return refusal(state, command.commandId, errorCode(error), errorOutcome(error));
		}
	};

	// A lease is app-global, so retiring its owner removes its only possible
	// in-flight entry. Settled entries remain replayable until bounded eviction;
	// an evicted id is necessarily non-current and must pass lease authority.
	/**
	 * Keep a settled command replayable, evicting the oldest that is not the
	 * lease's own once the cache is full.
	 * @param commandId The command.
	 * @param entry What it answered.
	 */
	const rememberSettled = (commandId: BrowserCommandId, entry: CachedCommand): void => {
		if (owners.isDisposed()) return;
		settledCommands.delete(commandId);
		settledCommands.set(commandId, entry);
		const activeCommandId = leases.manager.current()?.lease.commandId;
		while (settledCommands.size > BROWSER_SETTLED_COMMAND_LIMIT) {
			const evicted = oldestEvictable(settledCommands, activeCommandId);
			if (evicted === undefined) break;
			settledCommands.delete(evicted);
		}
	};

	/**
	 * What a command id that is already known answers: its own result on a
	 * retry from the same owner, or a refusal.
	 * @param state The connection.
	 * @param existing What that id answered before.
	 * @param fingerprint The retry's fingerprint.
	 * @param commandId The command.
	 * @returns The answer, or null when this id is new.
	 */
	const replayed = (
		state: ConnectionState,
		existing: CachedCommand | undefined,
		fingerprint: string,
		commandId: BrowserCommandId,
	): Promise<BrowserGatewayCommandResult> | null => {
		if (existing === undefined) {
			return null;
		}
		if (existing.fingerprint !== fingerprint) {
			return refusal(state, commandId, "invalid_command");
		}
		const sameOwner =
			existing.browserId === state.browserId &&
			existing.paneId === state.paneId &&
			existing.connection === state.instance;
		return sameOwner ? existing.result : refusal(state, commandId, "lease_transferred");
	};

	/**
	 * Track a command while it runs, so a retry of the same id joins it rather
	 * than starting a second one.
	 * @param commandId The command.
	 * @param entry Its cache entry.
	 */
	const trackInFlight = (commandId: BrowserCommandId, entry: CachedCommand): void => {
		if (leases.manager.current()?.lease.commandId !== commandId) {
			return;
		}
		inFlightCommands.set(commandId, entry);
		void entry.result.then(
			() => {
				if (inFlightCommands.get(commandId) === entry) {
					inFlightCommands.delete(commandId);
					rememberSettled(commandId, entry);
				}
				return undefined;
			},
			() => {
				if (inFlightCommands.get(commandId) === entry) inFlightCommands.delete(commandId);
				return undefined;
			},
		);
	};

	/**
	 * The command a browser sent, as this gateway's own command, or the refusal
	 * saying the gateway does not serve it.
	 * @param state The connection.
	 * @param value The command as it arrived.
	 * @returns The parsed command, or the refusal to answer with.
	 */
	const parseCommand = (
		state: ConnectionState,
		value: unknown,
	): OwnedBrowserCommand | Promise<BrowserGatewayCommandResult> => {
		if (
			isRecord(value) &&
			typeof value["command"] === "string" &&
			!Object.hasOwn(dispatch, value["command"])
		)
			return refusal(state, null, "unsupported_command");
		try {
			return normalizeBrowserCommand(model.BrowserCommandSchema.parse(value));
		} catch {
			return refusal(state, null, "invalid_command");
		}
	};

	return {
		/**
		 * Take one command from a browser: refuse what this gateway does not
		 * serve, replay what it has already answered, and otherwise run it.
		 * @param browserId The browser.
		 * @param value The command as it arrived.
		 * @param paneIdOverride The pane the caller knows, when it knows one.
		 * @param instance The socket the caller believes it is.
		 * @returns The command result.
		 */
		command: async (browserId, value, paneIdOverride, instance) => {
			const paneId = paneIdOf(value, paneIdOverride);
			const state = connections.stateFor(browserId, paneId, instance);
			const parsed = parseCommand(state, value);
			if (parsed instanceof Promise) {
				return parsed;
			}
			const fingerprint = fingerprintCommand(parsed);
			const known = replayed(
				state,
				inFlightCommands.get(parsed.commandId) ?? settledCommands.get(parsed.commandId),
				fingerprint,
				parsed.commandId,
			);
			if (known !== null) {
				return known;
			}
			const result = execute(state, parsed);
			trackInFlight(parsed.commandId, {
				fingerprint,
				browserId,
				paneId,
				connection: state.instance,
				result,
			});
			return result;
		},

		/**
		 * Ask the account owner to re-read its state, and answer with what the
		 * browser should now be showing.
		 * @param browserId The browser.
		 * @param paneId The pane.
		 * @param instance The socket the caller believes it is.
		 * @returns The account read result.
		 */
		accountRead: async (browserId, paneId, instance) => {
			const state = connections.stateFor(browserId, paneId, instance);
			try {
				ensureAccountReadiness(connections.snapshotFor(state));
				const outcome = actionOutcome(await options.actions.account.read({ browserId, paneId }));
				const code = codeForOutcome(outcome);
				return Object.freeze({
					kind: "account_read",
					outcome,
					code,
					message: staticMessage(outcome, code),
					snapshot: connections.updateSnapshot(state).snapshot,
				});
			} catch (error) {
				const outcome = errorOutcome(error);
				const code = errorCode(error);
				return Object.freeze({
					kind: "account_read",
					outcome,
					code,
					message: staticMessage(outcome, code),
					snapshot: connections.updateSnapshot(state).snapshot,
				});
			}
		},

		ensureAccountReadiness,

		/**
		 * Forget the in-flight commands a retired connection owned.
		 * @param instance The socket that went.
		 */
		forgetInFlightFor: (instance) => {
			for (const [commandId, entry] of inFlightCommands)
				if (entry.connection === instance) inFlightCommands.delete(commandId);
		},

		/**
		 * Forget one command id entirely, because its lease has ended.
		 * @param commandId The command.
		 */
		forgetCommand: (commandId) => {
			inFlightCommands.delete(commandId);
			settledCommands.delete(commandId);
		},

		/** Forget every cached command, because the gateway is closing. */
		clearCaches: () => {
			inFlightCommands.clear();
			settledCommands.clear();
		},
	};
}

export { createCommandExecutor };
export type { CommandExecutor };
