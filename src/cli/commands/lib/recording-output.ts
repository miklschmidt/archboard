// What `semantic record` and `semantic replay` share about the video file they write.

import { accessSync, constants, statSync } from "node:fs";
import { dirname, extname } from "node:path";

import { RecordingContainerSchema, type RecordingContainer } from "@/shared/walkthrough-recording";
import { CliUsageError } from "@/cli/command-contract/contract";

/**
 * The container a file name asks for.
 * @param out The file name.
 * @returns The container.
 * @throws {CliUsageError} When the name ends in neither .mp4 nor .webm.
 */
function containerOf(out: string): RecordingContainer {
	const parsed = RecordingContainerSchema.safeParse(extname(out).slice(1).toLowerCase());
	if (!parsed.success) {
		throw new CliUsageError(`--out ${out} must name a .mp4 or .webm file.`);
	}
	return parsed.data;
}

/**
 * Refuse an --out whose directory is missing or cannot be written before anything starts: the
 * file is first written there only after the whole talk.
 * @param out The --out the command was given.
 * @param file Where it resolves to.
 * @throws {CliUsageError} When its directory is not one this process can write in.
 */
function requireWritableDirectory(out: string, file: string): void {
	const directory = dirname(file);
	try {
		if (!statSync(directory).isDirectory()) throw new Error(`${directory} is not a directory`);
		accessSync(directory, constants.W_OK);
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		throw new CliUsageError(
			`--out ${out} must be in a directory that exists and can be written (${why}). Create it, or name another.`,
		);
	}
}

export { containerOf, requireWritableDirectory };
