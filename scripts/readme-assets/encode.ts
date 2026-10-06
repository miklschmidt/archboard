// Turning footage into the README's animated WebP clips and still thumbnails, with ffmpeg.
//
// A take's windows are filmed at once, each frame stamped with the second it was painted. Each
// window's frames between the take's first and last second become an ffconcat list with the true
// duration of every frame, so ffmpeg plays them at the pace they were painted and samples them at
// a steady 30 frames a second. Several windows are stacked side by side or one above the other.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import type { Footage, Frame } from "./browser.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { ffmpeg } from "./tools.ts";

/** The frame rate of every clip. */
const CLIP_FPS = 30;

/** A rectangle of a picture, in its pixels. */
interface Crop {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** The width and height of every index thumbnail. */
const THUMBNAIL = { width: 640, height: 360 } as const;

/** How one take becomes one clip. */
interface ClipCut {
	/** Each window's footage, in the order they are stacked. */
	readonly windows: readonly Footage[];
	/** Side by side, or one above the other. */
	readonly stack: "beside" | "above";
	/** The take's first and last second. */
	readonly from: number;
	readonly to: number;
	/** How long the clip first shows its last frame, so its first frame shows where it ends. */
	readonly leadWithEnd: number;
	/** How long it holds its last frame. */
	readonly hold: number;
	/** The clip's width; its height follows. */
	readonly width: number;
	/** A stretch played faster, in seconds from the take's first: the wait for an answer. */
	readonly fast?:
		| { readonly from: number; readonly to: number; readonly speed: number }
		| undefined;
	readonly out: string;
}

/**
 * The frames painted between two seconds, starting with the one on screen at the first.
 * @param frames Every frame, in order.
 * @param from The first second.
 * @param to The last second.
 * @returns The frames.
 */
function framesBetween(frames: readonly Frame[], from: number, to: number): readonly Frame[] {
	const first = Math.max(0, frames.findIndex((frame) => frame.at > from) - 1);
	return frames.slice(first).filter((frame) => frame.at < to);
}

/**
 * Write one window's ffconcat list: its last frame first for a moment, then every frame for as
 * long as it was on screen, then its last frame held.
 * @param footage The window's footage.
 * @param cut The clip.
 * @returns The list's path.
 * @throws {Error} When the window painted nothing in the take.
 */
function concatList(footage: Footage, cut: ClipCut): string {
	const frames = framesBetween(footage.frames, cut.from, cut.to);
	const last = frames.at(-1);
	if (last === undefined) throw new Error(`${footage.directory} painted nothing during the take.`);
	const lines = ["ffconcat version 1.0"];
	if (cut.leadWithEnd > 0) lines.push(`file '${last.file}'`, `duration ${cut.leadWithEnd}`);
	frames.forEach((frame, index) => {
		const start = Math.max(frame.at, cut.from);
		const end = index === frames.length - 1 ? cut.to + cut.hold : (frames[index + 1]?.at ?? cut.to);
		lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
	});
	lines.push(`file '${last.file}'`);
	const path = join(footage.directory, "take.ffconcat");
	writeFileSync(path, `${lines.join("\n")}\n`);
	return path;
}

/**
 * The filter that plays a stretch faster, or nothing.
 * @param cut The clip.
 * @returns The filters to append, after a comma, or the empty string.
 */
function fastFilter(cut: ClipCut): string {
	if (cut.fast === undefined) return "";
	const { from, to, speed } = cut.fast;
	const start = cut.leadWithEnd + from;
	const end = cut.leadWithEnd + to;
	return (
		`split=3[p0][p1][p2];[p0]trim=0:${start},setpts=PTS-STARTPTS[s0];` +
		`[p1]trim=${start}:${end},setpts=(PTS-STARTPTS)/${speed}[s1];` +
		`[p2]trim=${end},setpts=PTS-STARTPTS[s2];[s0][s1][s2]concat=n=3:v=1:a=0,`
	);
}

/** A picture's size, in pixels. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/**
 * The filter that cuts each input to its page and stacks them: the start of a filter chain.
 * @param pages Each input's page size, in input order.
 * @param stack Side by side, or one above the other.
 * @returns The filter, without a trailing comma.
 */
function stackFilter(pages: readonly Size[], stack: ClipCut["stack"]): string {
	const cuts = pages.map((page, index) => `[${index}:v]crop=${page.width}:${page.height}:0:0`);
	if (cuts.length === 1) return cuts.join("");
	const labels = pages.map((_, index) => `[w${index}]`);
	const stacked = stack === "beside" ? "hstack" : "vstack";
	return `${cuts.map((one, index) => `${one}${labels[index]}`).join(";")};${labels.join("")}${stacked}=inputs=${pages.length}`;
}

/**
 * Encode a take into an animated WebP clip. The clip is lossless. An animated WebP stores each
 * frame as the rectangle that changed since the one before, and a lossy encoder counts a pixel that
 * moved by a few levels as unchanged, so a fading shadow or the glow of a pulse leaves a ghost behind
 * for the rest of the clip, in blocks. A lossless clip leaves none: measured against the filmed
 * frames, an empty part of the canvas was exact in the lossless clip, and off by up to three levels in
 * blocks at quality 90. (ffmpeg's libwebp_anim offers no keyframe interval, and `-preset` resets the
 * lossless setting, so none is given.)
 * @param cut The take and how it is cut.
 */
async function encodeClip(cut: ClipCut): Promise<void> {
	const inputs = cut.windows.flatMap((footage) => [
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		concatList(footage, cut),
	]);
	const graph = `${stackFilter(cut.windows, cut.stack)},fps=${CLIP_FPS},${fastFilter(cut)}scale=${cut.width}:-2:flags=lanczos[clip]`;
	await ffmpeg([
		...inputs,
		"-filter_complex",
		graph,
		"-map",
		"[clip]",
		"-c:v",
		"libwebp_anim",
		"-lossless",
		"1",
		"-compression_level",
		"6",
		"-loop",
		"0",
		"-an",
		cut.out,
	]);
}

/**
 * The frame on screen at a second of a take.
 * @param footage The window's footage.
 * @param at The second.
 * @returns The frame, and the size of the page it shows.
 * @throws {Error} When nothing was painted by then.
 */
function frameAt(footage: Footage, at: number): WindowImage {
	const shown = footage.frames.findLast((frame) => frame.at <= at);
	if (shown === undefined) throw new Error(`${footage.directory} painted nothing by ${at}.`);
	return { file: shown.file, width: footage.width, height: footage.height };
}

/** An image of one window, and the size of the page it shows. */
interface WindowImage extends Size {
	readonly file: string;
}

/** The picture a thumbnail is cut from. */
type ThumbnailSource =
	/** Images of windows, stacked as a clip's windows are. */
	| { readonly images: readonly WindowImage[]; readonly stack: ClipCut["stack"] }
	/** The frame of a video at a second. */
	| { readonly video: string; readonly at: number };

/**
 * The ffmpeg inputs and the filter that make a thumbnail's picture.
 * @param source The picture.
 * @returns The inputs, and the filter's start, which ends in a comma.
 */
function thumbnailInputs(source: ThumbnailSource): {
	readonly inputs: readonly string[];
	readonly filter: string;
} {
	if ("video" in source) {
		return { inputs: ["-ss", String(source.at), "-i", source.video], filter: "" };
	}
	return {
		inputs: source.images.flatMap((image) => ["-i", image.file]),
		filter: `${stackFilter(source.images, source.stack)},`,
	};
}

/**
 * Encode one rectangle of a picture as a 640x360 still WebP thumbnail.
 * @param source The picture.
 * @param crop The rectangle of it, 16:9.
 * @param out The thumbnail.
 */
async function encodeThumbnail(source: ThumbnailSource, crop: Crop, out: string): Promise<void> {
	const { inputs, filter } = thumbnailInputs(source);
	await ffmpeg([
		...inputs,
		"-frames:v",
		"1",
		"-filter_complex",
		`${filter}crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${THUMBNAIL.width}:${THUMBNAIL.height}:flags=lanczos`,
		"-c:v",
		"libwebp",
		"-quality",
		"82",
		out,
	]);
}

export { encodeClip, encodeThumbnail, frameAt, type ClipCut, type Crop };
