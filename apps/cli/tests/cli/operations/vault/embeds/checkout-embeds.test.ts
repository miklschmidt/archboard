// Which tracked files of a checkout are embeds (ADR 0057), for the files the
// embeds system test does not draw: a name Git would quote, a tracked file
// deleted from the working tree, a tracked symbolic link, whose target Git
// does not track and which `--fix` would replace with a file, and a file under
// a directory that became a link to outside the checkout.

import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkoutEmbeds } from "#cli/operations/vault/embeds/checkout-embeds.ts";

const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-checkout-embeds-"));
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
	fs.mkdirSync(path.join(checkout, "site"));
	fs.writeFileSync(path.join(checkout, "site", "moved.svg"), SVG);
	git("add", ".");
	fs.rmSync(path.join(checkout, "docs", "gone.svg"));
	// A directory replaced by a link to outside the checkout, not yet committed.
	const outside = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-outside-"));
	fs.writeFileSync(path.join(outside, "moved.svg"), SVG);
	fs.rmSync(path.join(checkout, "site"), { recursive: true });
	fs.symlinkSync(outside, path.join(checkout, "site"));
	const embeds = await checkoutEmbeds(checkout, AbortSignal.timeout(10_000));
	fs.rmSync(outside, { recursive: true, force: true });
	expect(embeds.map((embed) => embed.file)).toEqual(["docs/a board ü.SVG"]);
});
