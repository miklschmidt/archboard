import { createTextUserInput, type TextUserInput } from "@/runtime/codex-instructions";
import { CodexSessionMutationError } from "@/runtime/codex-session";
import {
	CodexWorkhorseQueueError,
	type QueueMutationOutcome,
	type WorkhorseQueueMutation,
	type WorkhorseQueueOperationIdPort,
} from "@/runtime/codex-workhorse-queue/lib/contract";

/**
 * Build a queue error; exists so each refusal reads as one call rather than a constructor.
 * @param code - Why the queue refused.
 * @param message - The diagnostic for the caller.
 * @param options - The operation, settled outcome, queue and cause, as far as they are known.
 * @returns The error to throw.
 */
function queueError(
	code: ConstructorParameters<typeof CodexWorkhorseQueueError>[0],
	message: string,
	options: ConstructorParameters<typeof CodexWorkhorseQueueError>[2] = {},
): CodexWorkhorseQueueError {
	return new CodexWorkhorseQueueError(code, message, options);
}

/**
 * Encode a prompt as the single text input a queued submission carries, refusing anything the authored limits do not allow before the queue is touched.
 * @param prompt - The prompt text.
 * @returns The encoded input item.
 */
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

/**
 * What a failed queue mutation proved about delivery: the session's own assertion when it made one, otherwise nothing, because the submission may exist.
 * @param error - The thrown value.
 * @returns The outcome to report.
 */
function mutationOutcome(error: unknown): QueueMutationOutcome {
	return error instanceof CodexSessionMutationError ? error.outcome : "outcome_unknown";
}

/**
 * Prove the mutation's operation identity is the current host-issued one, and, for an add, serialize it as the client identity the submission will carry. Only an add needs that text: it is what makes the new submission attributable to this operation.
 * @param port - The operation identity port.
 * @param operation - The mutation being made.
 * @param operationId - The identity the caller supplied.
 * @returns The client identity for an add, or null for every other mutation.
 */
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

export { queueError, inputForPrompt, mutationOutcome, operationIdPort };
