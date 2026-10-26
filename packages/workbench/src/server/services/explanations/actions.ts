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
		await entry.pending;
		delete entry.pending;
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
	 * @returns The new attempt or explicit refusal.
	 */
	const retry = async (entry: Entry): Promise<Result> => {
		if (!entry.action.retryable || entry.pending !== undefined)
			return refuse(
				"RETRY_UNAVAILABLE",
				"This action cannot be retried while its outcome is pending or complete.",
			);
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
	 * @returns Its current result.
	 */
	const operate = (entry: Entry, input: Exclude<Request, Invocation>) => {
		switch (input.type) {
			case "retry":
				return retry(entry);
			case "cancel":
				return cancel(entry);
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
		for (const entries of tabs.values())
			for (const entry of entries.values()) {
				if (
					entry.threadId !== undefined &&
					scope.identity.identity.decoder.serializeCodexIdentity(entry.threadId) ===
						notification.params.threadId
				)
					noteExplanation(entry, notification);
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
		const tabId = parseTabSessionId(input.tabSessionId);
		if (!scope.sessions.list().some((tab) => tab.id === tabId))
			return refuse(
				"AGENT_UNAVAILABLE",
				"Open a conversation in this tab before asking for an explanation.",
			);
		const entries = tabs.get(input.tabSessionId) ?? new Map<string, Entry>();
		tabs.set(input.tabSessionId, entries);
		if (input.type === "invoke") return invoke(vault, input, entries);
		const entry = entries.get(input.actionId);
		if (entry === undefined)
			return refuse(
				"ACTION_NOT_FOUND",
				"This temporary answer is unavailable. Start a new explanation.",
			);
		return mismatch(entry, vault, input) ?? operate(entry, input);
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
