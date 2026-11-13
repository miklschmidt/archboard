// What an error report keeps of a thrown value: its class, its code and the frames of
// Archboard's own code. It never keeps the message, which can quote a name, a path or content.

import type { Frame } from "#runtime/records/protocol/records.ts";

/** A frame line of V8 and JavaScriptCore stacks: `at fn (file:line:col)` or `at file:line:col`. */
const V8_FRAME = /^\s*at (?:(?<fn>.+?) \()?(?<file>[^()]+?):(?<line>\d+):(?<col>\d+)\)?\s*$/u;

/** A frame line of a JavaScriptCore stack: `fn@file:line:col`. */
const JSC_FRAME = /^(?<fn>[^@\s]*)@(?<file>.+?):(?<line>\d+):(?<col>\d+)$/u;

/** A code that names a kind of failure, such as `ENOENT` or `SERVER_UNREACHABLE`. */
const PLAIN_CODE = /^[A-Za-z][\w.-]{0,63}$/u;

/** A class name, such as `TypeError`. */
const PLAIN_NAME = /^[A-Za-z_$][\w$]{0,63}$/u;

/** The most frames that a report keeps. */
const MAX_FRAMES = 40;

/**
 * The class and code of a thrown value, without its message.
 * @param thrown What was thrown.
 * @returns The class name and the code, or null when it has none that is a plain word.
 */
function errorKind(thrown: unknown): { type: string; code: string | null } {
	if (!(thrown instanceof Error)) return { type: "NonError", code: null };
	const code = "code" in thrown ? thrown.code : undefined;
	return {
		type: PLAIN_NAME.test(thrown.name) ? thrown.name : "Error",
		code: typeof code === "string" && PLAIN_CODE.test(code) ? code : null,
	};
}

/** One parsed frame line. */
interface FrameLine {
	readonly fn: string;
	readonly file: string;
	readonly line: number;
	readonly col: number;
}

/**
 * Parse one line of a stack.
 * @param text The line.
 * @returns The frame, or null for a line that is no frame.
 */
function frameLine(text: string): FrameLine | null {
	const groups = (V8_FRAME.exec(text) ?? JSC_FRAME.exec(text.trim()))?.groups;
	if (groups === undefined) return null;
	return {
		fn: groups["fn"] ?? "",
		file: (groups["file"] ?? "").replace(/^file:\/\//u, ""),
		line: Number(groups["line"]),
		col: Number(groups["col"]),
	};
}

/**
 * Keep a frame of Archboard's own code, relative to the program root.
 * @param frame The parsed frame.
 * @param root The program root, with a trailing slash.
 * @returns The frame, or null for a frame outside the root or in its `node_modules`.
 */
function ownFrame(frame: FrameLine, root: string): Frame | null {
	if (!frame.file.startsWith(root)) return null;
	const filename = frame.file.slice(root.length);
	if (filename.split("/").includes("node_modules")) return null;
	const parts = frame.fn.replace(/^async /u, "").split(".");
	return {
		function: parts.every((part) => PLAIN_NAME.test(part)) ? frame.fn : "",
		filename,
		lineno: frame.line,
		colno: frame.col,
	};
}

/**
 * The frames of Archboard's own code in a stack, relative to the program root. A frame outside
 * the root, or in its `node_modules`, is left out, because its path can name the user's files.
 * @param stack The error's stack, or undefined.
 * @param programRoot The directory below which Archboard's own modules lie.
 * @returns Archboard's frames, innermost first.
 */
function ownFrames(stack: string | undefined, programRoot: string): Frame[] {
	const root = programRoot.endsWith("/") ? programRoot : `${programRoot}/`;
	return (stack ?? "")
		.split("\n")
		.flatMap((text) => {
			const parsed = frameLine(text);
			const frame = parsed === null ? null : ownFrame(parsed, root);
			return frame === null ? [] : [frame];
		})
		.slice(0, MAX_FRAMES);
}

export { errorKind, ownFrames };
