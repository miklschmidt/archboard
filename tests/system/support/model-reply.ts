import { readModelReply, type ModelReply, type ReplyOperation } from "@archboard/model-contract";

/**
 * The answer a body carries for one operation.
 * @param operation The operation that was asked.
 * @param body The body as received: a response's JSON or a CLI's `--json` output.
 * @returns The answer, its success or its refusal.
 * @throws The reading's error when the body is not an answer to the operation.
 */
export function parsedReply<O extends ReplyOperation>(operation: O, body: unknown): ModelReply<O> {
	const read = readModelReply(operation, body);
	if (!read.success) throw read.error;
	return read.data;
}
