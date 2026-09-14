import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkoutFlask } from "@/runtime/skill-evaluation/index";

test("a pinned source checkout creates missing grading workspace parents", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-eval-checkout-"));
	try {
		const source = path.join(root, "source");
		fs.mkdirSync(source);
		execFileSync("git", ["init", "--quiet"], { cwd: source });
		fs.writeFileSync(path.join(source, "source.py"), "# local fixture\n");
		execFileSync("git", ["add", "source.py"], { cwd: source });
		execFileSync(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.test",
				"-c",
				"commit.gpgSign=false",
				"commit",
				"--quiet",
				"-m",
				"fixture",
			],
			{ cwd: source },
		);
		const commit = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: source,
			encoding: "utf8",
		}).trim();
		const destination = path.join(root, "grader", "workspace", "flask", "fixture");
		expect(
			await checkoutFlask(source, "https://example.test/fixture.git", commit, destination),
		).toBe(commit);
		expect(fs.readFileSync(path.join(destination, "source.py"), "utf8")).toBe("# local fixture\n");
		expect(
			execFileSync("git", ["remote", "get-url", "origin"], {
				cwd: destination,
				encoding: "utf8",
			}).trim(),
		).toBe("https://example.test/fixture.git");
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
