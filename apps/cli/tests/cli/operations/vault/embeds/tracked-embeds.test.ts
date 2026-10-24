// Which tracked files of a checkout are embeds (ADR 0057), for the files the
// embeds system test does not draw: a name Git would quote, a tracked file
// deleted from the working tree, and a tracked symbolic link, whose target Git
// does not track and which `--fix` would replace with a file.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { trackedEmbeds } from "#cli/operations/vault/embeds/tracked-embeds.ts";

const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-tracked-embeds-"));
afterAll(() => fs.rmSync(checkout, { recursive: true, force: true }));

/** An SVG document whose recipe element holds no recipe: still an embed, one nobody can draw again. */
const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg"><metadata><archboard:render-recipe>?</archboard:render-recipe></metadata></svg>';

test("an embed is a tracked file of its own on disk, whatever Git would quote in its name", async () => {
	const git = (...args: string[]) =>
		expect(spawnSync("git", args, { cwd: checkout }).status).toBe(0);
	git("init", "-q");
	fs.mkdirSync(path.join(checkout, "docs"));
	fs.writeFileSync(path.join(checkout, "docs", "a board ü.SVG"), SVG);
	fs.writeFileSync(path.join(checkout, "docs", "gone.svg"), SVG);
	fs.symlinkSync("a board ü.SVG", path.join(checkout, "docs", "link.svg"));
	git("add", ".");
	fs.rmSync(path.join(checkout, "docs", "gone.svg"));
	const embeds = await trackedEmbeds(checkout, AbortSignal.timeout(10_000));
	expect(embeds.map((embed) => embed.file)).toEqual(["docs/a board ü.SVG"]);
});
