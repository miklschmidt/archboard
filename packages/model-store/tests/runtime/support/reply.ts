import {
	type ModelReply,
	type ModelRequest,
	parseModelRequest,
	readModelReply,
	type ReplyOperation,
	type RequestOperation,
} from "@archboard/model-contract";

/**
 * Read what the store answered as the answer of its operation, or fail with the contract's reason.
 * @param operation The operation that was asked.
 * @param body The answer as received.
 * @returns The answer.
 */
export function replyOf<O extends ReplyOperation>(operation: O, body: unknown): ModelReply<O> {
	const read = readModelReply(operation, body);
	if (!read.success) throw read.error;
	return read.data;
}

/**
 * Read an intent as its operation reads a request, or fail with the contract's reason.
 * @param operation The operation asked for.
 * @param body The intent as written.
 * @returns The intent, defaults filled.
 */
export function requestOf<O extends RequestOperation>(
	operation: O,
	body: unknown,
): ModelRequest<O> {
	const read = parseModelRequest(operation, body);
	if (!read.success) throw read.error;
	return read.data;
}
