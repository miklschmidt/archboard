// The files of an installation's usage records in the state directory (ADR 0079):
//
//   telemetry/settings.json        the installation id and the person's setting
//   telemetry/notice-shown         an exclusive marker for the one-time notice
//   telemetry/days/<date>.jsonl    one record per line, appended by every process of that day
//   telemetry/errors/<id>.json     the full report of one error
//
// A sender claims a file by renaming it to `<name>.sending-<pid>-<time>`, so that two servers never send
// one file twice. A claim that outlives its sender goes back to the queue.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { TELEMETRY_MS } from "@archboard/timing";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import { stateDir } from "@archboard/workspace/state-dir";
import {
	DayRecordSchema,
	type DayRecord,
	type ErrorReport,
} from "#runtime/records/protocol/records.ts";

/** The variable that names the directory, so that a child records where its server sends from. */
const DIRECTORY_VARIABLE = "ARCHBOARD_TELEMETRY_DIR";

/** The settings of an installation. */
const SettingsSchema = z.object({
	/** A random id that names this installation and nothing else. */
	installationId: z.uuid(),
	/** Whether the person ran `archboard telemetry off`. */
	turnedOff: z.boolean().default(false),
});

type Settings = z.infer<typeof SettingsSchema>;

/** A file that waits to be sent. */
interface Pending {
	readonly file: string;
	/** When it was last written, in milliseconds since the epoch. */
	readonly changedAt: number;
}

/**
 * The directory of the usage records.
 * @param env The process environment.
 * @returns The directory.
 */
function telemetryDirectory(env: Readonly<Record<string, string | undefined>>): string {
	return env[DIRECTORY_VARIABLE] || path.join(stateDir(), "telemetry");
}

/**
 * Read a settings file.
 * @param file The file.
 * @returns The settings, or null for a file that is missing or holds no settings.
 */
function parseSettings(file: string): Settings | null {
	try {
		return SettingsSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
	} catch {
		return null;
	}
}

/**
 * Read the settings, or make them with a new installation id. The first write is exclusive, so a
 * process that starts at the same time keeps the id, and any opt-out, of the one that wrote first.
 * @param directory The telemetry directory.
 * @returns The settings.
 */
function readSettings(directory: string): Settings {
	const file = path.join(directory, "settings.json");
	const existing = parseSettings(file);
	if (existing !== null) return existing;
	const settings: Settings = { installationId: randomUUID(), turnedOff: false };
	try {
		writeFileAtomic(file, `${JSON.stringify(settings)}\n`, {
			createParents: true,
			exclusive: true,
		});
		return settings;
	} catch {
		// Another process wrote the settings first, or the file holds none and is replaced.
		const raced = parseSettings(file);
		if (raced !== null) return raced;
		writeSettings(directory, settings);
		return settings;
	}
}

/**
 * Write the settings.
 * @param directory The telemetry directory.
 * @param settings The settings.
 */
function writeSettings(directory: string, settings: Settings): void {
	writeFileAtomic(path.join(directory, "settings.json"), `${JSON.stringify(settings)}\n`, {
		createParents: true,
	});
}

/**
 * Mark the one-time notice without replacing consent. Only one concurrent CLI takes it.
 * @param directory The telemetry directory.
 * @returns True for the process that first marks the notice, else false.
 */
function markNoticeShown(directory: string): boolean {
	try {
		fs.writeFileSync(path.join(directory, "notice-shown"), "", { flag: "wx" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Append a record to the file of its UTC day. One short line is one write, so the records of
 * processes that append at the same time do not mix.
 * @param directory The telemetry directory.
 * @param record The record.
 */
function appendDayRecord(directory: string, record: DayRecord): void {
	const days = path.join(directory, "days");
	fs.mkdirSync(days, { recursive: true });
	fs.appendFileSync(
		path.join(days, `${record.t.slice(0, 10)}.jsonl`),
		`${JSON.stringify(record)}\n`,
	);
}

/**
 * Write the full report of one error to a file of its own.
 * @param directory The telemetry directory.
 * @param report The report.
 */
function writeErrorReport(directory: string, report: ErrorReport): void {
	writeFileAtomic(
		path.join(directory, "errors", `${Date.parse(report.t)}-${randomUUID()}.json`),
		JSON.stringify(report),
		{ createParents: true },
	);
}

/**
 * The names in a folder, in order.
 * @param folder The folder.
 * @returns The names, or none when the folder does not exist.
 */
function namesIn(folder: string): string[] {
	try {
		return fs.readdirSync(folder).toSorted();
	} catch {
		return [];
	}
}

/**
 * The name of the file that a claim holds.
 * @param name A file name.
 * @returns The original name and the claim time, or null for an unclaimed file.
 */
function claimOf(name: string): { original: string; at: number } | null {
	const groups = /^(?<original>.+)\.sending-\d+-(?<at>\d+)$/u.exec(name)?.groups;
	const original = groups?.["original"];
	const at = groups?.["at"];
	return original === undefined || at === undefined ? null : { original, at: Number(at) };
}

/**
 * Whether one name of a folder waits to be sent. A claim that is older than
 * `TELEMETRY_MS.staleClaim` goes back to the queue, for the next round.
 * @param folder The folder.
 * @param name The name.
 * @param now The time now, in milliseconds since the epoch.
 * @returns The waiting file, or null.
 */
function waiting(folder: string, name: string, now: number): Pending | null {
	// A name with a leading dot is a write in progress (`writeFileAtomic`'s temporary file).
	if (name.startsWith(".")) return null;
	const file = path.join(folder, name);
	const changedAt = fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs;
	if (changedAt === undefined) return null;
	const held = claimOf(name);
	if (held === null) return { file, changedAt };
	if (now - held.at > TELEMETRY_MS.staleClaim) release(file, path.join(folder, held.original));
	return null;
}

/**
 * The files of one folder that wait to be sent, oldest first.
 * @param folder The folder.
 * @param now The time now, in milliseconds since the epoch.
 * @returns The waiting files.
 */
function pendingIn(folder: string, now: number): Pending[] {
	return namesIn(folder).flatMap((name) => waiting(folder, name, now) ?? []);
}

/**
 * Claim a file for this process.
 * @param file The file.
 * @param now The time at which the sender claims the file.
 * @returns The claimed path, or null when another sender claimed it first.
 */
function claim(file: string, now: number): string | null {
	const claimed = `${file}.sending-${process.pid}-${now}`;
	try {
		fs.renameSync(file, claimed);
		return claimed;
	} catch {
		return null;
	}
}

/**
 * Give a claimed file back to the queue.
 * @param claimed The claimed path.
 * @param file The file's own path.
 */
function release(claimed: string, file: string): void {
	try {
		fs.renameSync(claimed, file);
	} catch {
		// Another sender released it, or it is gone. Either way, nothing waits on it.
	}
}

/**
 * Delete a file.
 * @param file The file.
 */
function remove(file: string): void {
	fs.rmSync(file, { force: true });
}

/**
 * Read the records of a day file. A line that is no record is skipped.
 * @param file The day file.
 * @returns The records.
 */
function readDayRecords(file: string): DayRecord[] {
	return fs
		.readFileSync(file, "utf8")
		.split("\n")
		.flatMap((line) => {
			if (line === "") return [];
			try {
				const parsed = DayRecordSchema.safeParse(JSON.parse(line));
				return parsed.success ? [parsed.data] : [];
			} catch {
				return [];
			}
		});
}

/**
 * Delete every record that waits, when the person turns usage off.
 * @param directory The telemetry directory.
 */
function removeRecords(directory: string): void {
	fs.rmSync(path.join(directory, "days"), { recursive: true, force: true });
	fs.rmSync(path.join(directory, "errors"), { recursive: true, force: true });
}

export {
	appendDayRecord,
	claim,
	DIRECTORY_VARIABLE,
	markNoticeShown,
	pendingIn,
	readDayRecords,
	readSettings,
	release,
	remove,
	removeRecords,
	telemetryDirectory,
	writeErrorReport,
	writeSettings,
	type Pending,
	type Settings,
};
