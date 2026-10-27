import { panes, sendBoardlessToPane } from "#server/services/panes/registry.ts";
import { tabSessionOf } from "#server/services/panes/tab-sessions.ts";
import { isDeepStrictEqual } from "node:util";
import { readArchitectureModel } from "@archboard/board/store-read";
import { parseTabSessionId } from "@archboard/codex-realtime-voice/server";
import type {
	CodexWorkbenchDomainScope,
	CodexWorkbenchDomain,
} from "#runtime/protocol/voice/extension.ts";
import {
	refuse,
	reply,
	type Entry,
	type Request,
	type Invocation,
	type Result,
	type Reading,
} from "#server/services/explanations/contract.ts";
import { startExplanation } from "#server/services/explanations/start.ts";
import { noteExplanation } from "#server/services/explanations/notifications.ts";

/**
 * Create one detached temporary action from the public architecture capture.
 * @param vault The addressed vault.
 * @param invocation The exact request.
 * @param model The coherent captured reading.
 * @returns The temporary action entry.
 */
function capturedEntry(vault: string, invocation: Invocation, model: Reading): Entry {
	if (model.explanation === undefined) throw new Error("The architecture capture is missing.");
	return {
		vault,
		invocation: structuredClone(invocation),
		model,
		action: {
			vault,
			actionId: invocation.request.actionId,
			status: "captured",
			attempt: 0,
			capture: model.explanation,
			text: "",
			retryable: false,
		},
	};
}
/**
 * Refuse reuse of an action identity for another invocation.
 * @param entry The original action.
 * @param vault The newly addressed vault.
 * @param input The new action.
 * @returns A refusal or no mismatch.
 */
function mismatch(entry: Entry, vault: string, input: Request) {
	if (entry.vault !== vault)
		return refuse("ACTION_CHANGED", "This action names another vault. Start a new action.");
	if (input.type === "invoke" && !isDeepStrictEqual(input, entry.invocation))
		return refuse(
			"ACTION_CHANGED",
			"This action identity names another request. Start a new action.",
		);
	return undefined;
}
/**
 * Own temporary explanations within the existing local generation and tab sessions.
 * @param scope The existing local agent owners.
 * @returns The action dispatcher and its lifecycle cleanup.
 */
function createExplanationActions(scope: CodexWorkbenchDomainScope) {
	const tabs = new Map<string, Map<string, Entry>>();
	/**
	 * Run delivery once while other invocations read its captured progress.
	 * @param entry The captured action.
	 */
	const start = async (entry: Entry) => {
		entry.pending = startExplanation(scope, entry);
		announce(entry);
		await entry.pending;
		delete entry.pending;
		announce(entry);
	};
	/**
	 * Capture once and preserve concurrent invocations under one action identity.
	 * @param vault The addressed vault.
	 * @param input The invocation intent.
	 * @param entries The existing tab's temporary actions.
	 * @returns The shared action snapshot or public capture refusal.
	 */
	const invoke = async (
		vault: string,
		input: Invocation,
		entries: Map<string, Entry>,
	): Promise<Result> => {
		const existing = entries.get(input.request.actionId);
		if (existing !== undefined) return existingReply(existing, vault, input);
		const model = await readArchitectureModel(vault, undefined, undefined, {
			...input.selection,
			explain: input.request,
		});
		if (!model.success) return model;
		const concurrent = entries.get(input.request.actionId);
		if (concurrent !== undefined) return existingReply(concurrent, vault, input);
		const entry = capturedEntry(vault, input, model);
		entries.set(input.request.actionId, entry);
		await start(entry);
		return reply(entry);
	};
	/**
	 * Retry only a settled failure or confirmed cancellation.
	 * @param entry The original capture.
	 * @param entries The tab actions ordered by last invocation or retry.
	 * @returns The new attempt or explicit refusal.
	 */
	const retry = async (entry: Entry, entries: Map<string, Entry>): Promise<Result> => {
		if (!entry.action.retryable || entry.pending !== undefined)
			return refuse(
				"RETRY_UNAVAILABLE",
				"This action cannot be retried while its outcome is pending or complete.",
			);
		entries.delete(entry.action.actionId);
		entries.set(entry.action.actionId, entry);
		await start(entry);
		return reply(entry);
	};
	/**
	 * Cancel the captured submission or exact turn through its existing owner.
	 * @param entry The original capture.
	 * @returns The current action outcome.
	 */
	const cancel = async (entry: Entry): Promise<Result> => {
		if (entry.pending !== undefined)
			return refuse("ACTION_PENDING", "Wait for agent delivery before cancelling this request.");
		if (entry.submission !== undefined) return cancelQueued(scope, entry);
		if (entry.action.status === "running") await interrupt(scope, entry);
		return reply(entry);
	};
	/**
	 * Apply one operation to an existing temporary action.
	 * @param entry The original action.
	 * @param input The operation.
	 * @param entries The tab actions in invocation order.
	 * @returns Its current result.
	 */
	const operate = async (
		entry: Entry,
		input: Exclude<Request, Invocation>,
		entries: Map<string, Entry>,
	) => {
		switch (input.type) {
			case "retry":
				return retry(entry, entries);
			case "cancel":
				const result = await cancel(entry);
				announce(entry);
				return result;
			default:
				return reply(entry);
		}
	};
	/**
	 * Route one existing notification to actions on its exact thread.
	 * @param event The provider event already admitted by the domain owner.
	 * @param event.notification The provider notification.
	 */
	const onNotification: NonNullable<CodexWorkbenchDomain["onNotification"]> = ({
		notification,
	}) => {
		if (!("threadId" in notification.params)) return;
		for (const entry of [...tabs.values()].flatMap((entries) => [...entries.values()])) {
			if (
				entry.threadId !== undefined &&
				scope.identity.identity.decoder.serializeCodexIdentity(entry.threadId) ===
					notification.params.threadId
			) {
				if (noteExplanation(entry, notification)) announce(entry);
			}
		}
	};
	const stopTabs = scope.sessions.onChange(() => {
		const live = new Set(scope.sessions.list().map((tab) => String(tab.id)));
		for (const id of tabs.keys()) if (!live.has(id)) tabs.delete(id);
	});
	/**
	 * Invoke, read, retry, or cancel one explicitly addressed explanation.
	 * @param vault The actual vault.
	 * @param input The shared action.
	 * @returns The temporary result or actionable refusal.
	 */
	const dispatch = async (vault: string, input: Request): Promise<Result> => {
		if (!availableTab(scope, input.tabSessionId))
			return refuse(
				"AGENT_UNAVAILABLE",
				"Open an architecture pane in this tab before asking for an explanation.",
			);
		const entries = entriesFor(tabs, input.tabSessionId);
		if (input.type === "invoke") return invoke(vault, input, entries);
		if (input.type === "latest") return latestAction(entries);
		const entry = entries.get(input.actionId);
		if (entry === undefined)
			return refuse(
				"ACTION_NOT_FOUND",
				"This temporary answer is unavailable. Start a new explanation.",
			);
		const refused = mismatch(entry, vault, input);
		if (refused !== undefined) return refused;
		return operate(entry, input, entries);
	};
	return {
		dispatch,
		onNotification,
		/** Forget temporary answers when this agent generation ends. */
		dispose() {
			stopTabs();
			tabs.clear();
		},
	};
}
/**
 * Reuse the original captured action after concurrent delivery settles.
 * @param entry The original action.
 * @param vault The addressed vault.
 * @param input The repeated invocation.
 * @returns Its current snapshot or an identity refusal.
 */
async function existingReply(entry: Entry, vault: string, input: Invocation) {
	const refused = mismatch(entry, vault, input);
	if (refused !== undefined) return refused;
	await entry.pending;
	return reply(entry);
}
/**
 * Delete an accepted queue submission and wait for the queue owner's evidence.
 * @param scope The existing generation.
 * @param entry The captured submission.
 * @returns Confirmed cancellation or an explicit refusal.
 */
async function cancelQueued(scope: CodexWorkbenchDomainScope, entry: Entry): Promise<Result> {
	if (entry.workhorse === undefined || entry.submission === undefined)
		return refuse("CANCEL_UNCONFIRMED", "Read the action again before cancelling.");
	const removed = await entry.workhorse.components.queue.delete({
		operationId: scope.identity.operation.issuer.mintOperationId(),
		submissionId: entry.submission,
	});
	if (removed.outcome !== "delivered" || removed.queue.some((item) => item.id === entry.submission))
		return refuse(
			"CANCEL_UNCONFIRMED",
			"The agent did not confirm cancellation. Read the action again.",
		);
	entry.action.status = "cancelled";
	entry.action.retryable = true;
	delete entry.submission;
	return reply(entry);
}
/**
 * Request interruption of the exact correlated running turn.
 * @param scope The current generation.
 * @param entry The captured running action.
 */
async function interrupt(scope: CodexWorkbenchDomainScope, entry: Entry) {
	if (entry.threadId !== undefined && entry.turnId !== undefined)
		await scope.session.turnInterrupt({
			threadId: entry.threadId,
			turnId: scope.identity.identity.decoder.adoptTurnId(entry.turnId),
		});
}
export { createExplanationActions };

/**
 * Read the last deliberate invocation or retry in this tab, across navigation.
 * @param entries The tab's existing temporary action owner.
 * @returns The newest action with its actual captured vault, or an empty refusal.
 */
function latestAction(entries: Map<string, Entry>): Result {
	const entry = [...entries.values()].at(-1);
	return entry === undefined
		? refuse("ACTION_NOT_FOUND", "This tab has no temporary answer. Start an explanation.")
		: reply(entry);
}

/**
 * Invalidate temporary answers on the tab's existing pane connections.
 * @param entry The action whose progress changed.
 */
function announce(entry: Entry): void {
	for (const pane of panes.values()) {
		if (tabSessionOf(pane.clientId) === entry.invocation.tabSessionId)
			sendBoardlessToPane(pane.clientId, { type: "architecture_explanations_changed" });
	}
}

/**
 * Share one action map for every request in the tab.
 * @param tabs The generation-owned tab actions.
 * @param tab The existing tab identity.
 * @returns Its existing or newly empty action map.
 */
function entriesFor(tabs: Map<string, Map<string, Entry>>, tab: string): Map<string, Entry> {
	let entries = tabs.get(tab);
	if (entries === undefined) {
		entries = new Map();
		tabs.set(tab, entries);
	}
	return entries;
}

/**
 * Require a registered browser tab or its existing conversation before accepting an action.
 * @param scope The existing generation sessions.
 * @param id The explicit tab identity.
 * @returns Whether this generation can serve the addressed tab.
 */
function availableTab(scope: CodexWorkbenchDomainScope, id: string): boolean {
	const tabId = parseTabSessionId(id);
	if (tabId === null) return false;
	return (
		scope.sessions.list().some((tab) => tab.id === tabId) ||
		[...panes.values()].some((pane) => tabSessionOf(pane.clientId) === tabId)
	);
}
