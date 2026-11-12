// The sender posts each error report and one event for each finished day, deletes what PostHog
// took or refused, keeps what failed for the next round, and drops what is too old (ADR 0079).

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandRecord, ErrorReport } from "#runtime/records/protocol/records.ts";
import type { PostResult } from "#runtime/sending/clients/posthog.ts";
import { sendRound } from "#runtime/sending/operations/sender.ts";
import type { CaptureEvent } from "#runtime/sending/rules/events.ts";
import { appendDayRecord, writeErrorReport } from "#runtime/store/telemetry-files.ts";

const NOW = Date.parse("2026-11-13T08:00:00.000Z");
const machine = {
	installationId: "a3f0c6de-2c64-4a39-8f0c-8f4f7c1f9e11",
	os: "linux",
	arch: "x64",
};
let directory = "";

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "archboard-telemetry-"));
});

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

/**
 * A command record at a time.
 * @param t The ISO time.
 * @returns The record.
 */
function command(t: string): CommandRecord {
	return {
		kind: "command",
		t,
		command: "model read",
		exit: 0,
		ms: 50,
		agent: "claude",
		runner: null,
		version: "0.4.1",
		install: "release",
	};
}

const report: ErrorReport = {
	t: "2026-11-13T07:59:00.000Z",
	process: "cli",
	operation: "model edit",
	type: "TypeError",
	code: null,
	exit: 1,
	frames: [{ function: "edit", filename: "apps/cli/src/bin.ts", lineno: 1, colno: 1 }],
	agent: "claude",
	runner: null,
	version: "0.4.1",
	install: "release",
};

/**
 * Run one round with a post that answers every event the same way.
 * @param result What the post answers.
 * @returns The events that the round posted.
 */
async function round(result: PostResult): Promise<CaptureEvent[]> {
	const posted: CaptureEvent[] = [];
	await sendRound({
		directory,
		now: NOW,
		machine,
		post: async (event) => {
			posted.push(event);
			return result;
		},
	});
	return posted;
}

/**
 * The files that wait in a folder.
 * @param folder `days` or `errors`.
 * @returns Their names.
 */
function waiting(folder: string): string[] {
	return existsSync(join(directory, folder)) ? readdirSync(join(directory, folder)) : [];
}

test("a round sends each error and each finished day, and today's records wait", async () => {
	appendDayRecord(directory, command("2026-11-12T10:00:00.000Z"));
	appendDayRecord(directory, command("2026-11-12T11:00:00.000Z"));
	appendDayRecord(directory, command("2026-11-13T07:00:00.000Z"));
	writeErrorReport(directory, report);

	const posted = await round("sent");

	expect(posted.map((event) => event.event)).toEqual(["$exception", "daily usage"]);
	const [exception, daily] = posted;
	expect(daily).toMatchObject({
		distinct_id: machine.installationId,
		timestamp: "2026-11-12T23:59:59.999Z",
		properties: {
			surface: "product",
			$process_person_profile: false,
			$geoip_disable: true,
			day: "2026-11-12",
			commands: 2,
		},
	});
	expect(exception?.properties).toMatchObject({ operation: "model edit", surface: "product" });
	expect(waiting("errors")).toEqual([]);
	expect(waiting("days")).toEqual(["2026-11-13.jsonl"]);
});

test("a failed post keeps its record for the next round, and a refused one drops it", async () => {
	writeErrorReport(directory, report);
	appendDayRecord(directory, command("2026-11-12T10:00:00.000Z"));

	expect(await round("failed")).toHaveLength(2);
	expect(waiting("errors")).toHaveLength(1);
	expect(waiting("days")).toEqual(["2026-11-12.jsonl"]);

	expect(await round("refused")).toHaveLength(2);
	expect(waiting("errors")).toEqual([]);
	expect(waiting("days")).toEqual([]);
});

test("a record older than seven days is deleted unsent", async () => {
	appendDayRecord(directory, command("2026-11-01T10:00:00.000Z"));
	const old = new Date("2026-11-02T00:00:00.000Z");
	utimesSync(join(directory, "days", "2026-11-01.jsonl"), old, old);

	expect(await round("sent")).toEqual([]);
	expect(waiting("days")).toEqual([]);
});
