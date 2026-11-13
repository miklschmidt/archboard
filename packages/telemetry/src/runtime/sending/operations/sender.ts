// The one sender of usage records: the server, every few minutes (ADR 0079). It sends each error
// report, and one `daily usage` event for each finished day, then deletes what PostHog took.

import fs from "node:fs";
import path from "node:path";
import { TELEMETRY_MS } from "@archboard/timing";
import { ErrorReportSchema } from "#runtime/records/protocol/records.ts";
import { dailyUsage } from "#runtime/rollup/rules/daily-usage.ts";
import { currentConsent } from "#runtime/settings/operations/settings.ts";
import { postToPostHog, type PostEvent } from "#runtime/sending/clients/posthog.ts";
import {
	dailyUsageEvent,
	exceptionEvent,
	type CaptureEvent,
	type Machine,
} from "#runtime/sending/rules/events.ts";
import {
	claim,
	pendingIn,
	readDayRecords,
	readSettings,
	release,
	remove,
	removeRecords,
	telemetryDirectory,
	type Pending,
} from "#runtime/store/telemetry-files.ts";

/** The most error reports that one round sends, so that a burst of errors cannot flood PostHog. */
const MAX_ERRORS_PER_ROUND = 20;

/** What one round needs. Tests give their own clock and post. */
interface Round {
	readonly directory: string;
	/** The time now, in milliseconds since the epoch. */
	readonly now: number;
	readonly post: PostEvent;
	readonly machine: Machine;
}

/**
 * Send one claimed file's event, then delete the file, or give it back when the post failed.
 * @param round The round.
 * @param pending The file.
 * @param eventOf Makes the event of the claimed file, or null for a file that holds none.
 */
async function sendFile(
	round: Round,
	pending: Pending,
	eventOf: (claimed: string) => CaptureEvent | null,
): Promise<void> {
	const claimed = claim(pending.file, round.now);
	if (claimed === null) return;
	try {
		const event = eventOf(claimed);
		const result = event === null ? "refused" : await round.post(event);
		if (result === "failed") {
			release(claimed, pending.file);
		} else {
			remove(claimed);
		}
	} catch {
		remove(claimed);
	}
}

/**
 * Whether a file is young enough to send. An older one is deleted unsent.
 * @param round The round.
 * @param pending The file.
 * @returns True when the file can still be sent.
 */
function fresh(round: Round, pending: Pending): boolean {
	if (round.now - pending.changedAt <= TELEMETRY_MS.keep) return true;
	remove(pending.file);
	return false;
}

/**
 * Send every error report that waits, up to `MAX_ERRORS_PER_ROUND`.
 * @param round The round.
 */
async function sendErrors(round: Round): Promise<void> {
	const waiting = pendingIn(path.join(round.directory, "errors"), round.now).filter((pending) =>
		fresh(round, pending),
	);
	for (const pending of waiting.slice(0, MAX_ERRORS_PER_ROUND)) {
		// oxlint-disable-next-line no-await-in-loop -- one post at a time, so a slow network holds one connection
		await sendFile(round, pending, (claimed) => {
			const report = ErrorReportSchema.safeParse(JSON.parse(fs.readFileSync(claimed, "utf8")));
			return report.success ? exceptionEvent(report.data, round.machine) : null;
		});
	}
}

/**
 * The UTC day of a day file.
 * @param file The file.
 * @returns The day, such as `2026-11-13`, or null for another file.
 */
function dayOf(file: string): string | null {
	return /^(?<day>\d{4}-\d{2}-\d{2})\.jsonl$/u.exec(path.basename(file))?.groups?.["day"] ?? null;
}

/**
 * Send one `daily usage` event for each finished UTC day that waits.
 * @param round The round.
 */
async function sendDays(round: Round): Promise<void> {
	const today = new Date(round.now).toISOString().slice(0, 10);
	for (const pending of pendingIn(path.join(round.directory, "days"), round.now)) {
		const day = dayOf(pending.file);
		if (day === null || day >= today || !fresh(round, pending)) continue;
		// oxlint-disable-next-line no-await-in-loop -- one post at a time, so a slow network holds one connection
		await sendFile(round, pending, (claimed) => {
			const records = readDayRecords(claimed);
			return records.length === 0 ? null : dailyUsageEvent(day, dailyUsage(records), round.machine);
		});
	}
}

/**
 * Send what waits: every error report, and the day files of finished UTC days. A file older than
 * `TELEMETRY_MS.keep` is deleted unsent.
 * @param round The round.
 */
async function sendRound(round: Round): Promise<void> {
	await sendErrors(round);
	await sendDays(round);
}

/**
 * Run one round in this process: delete every record when usage is off, else send what waits.
 * @param post Posts one event.
 */
async function runRound(post: PostEvent): Promise<void> {
	const directory = telemetryDirectory(process.env);
	if (!currentConsent().on) {
		removeRecords(directory);
		return;
	}
	await sendRound({
		directory,
		now: Date.now(),
		post,
		machine: {
			installationId: readSettings(directory).installationId,
			os: process.platform,
			arch: process.arch,
		},
	});
}

/**
 * Start the sender: one round now, then one every `TELEMETRY_MS.round`. A round never throws and
 * never keeps the process alive.
 * @param post Posts one event. The server gives none, and the sender posts to PostHog.
 * @returns Stops the sender.
 */
function startTelemetrySender(post: PostEvent = postToPostHog): () => void {
	let running: Promise<void> | null = null;
	/** Start a round, unless one is under way. */
	const tick = (): void => {
		running ??= runRound(post)
			.catch(() => {
				// A failed round leaves its files for the next one.
			})
			.finally(() => {
				running = null;
			});
	};
	tick();
	const timer = setInterval(tick, TELEMETRY_MS.round);
	timer.unref();
	return function stopTelemetrySender() {
		clearInterval(timer);
	};
}

export { sendRound, startTelemetrySender, type Round };
