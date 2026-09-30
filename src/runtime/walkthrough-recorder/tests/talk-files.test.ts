// A talk on disk (TASK-381).
//
// What is guarded: a talk is written whole or not at all, and reads back as it was written; one
// that is unreadable, of another format version, or whose voice is not the one it was recorded
// with (its length, or its format) is refused before a browser starts, naming why; the state
// directory keeps the newest ten talks and touches nothing else in its folder; and a place the
// user named is never pruned, is refused when it exists, and is checked before anything starts.

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
	TalkFileError,
	askedTalkPlace,
	readTalk,
	requireFreshPlace,
	stateTalkPlace,
	writeTalk,
	type TalkPlace,
} from "@/runtime/walkthrough-recorder";

import { fixtureTalk, fixtureVoice, VOICE_SAMPLES } from "./talk-fixture";

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-talks-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/**
 * A place in the state directory's shape, under the temporary directory.
 * @param minute Which minute of the hour the talk was recorded, so names sort by it.
 * @returns The place.
 */
function statePlace(minute: number): TalkPlace {
	const stamp = `20260930T10${String(minute).padStart(2, "0")}00Z`;
	return { directory: join(root, "recordings", `${stamp}-pipeline`), prune: true };
}

/**
 * The refusal a call ends in.
 * @param attempt What refuses.
 * @returns The refusal.
 */
function refusalOf(attempt: () => unknown): unknown {
	try {
		attempt();
	} catch (error) {
		return error;
	}
	throw new Error("It did not refuse.");
}

test("a talk lands whole, as its two files, and reads back as it was written", () => {
	const directory = writeTalk({
		talk: fixtureTalk(),
		voice: fixtureVoice(),
		place: askedTalkPlace(join(root, "talk")),
	});
	expect(readdirSync(directory).toSorted()).toEqual(["talk.json", "voice.wav"]);
	// Nothing of the temporary directory it was written in is left beside it.
	expect(readdirSync(root)).toEqual(["talk"]);
	expect(readTalk(directory)).toEqual(fixtureTalk());
});

test("a voice of another length than the talk says is refused, and nothing is written", () => {
	const place = askedTalkPlace(join(root, "talk"));
	const attempt = () =>
		writeTalk({ talk: fixtureTalk(), voice: fixtureVoice().subarray(1), place });
	expect(refusalOf(attempt)).toBeInstanceOf(TalkFileError);
	expect(readdirSync(root)).toEqual([]);
});

test("a talk that is missing, not JSON, of another version or not a talk is refused", () => {
	const directory = join(root, "talk");
	expect(refusalOf(() => readTalk(directory))).toBeInstanceOf(TalkFileError);
	mkdirSync(directory);
	const file = join(directory, "talk.json");
	for (const content of ["not json", JSON.stringify({ ...fixtureTalk(), version: 2 }), "{}"]) {
		writeFileSync(file, content);
		expect(refusalOf(() => readTalk(directory))).toBeInstanceOf(TalkFileError);
	}
});

test("a voice that is not the talk's is refused: another length, another rate, or no WAV at all", () => {
	const directory = writeTalk({
		talk: fixtureTalk(),
		voice: fixtureVoice(),
		place: askedTalkPlace(join(root, "talk")),
	});
	const voice = join(directory, "voice.wav");
	const whole = readFileSync(voice);
	const shorter = whole.subarray(0, whole.length - 2);
	const otherRate = Buffer.from(whole);
	otherRate.writeUInt32LE(44_100, 24);
	for (const bad of [shorter, otherRate, Buffer.from("not a wav")]) {
		writeFileSync(voice, bad);
		expect(refusalOf(() => readTalk(directory))).toBeInstanceOf(TalkFileError);
	}
	writeFileSync(voice, whole);
	expect(readTalk(directory).audio.samples).toBe(VOICE_SAMPLES);
	rmSync(voice);
	expect(refusalOf(() => readTalk(directory))).toBeInstanceOf(TalkFileError);
});

test("the state directory keeps the newest ten talks and touches nothing else in its folder", () => {
	const folder = join(root, "recordings");
	mkdirSync(folder);
	mkdirSync(join(folder, "notes"));
	for (let minute = 0; minute < 12; minute++) {
		writeTalk({ talk: fixtureTalk(), voice: fixtureVoice(), place: statePlace(minute) });
	}
	const kept = readdirSync(folder).toSorted();
	expect(kept).toHaveLength(11);
	expect(kept).toContain("notes");
	// The two oldest went.
	expect(existsSync(statePlace(0).directory)).toBe(false);
	expect(existsSync(statePlace(1).directory)).toBe(false);
	expect(existsSync(statePlace(2).directory)).toBe(true);
	expect(existsSync(statePlace(11).directory)).toBe(true);
});

test("a state talk is named for its moment and its board, so newer names sort later", () => {
	const earlier = basename(
		stateTalkPlace("Pay ments", new Date("2026-09-30T10:15:00.123Z")).directory,
	);
	const later = basename(
		stateTalkPlace("Pay ments", new Date("2026-09-30T10:15:01.000Z")).directory,
	);
	expect(earlier).toBe("20260930T101500Z-pay-ments");
	expect(earlier < later).toBe(true);
	expect(stateTalkPlace("Pay ments", new Date()).prune).toBe(true);
});

test("a place the user named is never pruned, and one that exists is refused before anything starts", () => {
	for (let index = 0; index < 12; index++) {
		writeTalk({
			talk: fixtureTalk(),
			voice: fixtureVoice(),
			place: askedTalkPlace(join(root, `talk-${index}`)),
		});
	}
	expect(readdirSync(root)).toHaveLength(12);
	expect(refusalOf(() => requireFreshPlace(askedTalkPlace(join(root, "talk-3"))))).toBeInstanceOf(
		TalkFileError,
	);
	expect(
		refusalOf(() => requireFreshPlace(askedTalkPlace(join(root, "missing", "talk")))),
	).toBeInstanceOf(TalkFileError);
	expect(() => requireFreshPlace(askedTalkPlace(join(root, "fresh")))).not.toThrow();
	// The state directory's own folder is made when the first talk is written.
	expect(() => requireFreshPlace(statePlace(0))).not.toThrow();
});
