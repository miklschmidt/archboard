// A recording that plays with sound wherever it is watched (TASK-305).
//
// What is guarded: an MP4 whose sound Safari cannot play is handed over as it was recorded, with
// a note saying so, whenever the sound cannot be converted, whether the ffmpeg is gone or fails;
// and a file whose sound plays everywhere is left alone. Whether there is an ffmpeg at all is
// settled before a recording starts (TASK-381), not here.

import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { playableEverywhere } from "@/runtime/walkthrough-recorder";

const OPUS_MP4 = "video/mp4;codecs=avc1,opus";

test("an MP4 whose sound cannot be converted is handed over as recorded, with a note", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-playable-"));
	try {
		const file = join(root, "talk.mp4");
		const recorded = new Uint8Array([1, 2, 3, 4, 5]);
		writeFileSync(file, recorded);
		const signal = new AbortController().signal;
		// An ffmpeg that is not there, and one that fails.
		const failing = [Bun.which("false") ?? join(root, "missing")];
		for (const ffmpeg of [[join(root, "missing")], failing]) {
			const played = await playableEverywhere(file, OPUS_MP4, { ffmpeg, signal });
			expect(played).toMatchObject({ mimeType: OPUS_MP4, bytes: recorded.length });
			expect(played.notes).toHaveLength(1);
			expect(new Uint8Array(readFileSync(file))).toEqual(recorded);
		}
		for (const mimeType of ["video/webm;codecs=vp9,opus", "video/mp4;codecs=avc1,mp4a.40.2"]) {
			const played = await playableEverywhere(file, mimeType, { ffmpeg: failing, signal });
			expect(played).toMatchObject({ mimeType, bytes: recorded.length, notes: [] });
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
