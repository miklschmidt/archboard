import type { SessionQueuedSubmission } from "@/runtime/codex-session";
import {
	CodexWorkhorseQueueError,
	type CodexWorkhorseQueue,
	type QueueAddRequest,
	type QueueAddResult,
	type QueueDeleteRequest,
	type QueueDeleteResult,
	type QueueListResult,
	type QueueMutationOutcome,
	type QueueReorderRequest,
	type QueueReorderResult,
	type QueueSnapshot,
	type QueueStartRequest,
	type QueueStartResult,
	type QueueUpdateRequest,
	type QueueUpdateResult,
	type WorkhorseQueueBinding,
	type WorkhorseQueueMutation,
	type WorkhorseQueueOptions,
	type WorkhorseQueueOperation,
} from "@/runtime/codex-workhorse-queue/lib/contract";
import {
	expectedAdd,
	expectedDelete,
	expectedReorder,
	expectedStart,
	expectedUpdate,
	sameBinding,
	snapshot,
} from "@/runtime/codex-workhorse-queue/lib/reconcile";
import {
	assertCompleteOrder,
	queueMutationTarget,
} from "@/runtime/codex-workhorse-queue/lib/input-validation";
import {
	queueStartClientUserMessageId,
	queueStartTarget,
} from "@/runtime/codex-workhorse-queue/lib/start-correlation";
import {
	inputForPrompt,
	mutationOutcome,
	operationIdPort,
	queueError,
} from "@/runtime/codex-workhorse-queue/lib/mutation-inputs";

const QUEUE_PAGE_LIMIT = 100;

/** One page of the authoritative queue, as the session reports it. */
type QueueListPage = Awaited<ReturnType<WorkhorseQueueOptions<string>["session"]["queueListPage"]>>;

/**
 * Take one page's submissions, refusing a page whose shape or identities cannot be trusted: a
 * duplicate or empty id would make the queue unattributable.
 * @param page - The page the app-server returned.
 * @param seenSubmissionIds - The identities already taken from earlier pages.
 * @param submissions - The submissions collected so far, appended to in place.
 */
function collectQueuePage(
	page: QueueListPage,
	seenSubmissionIds: Set<string>,
	submissions: SessionQueuedSubmission[],
): void {
	if (page.nextCursor !== null && typeof page.nextCursor !== "string") {
		throw queueError("invalid_result", "The workhorse returned an invalid queue page.");
	}
	for (const submission of page.data) {
		if (submission.id.length === 0 || seenSubmissionIds.has(submission.id)) {
			throw queueError(
				"invalid_result",
				"The workhorse queue contains a duplicate or empty submission id.",
			);
		}
		seenSubmissionIds.add(submission.id);
		submissions.push(submission);
	}
}

/**
 * The cursor to read next, refusing a cursor already followed so a queue that keeps handing
 * back the same page cannot page forever.
 * @param nextCursor - The cursor the page carried.
 * @param seenCursors - The cursors already followed.
 * @returns The next cursor, or null when the queue is fully read.
 */
function nextQueueCursor(nextCursor: string | null, seenCursors: Set<string>): string | null {
	if (nextCursor === null) {
		return null;
	}
	if (seenCursors.has(nextCursor)) {
		throw queueError(
			"repeated_cursor",
			"The workhorse queue returned a repeated pagination cursor.",
		);
	}
	seenCursors.add(nextCursor);
	return nextCursor;
}

type MutationResponse = unknown;
type MutationRequest<OperationIdValue extends string> =
	| QueueAddRequest<OperationIdValue>
	| QueueUpdateRequest<OperationIdValue>
	| QueueDeleteRequest<OperationIdValue>
	| QueueReorderRequest<OperationIdValue>
	| QueueStartRequest<OperationIdValue>;

/**
 * Build the module that owns the workhorse's submission queue. Every command runs behind the ones before it, against a binding proven current on both sides of each remote call, and each mutation is reconciled against a fresh authoritative read before it may be called delivered.
 * @param options - The session, binding accessor, identity authority and operation identity port.
 * @returns The queue module.
 */
export function createCodexWorkhorseQueue<OperationIdValue extends string>(
	options: WorkhorseQueueOptions<OperationIdValue>,
): CodexWorkhorseQueue<OperationIdValue> {
	let commandTail: Promise<void> = Promise.resolve();
	let closed = false;

	/**
	 * Run one unit of work after every command enqueued before it, refusing outright once the queue is closed.
	 * @param work - The command to run when its turn comes.
	 * @returns What the command produced.
	 */
	const enqueue = <Value>(work: () => Promise<Value>): Promise<Value> => {
		if (closed)
			return Promise.reject(
				queueError("closed", "The workhorse queue is closed and accepts no further work."),
			);
		const result = commandTail.then(work, work);
		commandTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};

	/**
	 * The coordinator-and-workhorse binding the queue works through, refused when the pane has no linked workhorse yet.
	 * @returns A frozen copy of the current binding.
	 */
	const currentBinding = (): WorkhorseQueueBinding => {
		const binding = options.currentBinding();
		if (binding === null)
			throw queueError(
				"not_ready",
				"The coordinator and created workhorse must be linked before queue access.",
			);
		return Object.freeze({ ...binding });
	};

	/**
	 * Whether a captured binding is still the host's current one, on a child epoch that is still current.
	 * @param binding - The binding captured when the command started.
	 * @returns True when the binding still holds.
	 */
	const isCurrentBinding = (binding: WorkhorseQueueBinding): boolean => {
		const current = options.currentBinding();
		return (
			current !== null &&
			sameBinding(current, binding) &&
			options.identity.validator.isCurrentEpoch(binding.childId, binding.epoch)
		);
	};

	/**
	 * Refuse a command whose link changed. Called around every remote call, because a queue read or mutation that spans a link change belongs to neither link.
	 * @param binding - The binding captured when the command started.
	 * @param operation - The operation being refused, when there is one.
	 * @param outcome - The delivery outcome to report, when it is known.
	 */
	const assertCurrentBinding = (
		binding: WorkhorseQueueBinding,
		operation?: WorkhorseQueueOperation,
		outcome?: QueueMutationOutcome,
	): void => {
		if (isCurrentBinding(binding)) return;
		throw queueError(
			"stale_link",
			"The coordinator or workhorse link changed; re-read the current queue before retrying.",
			{
				...(operation === undefined ? {} : { operation }),
				...(outcome === undefined ? {} : { outcome }),
			},
		);
	};

	type AcceptedBinding =
		| { readonly binding: WorkhorseQueueBinding; readonly error?: never }
		| { readonly binding?: never; readonly error: unknown };

	/**
	 * Capture the current binding before the command is queued, keeping a refusal as a value so it can be reported without entering the queue.
	 * @returns The binding, or the error that stopped it.
	 */
	const captureBinding = (): AcceptedBinding => {
		try {
			return { binding: currentBinding() };
		} catch (error) {
			return { error };
		}
	};

	/**
	 * Queue one command against the binding captured at call time, re-proving that binding when the command's turn comes.
	 * @param operation - The operation the command performs.
	 * @param work - The command, given the captured binding.
	 * @returns What the command produced.
	 */
	const enqueueForBinding = <Value>(
		operation: WorkhorseQueueOperation,
		work: (binding: WorkhorseQueueBinding) => Promise<Value>,
	): Promise<Value> => {
		const accepted = captureBinding();
		if ("error" in accepted) return Promise.reject(accepted.error);
		return enqueue(async () => {
			assertCurrentBinding(accepted.binding, operation);
			return work(accepted.binding);
		});
	};

	/**
	 * Read one page of the authoritative queue, proving the binding still holds on both sides of
	 * the read.
	 * @param binding - The coordinator and workhorse the queue belongs to.
	 * @param cursor - The page to read, or null for the first.
	 * @returns The page the app-server returned.
	 */
	const readQueuePage = async (
		binding: WorkhorseQueueBinding,
		cursor: string | null,
	): Promise<Awaited<ReturnType<typeof options.session.queueListPage>>> => {
		assertCurrentBinding(binding);
		try {
			const page = await options.session.queueListPage({
				threadId: binding.workhorseThreadId,
				cursor,
				limit: QUEUE_PAGE_LIMIT,
			});
			assertCurrentBinding(binding);
			return page;
		} catch (error) {
			if (error instanceof CodexWorkhorseQueueError) {
				throw error;
			}
			throw queueError(
				"transport_failure",
				"The authoritative workhorse queue could not be read.",
				{
					cause: error,
				},
			);
		}
	};

	/**
	 * Read the whole authoritative queue, page by page, re-checking the binding around every read
	 * so a queue is never assembled across a link that changed underneath it.
	 * @param binding - The coordinator and workhorse the queue belongs to.
	 * @returns The frozen queue.
	 */
	const readAuthoritative = async (binding: WorkhorseQueueBinding): Promise<QueueSnapshot> => {
		const seenCursors = new Set<string>();
		const seenSubmissionIds = new Set<string>();
		const submissions: SessionQueuedSubmission[] = [];
		let cursor: string | null = null;
		do {
			// oxlint-disable-next-line no-await-in-loop -- pagination is sequential by contract: each page's cursor comes from the one before it, and the binding is re-checked between reads
			const page = await readQueuePage(binding, cursor);
			collectQueuePage(page, seenSubmissionIds, submissions);
			cursor = nextQueueCursor(page.nextCursor, seenCursors);
		} while (cursor !== null);
		return snapshot(submissions);
	};

	/**
	 * Re-read the authoritative queue after a mutation. A read that fails leaves the mutation unreconciled: it is reported as unknown rather than guessed at, and a link change during the read is reported as such.
	 * @param binding - The binding the mutation ran under.
	 * @param operation - The mutation that was made.
	 * @param outcome - What the mutation itself settled as.
	 * @returns The queue as the app-server now reports it.
	 */
	const freshAfterMutation = async (
		binding: WorkhorseQueueBinding,
		operation: WorkhorseQueueMutation,
		outcome: QueueMutationOutcome,
	): Promise<QueueSnapshot> => {
		try {
			return await readAuthoritative(binding);
		} catch (error) {
			if (error instanceof CodexWorkhorseQueueError && error.code === "stale_link")
				throw queueError(
					"stale_link",
					"The queue mutation returned after its coordinator or workhorse link changed.",
					{ operation, outcome: "outcome_unknown", cause: error },
				);
			throw queueError(
				"reconciliation_failed",
				"The queue mutation outcome cannot be reconciled until the authoritative queue is readable.",
				{ operation, outcome, cause: error },
			);
		}
	};

	/**
	 * Run one queue mutation end to end: prove the identity and binding, read the queue before, let the caller's pre-effect check run last, issue the mutation, then re-read and reconcile. A mutation only counts as delivered when the fresh queue accounts for it exactly.
	 * @param operation - The mutation being made.
	 * @param binding - The binding captured for the command.
	 * @param request - The mutation request as it will be recorded.
	 * @param invoke - Issues the mutation against the session.
	 * @param validateBefore - Checks the queue before the effect and names the target.
	 * @param reconciles - Whether the queue after the mutation accounts for it exactly.
	 * @returns The operation, its identity, its settled outcome and the fresh queue.
	 */
	const runMutation = async <
		Operation extends WorkhorseQueueMutation,
		Response extends MutationResponse,
	>(
		operation: Operation,
		binding: WorkhorseQueueBinding,
		request: MutationRequest<OperationIdValue> & { readonly operation: Operation },
		invoke: (
			binding: WorkhorseQueueBinding,
			clientUserMessageId: string | null,
		) => Promise<Response>,
		validateBefore: (queue: QueueSnapshot) => SessionQueuedSubmission | null,
		reconciles: (
			before: QueueSnapshot,
			after: QueueSnapshot,
			response: Response,
			clientUserMessageId: string | null,
		) => boolean,
	): Promise<{
		readonly operation: Operation;
		readonly operationId: OperationIdValue;
		readonly outcome: QueueMutationOutcome;
		readonly queue: QueueSnapshot;
	}> => {
		assertCurrentBinding(binding, operation);
		const clientUserMessageId = operationIdPort(
			options.operationIds,
			operation,
			request.operationId,
		);
		const before = await readAuthoritative(binding);
		assertCurrentBinding(binding, operation);
		const target = validateBefore(before);
		try {
			options.operationIds.assertCurrent(request.operationId);
		} catch (error) {
			throw queueError(
				"invalid_input",
				"The queue mutation operation identity is no longer current.",
				{ operation, cause: error },
			);
		}
		assertCurrentBinding(binding, operation);
		try {
			await request.beforeEffect?.(Object.freeze({ operation, target }));
		} catch (error) {
			throw queueError(
				"authorization_failed",
				"Queue mutation authority changed before the remote effect.",
				{ operation, outcome: "not_delivered", cause: error },
			);
		}
		assertCurrentBinding(binding, operation);

		let response: Response;
		try {
			response = await invoke(binding, clientUserMessageId);
		} catch (error) {
			assertCurrentBinding(binding, operation, "outcome_unknown");
			const outcome = mutationOutcome(error);
			const queue = await freshAfterMutation(binding, operation, outcome);
			return Object.freeze({ operation, operationId: request.operationId, outcome, queue });
		}

		assertCurrentBinding(binding, operation, "outcome_unknown");
		const after = await freshAfterMutation(binding, operation, "delivered");
		const outcome: QueueMutationOutcome = reconciles(before, after, response, clientUserMessageId)
			? "delivered"
			: "outcome_unknown";
		return Object.freeze({ operation, operationId: request.operationId, outcome, queue: after });
	};

	/**
	 * Read the authoritative queue.
	 * @returns The current queue.
	 */
	const list = (): Promise<QueueListResult> =>
		enqueueForBinding("list", async (binding) => {
			const queue = await readAuthoritative(binding);
			const result: QueueListResult = { operation: "list", queue };
			return Object.freeze(result);
		});

	/**
	 * Queue one prompt behind the running turn, under the client identity that makes the new submission attributable to this operation.
	 * @param request - The prompt, operation identity and pre-effect check.
	 * @returns The mutation result and the fresh queue.
	 */
	const add = (
		request: QueueAddRequest<OperationIdValue>,
	): Promise<QueueAddResult<OperationIdValue>> =>
		enqueueForBinding("add", async (acceptedBinding) => {
			const input = inputForPrompt(request.prompt);
			const result = await runMutation(
				"add",
				acceptedBinding,
				{
					operation: "add",
					operationId: request.operationId,
					prompt: request.prompt,
					...(request.beforeEffect === undefined ? {} : { beforeEffect: request.beforeEffect }),
				},
				(rpcBinding, clientUserMessageId) => {
					if (clientUserMessageId === null)
						throw new Error("add requires a serialized client user message identity");
					return options.session.queueAdd({
						threadId: rpcBinding.workhorseThreadId,
						input: [input],
						clientUserMessageId,
					});
				},
				() => null,
				(before, after, response, clientUserMessageId) =>
					clientUserMessageId !== null &&
					expectedAdd(before, after, response, input, clientUserMessageId),
			);
			return result;
		});

	/**
	 * Replace a queued submission's prompt, keeping its own client identity.
	 * @param request - The submission, prompt, operation identity and pre-effect check.
	 * @returns The mutation result and the fresh queue.
	 */
	const update = (
		request: QueueUpdateRequest<OperationIdValue>,
	): Promise<QueueUpdateResult<OperationIdValue>> =>
		enqueueForBinding("update", async (acceptedBinding) => {
			const input = inputForPrompt(request.prompt);
			return runMutation(
				"update",
				acceptedBinding,
				{
					operation: "update",
					operationId: request.operationId,
					submissionId: request.submissionId,
					prompt: request.prompt,
					...(request.beforeEffect === undefined ? {} : { beforeEffect: request.beforeEffect }),
				},
				(rpcBinding) =>
					options.session.queueUpdate({
						threadId: rpcBinding.workhorseThreadId,
						queuedSubmissionId: request.submissionId,
						input: [input],
					}),
				(before) => queueMutationTarget(before, request.submissionId, "update"),
				(before, after, response) =>
					expectedUpdate(before, after, response, request.submissionId, input),
			);
		});

	/**
	 * Remove one queued submission.
	 * @param request - The submission, operation identity and pre-effect check.
	 * @returns The mutation result and the fresh queue.
	 */
	const remove = (
		request: QueueDeleteRequest<OperationIdValue>,
	): Promise<QueueDeleteResult<OperationIdValue>> =>
		enqueueForBinding("delete", (acceptedBinding) =>
			runMutation(
				"delete",
				acceptedBinding,
				{
					operation: "delete",
					operationId: request.operationId,
					submissionId: request.submissionId,
					...(request.beforeEffect === undefined ? {} : { beforeEffect: request.beforeEffect }),
				},
				(rpcBinding) =>
					options.session.queueDelete({
						threadId: rpcBinding.workhorseThreadId,
						queuedSubmissionId: request.submissionId,
					}),
				(before) => queueMutationTarget(before, request.submissionId, "delete"),
				(before, after, response) => expectedDelete(before, after, response, request.submissionId),
			),
		);

	/**
	 * Reorder the queue, refusing an order that is not exactly the current queue's ids.
	 * @param request - The complete order, operation identity and pre-effect check.
	 * @returns The mutation result and the fresh queue.
	 */
	const reorder = (
		request: QueueReorderRequest<OperationIdValue>,
	): Promise<QueueReorderResult<OperationIdValue>> =>
		enqueueForBinding("reorder", (acceptedBinding) =>
			runMutation(
				"reorder",
				acceptedBinding,
				{
					operation: "reorder",
					operationId: request.operationId,
					orderedSubmissionIds: request.orderedSubmissionIds,
					...(request.beforeEffect === undefined ? {} : { beforeEffect: request.beforeEffect }),
				},
				(rpcBinding) =>
					options.session.queueReorder({
						threadId: rpcBinding.workhorseThreadId,
						queuedSubmissionIds: Array.from(request.orderedSubmissionIds),
					}),
				(before) => {
					assertCompleteOrder(before, request.orderedSubmissionIds);
					return null;
				},
				(before, after) => expectedReorder(before, after, request.orderedSubmissionIds),
			),
		);

	/**
	 * Start one queued submission now, reporting the turn it started and the client identity it carried so the caller can correlate the turn to its own submission.
	 * @param request - The submission, operation identity and pre-effect check.
	 * @returns The mutation result, the started turn and the client identity.
	 */
	const start = (
		request: QueueStartRequest<OperationIdValue>,
	): Promise<QueueStartResult<OperationIdValue>> =>
		enqueueForBinding("start", async (acceptedBinding) => {
			let clientUserMessageId: string | null = null;
			let turnId = null;
			const result = await runMutation(
				"start",
				acceptedBinding,
				{
					operation: "start",
					operationId: request.operationId,
					submissionId: request.submissionId,
					...(request.beforeEffect === undefined ? {} : { beforeEffect: request.beforeEffect }),
				},
				async (rpcBinding) => {
					const response = await options.session.queueStart({
						threadId: rpcBinding.workhorseThreadId,
						queuedSubmissionId: request.submissionId,
					});
					turnId = response.turn.id;
					return response;
				},
				(before) => {
					const target = queueStartTarget(before, request.submissionId);
					clientUserMessageId = target.clientUserMessageId;
					return target;
				},
				(before, after) => expectedStart(before, after, request.submissionId),
			);
			return Object.freeze({
				...result,
				clientUserMessageId: queueStartClientUserMessageId(clientUserMessageId),
				turnId,
			});
		});

	/**
	 * Close the queue and wait for the commands already accepted to finish. Nothing new is
	 * accepted after this, so a shutdown never leaves a mutation half-reconciled.
	 * @returns When the last accepted command has settled.
	 */
	const shutdown = async (): Promise<void> => {
		closed = true;
		await commandTail;
	};

	return Object.freeze({ list, add, update, delete: remove, reorder, start, shutdown });
}
