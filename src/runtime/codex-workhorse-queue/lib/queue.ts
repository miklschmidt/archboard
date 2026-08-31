import { createTextUserInput, type TextUserInput } from "../../codex-instructions/index.js";
import { CodexSessionMutationError } from "../../codex-session/index.js";
import type { SessionQueuedSubmission } from "../../codex-session/index.js";
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
	type WorkhorseQueueOperationIdPort,
	type WorkhorseQueueOptions,
	type WorkhorseQueueOperation,
} from "./contract.js";
import {
	expectedAdd,
	expectedDelete,
	expectedReorder,
	expectedStart,
	expectedUpdate,
	sameBinding,
	snapshot,
} from "./reconcile.js";
import { assertCompleteOrder, queueMutationTarget } from "./input-validation.js";
import { queueStartClientUserMessageId, queueStartTarget } from "./start-correlation.js";

const QUEUE_PAGE_LIMIT = 100;

type MutationResponse = unknown;
type MutationRequest<OperationIdValue extends string> =
	| QueueAddRequest<OperationIdValue>
	| QueueUpdateRequest<OperationIdValue>
	| QueueDeleteRequest<OperationIdValue>
	| QueueReorderRequest<OperationIdValue>
	| QueueStartRequest<OperationIdValue>;

function queueError(
	code: ConstructorParameters<typeof CodexWorkhorseQueueError>[0],
	message: string,
	options: ConstructorParameters<typeof CodexWorkhorseQueueError>[2] = {},
): CodexWorkhorseQueueError {
	return new CodexWorkhorseQueueError(code, message, options);
}

function inputForPrompt(prompt: string): TextUserInput {
	try {
		return createTextUserInput(prompt);
	} catch (error) {
		throw queueError(
			"invalid_input",
			"Queue prompts must be nonempty text within the authored limit.",
			{
				cause: error,
			},
		);
	}
}

function mutationOutcome(error: unknown): QueueMutationOutcome {
	return error instanceof CodexSessionMutationError ? error.outcome : "outcome_unknown";
}

function operationIdPort<OperationIdValue extends string>(
	port: WorkhorseQueueOperationIdPort<OperationIdValue>,
	operation: WorkhorseQueueMutation,
	operationId: OperationIdValue,
): string | null {
	try {
		port.assertCurrent(operationId);
		if (operation !== "add") return null;
		const serialized = port.serialize(operationId);
		if (typeof serialized !== "string" || serialized.length === 0)
			throw new TypeError("the serialized operation identity must not be empty");
		return serialized;
	} catch (error) {
		if (error instanceof CodexWorkhorseQueueError) throw error;
		throw queueError(
			"invalid_input",
			"The queue mutation requires a current host-issued operation identity.",
			{ operation, cause: error },
		);
	}
}

export function createCodexWorkhorseQueue<OperationIdValue extends string>(
	options: WorkhorseQueueOptions<OperationIdValue>,
): CodexWorkhorseQueue<OperationIdValue> {
	let commandTail: Promise<void> = Promise.resolve();

	const enqueue = <Value>(work: () => Promise<Value>): Promise<Value> => {
		const result = commandTail.then(work, work);
		commandTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};

	const currentBinding = (): WorkhorseQueueBinding => {
		const binding = options.currentBinding();
		if (binding === null)
			throw queueError(
				"not_ready",
				"The coordinator and created workhorse must be linked before queue access.",
			);
		return Object.freeze({ ...binding });
	};

	const isCurrentBinding = (binding: WorkhorseQueueBinding): boolean => {
		const current = options.currentBinding();
		return (
			current !== null &&
			sameBinding(current, binding) &&
			options.identity.validator.isCurrentEpoch(binding.childId, binding.epoch)
		);
	};

	const assertCurrentBinding = (
		binding: WorkhorseQueueBinding,
		operation?: WorkhorseQueueOperation,
		outcome?: QueueMutationOutcome,
	): void => {
		if (isCurrentBinding(binding)) return;
		throw queueError(
			"stale_link",
			"The coordinator or workhorse link changed; re-read the current queue before retrying.",
			{ operation, outcome },
		);
	};

	type AcceptedBinding =
		| { readonly binding: WorkhorseQueueBinding; readonly error?: never }
		| { readonly binding?: never; readonly error: unknown };

	const captureBinding = (): AcceptedBinding => {
		try {
			return { binding: currentBinding() };
		} catch (error) {
			return { error };
		}
	};

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

	const readAuthoritative = async (binding: WorkhorseQueueBinding): Promise<QueueSnapshot> => {
		const seenCursors = new Set<string>();
		const seenSubmissionIds = new Set<string>();
		const submissions: SessionQueuedSubmission[] = [];
		let cursor: string | null = null;

		for (;;) {
			assertCurrentBinding(binding);
			let page: Awaited<ReturnType<typeof options.session.queueListPage>>;
			try {
				page = await options.session.queueListPage({
					threadId: binding.workhorseThreadId,
					cursor,
					limit: QUEUE_PAGE_LIMIT,
				});
			} catch (error) {
				throw queueError(
					"transport_failure",
					"The authoritative workhorse queue could not be read.",
					{
						cause: error,
					},
				);
			}
			assertCurrentBinding(binding);
			if (
				!Array.isArray(page.data) ||
				(page.nextCursor !== null && typeof page.nextCursor !== "string")
			)
				throw queueError("invalid_result", "The workhorse returned an invalid queue page.");
			for (const submission of page.data) {
				if (
					submission === null ||
					typeof submission.id !== "string" ||
					submission.id.length === 0 ||
					seenSubmissionIds.has(submission.id)
				)
					throw queueError(
						"invalid_result",
						"The workhorse queue contains a duplicate or empty submission id.",
					);
				seenSubmissionIds.add(submission.id);
				submissions.push(submission);
			}
			if (page.nextCursor === null) return snapshot(submissions);
			if (seenCursors.has(page.nextCursor))
				throw queueError(
					"repeated_cursor",
					"The workhorse queue returned a repeated pagination cursor.",
				);
			seenCursors.add(page.nextCursor);
			cursor = page.nextCursor;
		}
	};

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

	const list = (): Promise<QueueListResult> =>
		enqueueForBinding("list", async (binding) => {
			const queue = await readAuthoritative(binding);
			const result: QueueListResult = { operation: "list", queue };
			return Object.freeze(result);
		});

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
					beforeEffect: request.beforeEffect,
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
					beforeEffect: request.beforeEffect,
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
					beforeEffect: request.beforeEffect,
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
					beforeEffect: request.beforeEffect,
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
					beforeEffect: request.beforeEffect,
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

	return Object.freeze({ list, add, update, delete: remove, reorder, start });
}
