// What an executable says of its own version, for checking a pin before any
// model call. `codex --version` and `claude --version` both print one.

import { SKILL_EVAL_MS } from "@archboard/timing";
import { runProcess } from "#runtime/processes/process.ts";

/**
 * The installed version of an executable, as it reports it.
 * @param executable The executable.
 * @returns The version string, or the failure.
 */
async function executableVersion(executable: string): Promise<string> {
	const result = await runProcess({
		argv: [executable, "--version"],
		cwd: process.cwd(),
		env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" },
		timeoutMs: SKILL_EVAL_MS.cli,
	});
	return /(\d+\.\d+\.\d+)/u.exec(result.stdout)?.[1] ?? `unknown (${result.stderr.trim()})`;
}

export { executableVersion };
