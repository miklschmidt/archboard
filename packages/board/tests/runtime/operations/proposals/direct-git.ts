// Real Git without the process owner of `@archboard/process/git`. That owner boots a Bun
// process for each of the roughly 60 Git calls in one write, about 2.5 s a write, and
// `packages/process` and the CLI owners of proposals prove it.
import { git as supervisedGit, GitCommandError } from "@archboard/process/git";

const OUTPUT_LIMIT = 64 * 1024;

export const directGit: typeof supervisedGit = async (cwd, args, options = {}) => {
	const child = Bun.spawn([options.executable ?? "git", ...args], {
		cwd,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
		stdin: options.input ?? "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, out, err] = await Promise.all([
		child.exited,
		new Response(child.stdout).bytes(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0)
		throw new GitCommandError(
			"exit",
			err.trim() || `Git exited with status ${exitCode}.`,
			exitCode,
		);
	if (out.length > (options.maxOutputBytes ?? OUTPUT_LIMIT))
		throw new GitCommandError("output", "Git printed more than the limit.", exitCode);
	const output = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(out);
	return (options.trimOutput === false ? output : output.trim()) || undefined;
};

export { GitCommandError };
