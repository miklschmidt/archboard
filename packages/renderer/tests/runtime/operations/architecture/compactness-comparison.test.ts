import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const whole = "vault | Board | current | (whole board) | track | light | plain";
const view = "vault | Board | current | Detail | track | light | plain";

/** Small saved corpora exercise report completeness without a renderer or vault. */
function corpus(dir: string, keys: readonly string[]) {
	mkdirSync(join(dir, "svg"), { recursive: true });
	writeFileSync(
		join(dir, "corpus.json"),
		JSON.stringify(Object.fromEntries(keys.map((key) => [key, { width: 200, height: 100 }]))),
	);
	for (const key of keys)
		writeFileSync(join(dir, "svg", `${key.replaceAll(/[^\w-]+/gu, "_")}.svg`), "<svg/>");
}

test.each(["both", "before", "after"])(
	"compactness comparison accounts for a drawing present in %s corpora",
	async (where) => {
		const root = mkdtempSync(join(tmpdir(), "archboard-compactness-"));
		try {
			const before = join(root, "before"),
				after = join(root, "after"),
				out = join(root, "report");
			corpus(before, where === "after" ? [whole] : [whole, view]);
			corpus(after, where === "before" ? [whole] : [whole, view]);
			const child = Bun.spawn(
				[
					process.execPath,
					fileURLToPath(import.meta.resolve("#tests/runtime/support/compare-compactness.ts")),
					before,
					after,
					out,
				],
				{ stdout: "ignore", stderr: "ignore" },
			);
			const status = await child.exited;
			if (where === "both") {
				expect(status).toBe(0);
				expect(JSON.parse(readFileSync(join(out, "comparisons.json"), "utf8"))).toHaveLength(2);
				expect(JSON.parse(readFileSync(join(out, "whole-boards.json"), "utf8"))).toHaveLength(1);
			} else {
				expect(status).not.toBe(0);
				expect(existsSync(join(out, "comparisons.json"))).toBe(false);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
);
