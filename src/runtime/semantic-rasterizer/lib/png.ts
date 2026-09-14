// The two numbers a PNG states about itself, read from its header. A capture
// is checked against what was asked for before it is answered, so a bitmap
// that Chromium scaled, cropped or refused can never pass as the diagram.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Where the first chunk's type sits, and the header length that must exist. */
const IHDR_TYPE_OFFSET = 12;
const IHDR_END = 24;

/** The pixel size a PNG header states. */
interface PngDimensions {
	readonly width: number;
	readonly height: number;
}

/**
 * Whether the bytes begin with the PNG signature and an IHDR chunk.
 * @param bytes The file.
 * @returns Whether they do.
 */
function hasPngHeader(bytes: Uint8Array): boolean {
	if (bytes.length < IHDR_END) return false;
	if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return false;
	const type = Buffer.from(bytes.subarray(IHDR_TYPE_OFFSET, IHDR_TYPE_OFFSET + 4)).toString(
		"latin1",
	);
	return type === "IHDR";
}

/**
 * The width and height a PNG states in its header.
 * @param bytes The file.
 * @returns Its dimensions.
 * @throws {Error} When the bytes are not a PNG with an IHDR chunk first.
 */
function readPngDimensions(bytes: Uint8Array): PngDimensions {
	if (!hasPngHeader(bytes)) {
		throw new Error("The capture is not a PNG file.");
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

export { readPngDimensions, type PngDimensions };
