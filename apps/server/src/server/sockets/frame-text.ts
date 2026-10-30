import type { RawData } from "ws";

/**
 * One socket frame as text. ws hands a frame over as a buffer, an array
 * buffer, or the buffers a fragmented message arrived in.
 * @param raw The frame.
 * @returns Its text.
 */
function frameText(raw: RawData): string {
	if (Array.isArray(raw)) {
		return Buffer.concat(raw).toString("utf8");
	}
	return Buffer.from(raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw).toString("utf8");
}

export { frameText };
