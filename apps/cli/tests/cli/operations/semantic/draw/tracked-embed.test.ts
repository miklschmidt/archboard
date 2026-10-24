// The file `--track` lists (ADR 0057), found before anything is drawn or
// written. A board cannot forget a tracked embed, so a file that the command
// could not write must be refused before the board write lists it. The system
// test tracked-embeds.test.ts owns the board write and the other refusals.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import { plannedFile } from "#cli/operations/semantic/draw/tracked-embed.ts";

const checkout = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archboard-track-file-")));
beforeAll(() => {
	expect(spawnSync("git", ["init", "-q"], { cwd: checkout }).status).toBe(0);
	fs.mkdirSync(path.join(checkout, "docs"));
});
afterAll(() => fs.rmSync(checkout, { recursive: true, force: true }));

/**
 * The file and embed `--track` plans for an output path in the checkout.
 * @param out The output path, from the checkout's root.
 * @returns What the command would write and track.
 */
function planned(out: string) {
	return plannedFile(
		{ out, track: true },
		{ resolvePath: (file) => path.resolve(checkout, file), signal: AbortSignal.timeout(10_000) },
	);
}

test("--track refuses a file in a directory that does not exist, or a directory, before the board lists it", async () => {
	await Promise.all(
		["missing/orders.svg", "docs"].map((out) =>
			expect(planned(out)).rejects.toBeInstanceOf(CliUsageError),
		),
	);
	expect((await planned("docs/orders.svg")).embed?.path).toBe("docs/orders.svg");
});

test("--track names a file through the real directory, in the checkout that holds that directory", async () => {
	fs.symlinkSync("docs", path.join(checkout, "pictures"));
	expect((await planned("pictures/orders.svg")).embed?.path).toBe("docs/orders.svg");
	// A name that starts with two dots is still a file of the checkout.
	expect((await planned("..orders.svg")).embed?.path).toBe("..orders.svg");
});
