import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("the corpus draws the states that read, and a comparison only where a state has a base", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-corpus-states-"));
	try {
		mkdirSync(join(root, ".archboard"), { recursive: true });
		mkdirSync(join(root, "examples"));
		cpSync(
			fileURLToPath(new URL("../../../../../../examples/web-shop", import.meta.url)),
			join(root, ".archboard", "vault"),
			{ recursive: true },
		);
		const out = join(root, "corpus");
		const child = Bun.spawn(
			[
				process.execPath,
				fileURLToPath(new URL("../../../../../../scripts/render-corpus.ts", import.meta.url)),
				"render",
				out,
				"--engines",
				"track",
				"--themes",
				"light",
				"--comparison",
				"on,off",
				"--jobs",
				"1",
			],
			{ cwd: root, stdout: "ignore", stderr: "pipe" },
		);
		const [status, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		expect(status, errors).toBe(0);
		const readings = Object.keys(JSON.parse(readFileSync(join(out, "corpus.json"), "utf8")))
			.map((key) => key.split(" | "))
			.filter((fields) => fields[3] === "(whole model)")
			.map((fields) => [fields[2], fields[6]].join(" "));
		expect(readings).toEqual(["Synchronous checkout plain"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
