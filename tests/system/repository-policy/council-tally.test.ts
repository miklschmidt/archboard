import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../../scripts/council-tally.ts", import.meta.url));
const baseline = { K: 3, R: 3, T: 3, L: 3, O: 3, W: 3 };

function grade(after: Partial<typeof baseline> = {}) {
	return { "001": { A: baseline, B: { ...baseline, ...after }, defects: [] } };
}

function runTally(grades: readonly Record<string, unknown>[], before: "A" | "B" = "A") {
	const root = mkdtempSync(join(tmpdir(), "archboard-tally-"));
	try {
		const out = join(root, "out");
		const grading = join(root, "grading");
		mkdirSync(out);
		mkdirSync(join(grading, "verdicts"), { recursive: true });
		writeFileSync(
			join(out, "key.json"),
			JSON.stringify({ pairs: [{ pair: "001", before, key: "board/view/track" }] }),
		);
		grades.forEach((one, index) => {
			writeFileSync(join(grading, "verdicts", `${index}.json`), JSON.stringify(one));
		});
		const result = Bun.spawnSync([process.execPath, script, out, grading], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = result.stdout.toString();
		return {
			exitCode: result.exitCode,
			verdict: stdout.match(/^001\s+(better|worse|same|both fail)\s+/mu)?.[1],
			stderr: result.stderr.toString(),
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test.each(["A", "B"] as const)(
	"an exact 0.40 margin decides the pair with before at %s",
	(before) => {
		const result = runTally(
			Array.from({ length: 4 }, () => grade({ L: 7 })),
			before,
		);
		expect(result.verdict).toBe(before === "A" ? "better" : "worse");
		expect(result.exitCode).toBe(before === "A" ? 0 : 1);
	},
);

test("the two middle margins decide an exact 0.40 median", () => {
	const result = runTally([grade({ K: 4 }), grade({ K: 4 }), grade({ R: 5 }), grade({ R: 5 })]);
	expect(result.verdict).toBe("better");
	expect(result.exitCode).toBe(0);
});
