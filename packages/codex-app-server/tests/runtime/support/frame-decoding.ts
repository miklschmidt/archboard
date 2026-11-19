import {
	decodeFrame,
	decodeFrameBody,
	type FrameBody,
	type InboundFrame,
	type ResponseBody,
} from "#runtime/protocol/frames.ts";
import type {
	DecodedServerNotification,
	DecodedServerRequest,
} from "#runtime/protocol/protocol-decoder.ts";
import type { ResponseMethod } from "#runtime/protocol/protocol-methods.ts";

/**
 * The stdout line a JSON value arrives as.
 * @param value The frame value.
 * @returns Its line, without the newline.
 */
function lineOf(value: unknown): Buffer {
	return Buffer.from(JSON.stringify(value), "utf8");
}

/**
 * Decodes a JSON value as a stdout line.
 * @param value The frame value.
 * @returns The classified frame.
 */
export function frameOf(value: unknown): InboundFrame {
	return decodeFrame(lineOf(value));
}

/**
 * The decoded body, or the decoder's failure thrown, so a test can assert what it threw.
 * @param body The body.
 * @returns The value.
 */
function valueOrThrow<Value>(body: FrameBody<Value>): Value {
	if (!body.ok) throw body.error;
	return body.value;
}

/**
 * Decodes a server notification envelope through the frame decoder.
 * @param value The envelope.
 * @returns The notification; throws the decoder's failure.
 */
export function decodeNotificationValue(value: unknown): DecodedServerNotification {
	const frame = frameOf(value);
	if (frame.kind !== "notification") throw new Error(`expected a notification, got ${frame.kind}`);
	return valueOrThrow(decodeFrameBody(frame));
}

/**
 * Decodes a server request envelope through the frame decoder.
 * @param value The envelope.
 * @returns The request; throws the decoder's failure.
 */
export function decodeRequestValue(value: unknown): DecodedServerRequest {
	const frame = frameOf(value);
	if (frame.kind !== "request") throw new Error(`expected a request, got ${frame.kind}`);
	return valueOrThrow(decodeFrameBody(frame));
}

/**
 * Decodes a response envelope through the frame decoder for the method it answers.
 * @param method The method of the request it answers.
 * @param value The envelope.
 * @returns The result or error; throws the decoder's failure.
 */
export function decodeResponseValue<Method extends ResponseMethod>(
	method: Method,
	value: unknown,
): ResponseBody<Method> {
	const frame = frameOf(value);
	if (frame.kind !== "response") throw new Error(`expected a response, got ${frame.kind}`);
	return valueOrThrow(decodeFrameBody(frame, method));
}
