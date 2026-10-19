// The microphone a recording's browser is given: a second of silence, looped.
//
// Voice will not start without a microphone track, and the voice model hears
// whatever that track carries. Chromium's fake capture device plays a tone by
// default, which the model would hear as somebody speaking, so the recorder
// hands it a file of nothing to play instead.

import { writeFileSync } from "node:fs";

/** Samples per second of the silence, and its length in samples. */
const SAMPLE_RATE = 48_000;

/**
 * Write one second of 16-bit mono silence as a WAV file.
 * @param path Where to write it.
 */
function writeSilence(path: string): void {
	const bytes = SAMPLE_RATE * 2;
	const wav = Buffer.alloc(44 + bytes);
	wav.write("RIFF", 0, "ascii");
	wav.writeUInt32LE(36 + bytes, 4);
	wav.write("WAVE", 8, "ascii");
	wav.write("fmt ", 12, "ascii");
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(SAMPLE_RATE, 24);
	wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write("data", 36, "ascii");
	wav.writeUInt32LE(bytes, 40);
	writeFileSync(path, wav);
}

export { writeSilence };
