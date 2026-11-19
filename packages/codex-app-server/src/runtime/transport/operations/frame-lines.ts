import {
	CodexTransportUsageError,
	CodexTransportWriteError,
} from "#runtime/transport/clients/transport-errors.ts";

/**
 * The transport error for a frame the encoder could not write as JSON within its bound.
 * @param reason Why the encoder refused the frame.
 * @param field What the frame carries, for the message.
 * @param maximumBytes The bound the frame was held to.
 * @returns A usage error for a value with no JSON form, else a frame-too-large write error.
 */
function encodingError(
	reason: "unencodable" | "too-large",
	field: string,
	maximumBytes: number,
): CodexTransportUsageError | CodexTransportWriteError {
	return reason === "unencodable"
		? new CodexTransportUsageError(`${field} is not JSON serializable`)
		: new CodexTransportWriteError("frame-too-large", `${field} exceeds ${maximumBytes} bytes`);
}

export { encodingError };
