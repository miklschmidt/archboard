// The Python environment pyright reads a checkout with (ADR 0046,
// TASK-367.14, TASK-433).
//
// pyright resolves an import of an installed package through the
// environment's `site-packages`. It reads `pyrightconfig.json` or
// `[tool.pyright]` in `pyproject.toml` at the checkout's root itself, and a
// `venvPath` and `venv` there win over what the client says. Without them it
// asks the client for `python.pythonPath`, and with none it runs the `python3`
// on the `PATH`. So the client names the interpreter of a virtual environment
// in the checkout's root, `.venv` or then `venv`, as an editor's Python
// extension does, and nothing else about the environment. An environment
// elsewhere, such as one Poetry or Hatch keeps outside the checkout, is found
// only by running those tools, so pyright then uses the `python3` on the
// `PATH`.

import fs from "node:fs/promises";
import path from "node:path";
import type { Once, Project } from "#runtime/operations/language-servers/languages.ts";

/** The directories a virtual environment of a checkout is made in, in the order they are looked for. */
const ENVIRONMENTS = [".venv", "venv"] as const;

/** The interpreter of a virtual environment, from its directory. */
const INTERPRETER =
	process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python");

/**
 * The project pyright answers about: the checkout, read with its own virtual
 * environment when it has one.
 * @param root The checkout, absolute.
 * @returns The project.
 */
async function environmentOf(root: string): Promise<Project> {
	const interpreters = ENVIRONMENTS.map((name) => path.join(root, name, INTERPRETER));
	const found = await Promise.all(
		interpreters.map((file) =>
			fs.stat(file).then(
				() => true,
				() => false,
			),
		),
	);
	const pythonPath = interpreters[found.indexOf(true)];
	return pythonPath === undefined ? { root } : { root, settings: { python: { pythonPath } } };
}

/**
 * The project pyright answers about for a file: the checkout, looked at once
 * in a pass.
 * @param root The checkout, absolute.
 * @param _file The file; every file of a checkout has one project.
 * @param once A look the pass does once for each checkout.
 * @returns The project.
 */
function pythonProjectOf(root: string, _file: string, once: Once): Promise<Project> {
	return once(`python-environment\0${root}`, () => environmentOf(root));
}

export { pythonProjectOf };
