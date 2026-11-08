// The CLI writes no colour where its output goes to a pipe, because an agent parses it, even
// when the caller forces colour. An inherited FORCE_COLOR would otherwise win over NO_COLOR, and
// Bun would write a warning about the two into the diagnostics.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearedEnvironment, packageBin } from "./support/package-cli.ts";

test("a piped command writes no colour and no colour warning when FORCE_COLOR is set", () => {
	const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-colour-")));
	try {
		const repo = join(scratch, "repo");
		expect(spawnSync("git", ["init", "-q", repo]).status).toBe(0);
		const result = spawnSync(packageBin, ["repo", "add", repo], {
			cwd: scratch,
			encoding: "utf8",
			env: {
				...process.env,
				...clearedEnvironment,
				FORCE_COLOR: "1",
				ARCHBOARD_REPOS: join(scratch, "repos.json"),
				ARCHBOARD_NO_AUTOSTART: "1",
				XDG_STATE_HOME: join(scratch, "state"),
				LOG_FILE_PATH: join(scratch, "archboard.log"),
			},
		});
		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr.trim().split("\n"), result.stderr).toHaveLength(1);
		expect(`${result.stdout}${result.stderr}`).not.toContain("\u001b[");
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
});
