// The notice is shown once, and showing it never changes the person's setting.

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markNoticeShown, readSettings } from "#runtime/store/telemetry-files.ts";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

test("only one CLI takes the notice, and consent stays unchanged", () => {
	const directory = mkdtempSync(join(tmpdir(), "archboard-telemetry-notice-"));
	directories.push(directory);
	const settings = readSettings(directory);
	expect(markNoticeShown(directory)).toBe(true);
	expect(markNoticeShown(directory)).toBe(false);
	expect(readSettings(directory)).toEqual(settings);
});

test("settings that cannot be read count as turned off", () => {
	const directory = mkdtempSync(join(tmpdir(), "archboard-telemetry-settings-"));
	directories.push(directory);
	writeFileSync(join(directory, "settings.json"), '{"installationId":"x","turnedOff":true}\n');
	expect(readSettings(directory).turnedOff).toBe(true);
});
