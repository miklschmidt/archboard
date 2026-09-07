// lz-string decompressFromBase64 (pieroxy/lz-string, MIT), inlined to keep
// the package dependency-free. The Obsidian Excalidraw plugin stores a scene
// as ```compressed-json by default, which is this encoding.

const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const f = String.fromCharCode;

/** A bit-level reader over the compressed stream. */
interface BitReader {
	/** Read the next `n` bits, least significant first. */
	read: (n: number) => number;
	/** Index of the next input value to fetch. */
	index: () => number;
}

/**
 * The LZW dictionary and the counters that grow it while decoding.
 */
interface DecodeState {
	dictionary: (string | number)[];
	dictSize: number;
	enlargeIn: number;
	numBits: number;
	w: string;
}

/**
 * Reads an lz-string stream bit by bit, refilling from the caller's value
 * source each time a value's bits are exhausted.
 * @param resetValue The bit position to restart from after a refill.
 * @param getNextValue Supplies the value at one input index.
 * @returns A reader positioned on the first value.
 */
function bitReader(resetValue: number, getNextValue: (index: number) => number): BitReader {
	const data = { val: getNextValue(0), position: resetValue, index: 1 };
	return {
		/**
		 * Read `n` bits.
		 * @param n The bit count.
		 * @returns The bits as a number.
		 */
		read(n: number): number {
			let bits = 0;
			const maxpower = Math.pow(2, n);
			let power = 1;
			while (power !== maxpower) {
				const resb = data.val & data.position;
				data.position >>= 1;
				if (data.position === 0) {
					data.position = resetValue;
					data.val = getNextValue(data.index++);
				}
				bits |= (resb > 0 ? 1 : 0) * power;
				power <<= 1;
			}
			return bits;
		},
		/**
		 * The next input index.
		 * @returns The index.
		 */
		index: () => data.index,
	};
}

/**
 * The literal character a control code introduces: code 0 carries an 8-bit
 * character, code 1 a 16-bit one.
 * @param reader The bit reader.
 * @param code The control code just read.
 * @returns The character, or null when the code is not a literal marker.
 */
function literalFor(reader: BitReader, code: number): string | null {
	if (code === 0) {
		return f(reader.read(8));
	}
	if (code === 1) {
		return f(reader.read(16));
	}
	return null;
}

/**
 * Widen the code size once the dictionary has filled the current width.
 * @param state The decode state.
 */
function growIfFull(state: DecodeState): void {
	if (state.enlargeIn === 0) {
		state.enlargeIn = Math.pow(2, state.numBits);
		state.numBits++;
	}
}

/**
 * The dictionary entry a code names, or the one implied when the code is the
 * entry about to be added (the classic LZW KwKwK case).
 * @param state The decode state.
 * @param c The code.
 * @returns The entry, or null when the stream is corrupt.
 */
function entryFor(state: DecodeState, c: number): string | null {
	const known = state.dictionary[c];
	if (typeof known === "string") {
		return known;
	}
	if (c === state.dictSize) {
		return state.w + state.w.charAt(0);
	}
	return null;
}

/**
 * Decode the stream after its first character into the result.
 * @param reader The bit reader.
 * @param length The input length, past which the stream is truncated.
 * @param state The decode state seeded with the first character.
 * @param result The output so far, appended to in place.
 * @returns The decoded text, "" for a truncated stream, null for a corrupt one.
 */
function decodeRest(
	reader: BitReader,
	length: number,
	state: DecodeState,
	result: string[],
): string | null {
	for (;;) {
		if (reader.index() > length) {
			return "";
		}
		let c = reader.read(state.numBits);
		if (c === 2) {
			return result.join("");
		}
		const literal = literalFor(reader, c);
		if (literal !== null) {
			state.dictionary[state.dictSize++] = literal;
			c = state.dictSize - 1;
			state.enlargeIn--;
		}
		growIfFull(state);
		const entry = entryFor(state, c);
		if (entry === null) {
			return null;
		}
		result.push(entry);
		state.dictionary[state.dictSize++] = state.w + entry.charAt(0);
		state.enlargeIn--;
		state.w = entry;
		growIfFull(state);
	}
}

/**
 * lz-string's generic decompressor.
 * @param length The number of input values.
 * @param resetValue The bit position to restart from after each value.
 * @param getNextValue Supplies the value at one input index.
 * @returns The decoded text, "" for an empty or truncated stream, null for a corrupt one.
 */
function decompress(
	length: number,
	resetValue: number,
	getNextValue: (index: number) => number,
): string | null {
	const reader = bitReader(resetValue, getNextValue);
	const first = literalFor(reader, reader.read(2));
	if (first === null) {
		return "";
	}
	const state: DecodeState = {
		dictionary: [0, 1, 2, first],
		dictSize: 4,
		enlargeIn: 4,
		numBits: 3,
		w: first,
	};
	return decodeRest(reader, length, state, [first]);
}

/**
 * Decode an lz-string base64 payload.
 * @param input The base64 text with whitespace already removed.
 * @returns The decoded text, or null when the input is empty or corrupt.
 */
function decompressFromBase64(input: string): string | null {
	if (input === "") {
		return null;
	}
	return decompress(input.length, 32, (index) => keyStrBase64.indexOf(input.charAt(index)));
}

export { decompressFromBase64 };
