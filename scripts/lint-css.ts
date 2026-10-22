// The CSS half of the repository's import boundary check.
import fs from "node:fs";
import path from "node:path";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no manifest imports
import { cssProblems, stylesheetFiles } from "../tools/css-imports.ts";

try {
	const cwd = process.cwd();
	const problems = stylesheetFiles(cwd).flatMap((file) =>
		cssProblems(cwd, file, fs.readFileSync(path.join(cwd, file), "utf8")),
	);
	for (const problem of problems) {
		console.error(
			`${problem.file}:${problem.loc.line}:${problem.loc.column}: archboard/${problem.rule} (${problem.messageId}): ${JSON.stringify(problem.url)}: ${problem.message}`,
		);
	}
	process.exitCode = problems.length > 0 ? 1 : 0;
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
