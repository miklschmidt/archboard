/**
 * Preserve exact original text and expose unsupported bytes without replacement characters.
 * @param base64 The retained original bytes.
 * @returns UTF-8 text when supported, otherwise its lossless base64 encoding.
 */
function originalSource(base64: string): { encoding: string; text: string } {
	try {
		const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
		return {
			encoding: "UTF-8",
			text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
		};
	} catch {
		return { encoding: "Base64", text: base64 };
	}
}

export { originalSource };
