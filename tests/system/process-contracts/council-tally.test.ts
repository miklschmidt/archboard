import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve(import.meta.dir, "../../../scripts/council-tally.ts");

test.each(["key.json", "verdicts/one.json", "rulings.json"])(
	"the tally names malformed input %s and refuses before a verdict",
	(input) => {
		const root = mkdtempSync(join(tmpdir(), "archboard-tally-"));
		try {
			const out = join(root, "out");
			const grading = join(root, "grading");
			mkdirSync(out);
			mkdirSync(join(grading, "verdicts"), { recursive: true });
			writeFileSync(
				join(out, "key.json"),
				JSON.stringify({ pairs: [{ pair: "001", before: "A", key: "example" }] }),
			);
			const scores = { K: 5, R: 5, T: 5, L: 5, O: 5, W: 5 };
			writeFileSync(
				join(grading, "verdicts/one.json"),
				JSON.stringify({ "001": { A: scores, B: scores, defects: [] } }),
			);
			writeFileSync(join(grading, "rulings.json"), "{}");
			const path = join(input === "key.json" ? out : grading, input);
			writeFileSync(path, "{");
			const result = Bun.spawnSync([process.execPath, script, out, grading], {
				cwd: root,
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(result.exitCode).toBe(2);
			expect(result.stdout.toString()).toBe("");
			expect(result.stderr.toString()).toContain(path);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
);
