// A talk on disk: a directory of `talk.json` and the voice as `voice.wav` (TASK-381).
//
// A talk is written whole or not at all: into a temporary sibling directory that is renamed into
// place, so a reader never meets a talk half written. It is read back before anything starts
// rendering it, and one that cannot be rendered is refused there, naming why.

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import { stateDir } from "@archboard/workspace/state-dir";
import {
	TALK_SAMPLE_RATE,
	TALK_VERSION,
	TALK_VOICE_FILE,
	TalkSchema,
	talkFrom,
	type Talk,
	type TalkParts,
} from "#shared/protocol/talk.ts";

/** The file that holds a talk's events, board and policy. */
const TALK_FILE = "talk.json";

/** How many talks the state directory keeps: the newest, before the oldest are removed. */
const KEPT_TALKS = 10;

/** What a talk directory named for its moment and its board is called. */
const STATE_TALK_NAME = /^\d{8}T\d{6}Z-/;

/** The bytes of a WAV file's header for 16-bit mono PCM: RIFF, `fmt ` and the `data` chunk's start. */
const WAV_HEADER_BYTES = 44;

/** Why a talk cannot be read, or has no place to be written. */
class TalkFileError extends Error {
	/**
	 * Refuse a talk.
	 * @param message What is wrong and what to do.
	 */
	constructor(message: string) {
		super(message);
		this.name = "TalkFileError";
	}
}

/** Where a talk goes, and whether older talks there are pruned. */
interface TalkPlace {
	/** The directory that will hold `talk.json` and `voice.wav`. */
	readonly directory: string;
	/** Whether writing a talk there removes all but the newest few: true in the state directory. */
	readonly prune: boolean;
}

/**
 * What a board's name becomes in a directory name.
 * @param board The board's name.
 * @returns Lowercase letters, digits and dashes, or "board" for a name with none.
 */
function slugOf(board: string): string {
	const slug = board
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-|-$/g, "")
		.slice(0, 40);
	return slug === "" ? "board" : slug;
}

/**
 * The state directory's place for a board's talk, named for the moment it was recorded, so that
 * names sort in the order the talks were made.
 * @param board The board's name.
 * @param now When it was recorded.
 * @returns The place.
 */
function stateTalkPlace(board: string, now: Date): TalkPlace {
	const stamp = now.toISOString().replaceAll(/[-:]|\.\d+/g, "");
	return {
		directory: join(stateDir(), "recordings", `${stamp}-${slugOf(board)}`),
		prune: true,
	};
}

/**
 * A place the user named: it is never pruned.
 * @param directory The directory, absolute.
 * @returns The place.
 */
function askedTalkPlace(directory: string): TalkPlace {
	return { directory, prune: false };
}

/**
 * Refuse a place that already holds something, or has no directory to be made in, before
 * anything starts: a talk is minutes of a live voice session.
 * @param place Where the talk goes.
 * @throws {TalkFileError} When the place exists, or its parent is not a directory.
 */
function requireFreshPlace(place: TalkPlace): void {
	if (existsSync(place.directory)) {
		throw new TalkFileError(
			`${place.directory} already exists. Name a directory that does not, so no talk is overwritten.`,
		);
	}
	// The state directory's own folder is made when the first talk is written.
	if (place.prune) return;
	const parent = dirname(place.directory);
	if (!existsSync(parent) || !statSync(parent).isDirectory()) {
		throw new TalkFileError(`${parent} is not a directory. Create it, or name another place.`);
	}
}

/**
 * Where a board's talk is kept, proven free before anything starts: the directory asked for, or a
 * new one in the state directory, named for the moment it was recorded.
 * @param asked The directory asked for, absolute, if any.
 * @param board The board recorded, which names a talk kept in the state directory.
 * @param now When it is recorded.
 * @returns The place.
 * @throws {TalkFileError} When the directory asked for exists or has no directory to be made in.
 */
function freshTalkPlace(asked: string | undefined, board: string, now: Date): TalkPlace {
	const place = asked === undefined ? stateTalkPlace(board, now) : askedTalkPlace(asked);
	requireFreshPlace(place);
	return place;
}

/**
 * A WAV file's header, for 16-bit mono PCM.
 * @param samples How many samples follow it.
 * @returns The header.
 */
function wavHeader(samples: number): Buffer {
	const header = Buffer.alloc(WAV_HEADER_BYTES);
	const dataBytes = samples * 2;
	header.write("RIFF", 0, "ascii");
	header.writeUInt32LE(WAV_HEADER_BYTES - 8 + dataBytes, 4);
	header.write("WAVEfmt ", 8, "ascii");
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(TALK_SAMPLE_RATE, 24);
	header.writeUInt32LE(TALK_SAMPLE_RATE * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36, "ascii");
	header.writeUInt32LE(dataBytes, 40);
	return header;
}

/**
 * Whether bytes are a WAV file: a RIFF file of the WAVE kind.
 * @param wav The file's bytes.
 * @returns True when they are.
 */
function isWav(wav: Buffer): boolean {
	return (
		wav.length >= 12 &&
		wav.toString("ascii", 0, 4) === "RIFF" &&
		wav.toString("ascii", 8, 12) === "WAVE"
	);
}

/** Where a WAV file's chunk body starts, and how long it says it is. */
interface WavChunk {
	readonly body: number;
	readonly size: number;
}

/**
 * The first chunk of a WAV file with an id. A chunk is an id and a size, then its body, padded to
 * an even length; they follow the RIFF header.
 * @param wav The file's bytes.
 * @param id The chunk's four-character id.
 * @returns The chunk, or null when the file has none.
 */
function chunkOf(wav: Buffer, id: string): WavChunk | null {
	for (let at = 12; at + 8 <= wav.length;) {
		const size = wav.readUInt32LE(at + 4);
		if (wav.toString("ascii", at, at + 4) === id) return { body: at + 8, size };
		at += 8 + size + (size % 2);
	}
	return null;
}

/**
 * Whether a `fmt ` chunk describes 16-bit mono PCM at the talk's sample rate.
 * @param wav The file's bytes.
 * @param format The `fmt ` chunk.
 * @returns True when it does.
 */
function isTalkVoiceFormat(wav: Buffer, format: WavChunk): boolean {
	if (format.size < 16 || format.body + 16 > wav.length) return false;
	const [tag, channels, bits] = [
		wav.readUInt16LE(format.body),
		wav.readUInt16LE(format.body + 2),
		wav.readUInt16LE(format.body + 14),
	];
	return (
		tag === 1 &&
		channels === 1 &&
		bits === 16 &&
		wav.readUInt32LE(format.body + 4) === TALK_SAMPLE_RATE
	);
}

/**
 * How many samples a WAV file holds, when it is 16-bit mono PCM at the talk's sample rate.
 * @param wav The file's bytes.
 * @returns The samples, or why it is not the voice of a talk.
 */
function wavSamples(wav: Buffer): number | string {
	const format = isWav(wav) ? chunkOf(wav, "fmt ") : null;
	const data = format === null ? null : chunkOf(wav, "data");
	if (format === null || data === null) return "is not a WAV file with a format and sound";
	if (!isTalkVoiceFormat(wav, format)) return `is not 16-bit mono PCM at ${TALK_SAMPLE_RATE} Hz`;
	return Math.min(data.size, wav.length - data.body) / 2;
}

/**
 * The bytes of a talk's file.
 * @param path The file.
 * @param directory The talk's directory, for a refusal to name.
 * @returns Its bytes.
 * @throws {TalkFileError} When it cannot be read.
 */
function bytesOf(path: string, directory: string): Buffer {
	try {
		return readFileSync(path);
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		throw new TalkFileError(
			`${directory} holds no readable ${basename(path)} (${why}). Name a directory that a recording wrote.`,
		);
	}
}

/**
 * The samples of a voice a recording page handed over.
 * @param path Its WAV file.
 * @returns Its samples.
 * @throws {TalkFileError} When it is not the voice of a talk.
 */
function voiceSamples(path: string): Int16Array {
	const wav = bytesOf(path, dirname(path));
	const count = wavSamples(wav);
	const data = chunkOf(wav, "data");
	if (typeof count === "string" || data === null) {
		throw new TalkFileError(`The recording page's voice ${String(count)}.`);
	}
	const samples = new Int16Array(count);
	for (let index = 0; index < count; index += 1) {
		samples[index] = wav.readInt16LE(data.body + index * 2);
	}
	return samples;
}

/**
 * The format version a parsed `talk.json` states.
 * @param json What was parsed.
 * @returns The version, or undefined when there is none.
 */
function versionOf(json: unknown): unknown {
	return typeof json === "object" && json !== null && "version" in json ? json.version : undefined;
}

/**
 * Parse `talk.json` as JSON of a format version this archboard reads.
 * @param file Its path.
 * @param text What it holds.
 * @returns What it says, not yet checked as a talk.
 * @throws {TalkFileError} When it is not JSON, or is of another version.
 */
function jsonOf(file: string, text: string): unknown {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new TalkFileError(`${file} is not JSON. Record the talk again.`);
	}
	const version = versionOf(json);
	if (version !== undefined && version !== TALK_VERSION) {
		throw new TalkFileError(
			`${file} is talk format version ${JSON.stringify(version)}; this archboard reads version ${TALK_VERSION}.`,
		);
	}
	return json;
}

/**
 * Parse `talk.json`.
 * @param file Its path.
 * @param text What it holds.
 * @returns The talk.
 * @throws {TalkFileError} When it is not JSON, is of another version, or is not a talk.
 */
function parseTalk(file: string, text: string): Talk {
	const parsed = TalkSchema.safeParse(jsonOf(file, text));
	if (parsed.success) return parsed.data;
	const problem = parsed.error.issues[0];
	throw new TalkFileError(
		`${file} is not a talk: ${problem?.path.join(".") || "it"} ${problem?.message ?? "does not parse"}. Record the talk again.`,
	);
}

/**
 * Read a talk, and check its voice is the one it was recorded with.
 * @param directory The talk's directory.
 * @returns The talk.
 * @throws {TalkFileError} When it cannot be read, is of another version, or its voice disagrees.
 */
function readTalk(directory: string): Talk {
	const file = join(directory, TALK_FILE);
	const talk = parseTalk(file, bytesOf(file, directory).toString("utf8"));
	const voice = join(directory, TALK_VOICE_FILE);
	const samples = wavSamples(bytesOf(voice, directory));
	if (typeof samples === "string") throw new TalkFileError(`${voice} ${samples}.`);
	if (samples !== talk.audio.samples) {
		throw new TalkFileError(
			`${voice} holds ${samples} samples but ${file} says ${talk.audio.samples}. The two are not one talk.`,
		);
	}
	return talk;
}

/**
 * Remove all but the newest talks of the state directory's recordings folder. Only directories
 * named as this module names them are touched.
 * @param folder The recordings folder.
 */
function pruneTalks(folder: string): void {
	const talks = readdirSync(folder).filter((name) => STATE_TALK_NAME.test(name));
	// The names begin with the moment, so the newest sort last.
	for (const name of talks.toSorted().slice(0, -KEPT_TALKS)) {
		rmSync(join(folder, name), { recursive: true, force: true });
	}
}

/**
 * Write a talk whole into its place: into a temporary directory beside it, which is renamed into
 * place once both files are down. In the state directory, all but the newest ten are then removed.
 * @param options The talk, its voice and where it goes.
 * @param options.talk The talk; its `audio.samples` is how long the voice is.
 * @param options.voice The voice's samples: 16-bit mono at the talk's sample rate.
 * @param options.place Where it goes.
 * @returns The directory it was written to.
 * @throws {TalkFileError} When the voice is not the length the talk says, or the place is taken.
 */
function writeTalk(options: {
	readonly talk: Talk;
	readonly voice: Int16Array;
	readonly place: TalkPlace;
}): string {
	const { talk, voice, place } = options;
	if (voice.length !== talk.audio.samples) {
		throw new TalkFileError(
			`The voice has ${voice.length} samples but the talk says ${talk.audio.samples}.`,
		);
	}
	const parent = dirname(place.directory);
	mkdirSync(parent, { recursive: true });
	const staging = mkdtempSync(join(parent, ".talk-"));
	try {
		writeFileSync(join(staging, TALK_FILE), `${JSON.stringify(talk)}\n`);
		writeFileSync(
			join(staging, TALK_VOICE_FILE),
			Buffer.concat([
				wavHeader(voice.length),
				Buffer.from(voice.buffer, voice.byteOffset, voice.byteLength),
			]),
		);
		// A rename onto a directory that is there would replace it when it is empty.
		if (existsSync(place.directory)) {
			throw new TalkFileError(`${place.directory} already exists, so the talk was not written.`);
		}
		renameSync(staging, place.directory);
	} catch (error) {
		rmSync(staging, { recursive: true, force: true });
		throw error;
	}
	if (place.prune) pruneTalks(parent);
	return place.directory;
}

/**
 * Keep a talk of its parts in a directory somebody named: written whole, and never pruned.
 * @param options What the talk is made of, its voice and its directory.
 * @param options.voice The voice's samples: 16-bit mono at the talk's sample rate, as many as the log says.
 * @param options.directory The directory, which does not exist yet.
 * @returns The talk that was kept.
 * @throws {Error} When the parts are not a talk that can be rendered.
 * @throws {TalkFileError} When the voice is not the length the talk says, or the directory is taken.
 */
function keepTalk(
	options: TalkParts & { readonly voice: Int16Array; readonly directory: string },
): Talk {
	const { voice, directory, ...parts } = options;
	const made = talkFrom(parts);
	if (!made.success) throw made.error;
	writeTalk({ talk: made.data, voice, place: askedTalkPlace(directory) });
	return made.data;
}

export {
	KEPT_TALKS,
	TALK_FILE,
	TalkFileError,
	askedTalkPlace,
	freshTalkPlace,
	keepTalk,
	readTalk,
	requireFreshPlace,
	stateTalkPlace,
	voiceSamples,
	writeTalk,
	type TalkPlace,
};
