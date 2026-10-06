// The Python environment pyright reads a checkout with (ADR 0046,
// TASK-367.14).
//
// pyright resolves an import of an installed package through the
// environment's `site-packages`. It reads `pyrightconfig.json` or
// `[tool.pyright]` in `pyproject.toml` at the checkout's root itself, and a
// `venvPath` and `venv` there win over what the client says. Without them it
// asks the client for `python.pythonPath`, and with none it uses the `python`
// on the `PATH`.
//
// The client names the interpreter of a virtual environment in the checkout's
// root, `.venv` or then `venv`, with its `pyvenv.cfg`, as uv, Poetry's
// in-project setting, PDM and `python -m venv` make it. pyright runs that
// interpreter once to list its search paths, so the client names it only when
// Git tracks no file under it: an environment made on this machine, never a
// program a checkout ships. An environment elsewhere, such as one Poetry or
// Hatch keeps outside the checkout, is found only by running those tools, so
// pyright then uses the `python` on the `PATH`.

import fs from "node:fs/promises";
import path from "node:path";
import type { Project } from "@/runtime/language-servers/lib/languages";
import { listedFiles } from "@/runtime/language-servers/lib/listed-files";

/** The directories a virtual environment of a checkout is made in, in the order they are looked for. */
const ENVIRONMENTS = [".venv", "venv"] as const;

/** The interpreter of a virtual environment, from its directory. */
const INTERPRETER =
	process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python");

/**
 * Whether a file exists.
 * @param file The file.
 * @returns True when it does.
 */
async function exists(file: string): Promise<boolean> {
	return fs.stat(file).then(
		() => true,
		() => false,
	);
}

/**
 * The interpreter of a virtual environment in a directory of the checkout's
 * root, if it has a `pyvenv.cfg` and an interpreter and Git tracks no file
 * under it.
 * @param root The checkout, absolute.
 * @param name The directory.
 * @returns The interpreter, absolute, or undefined.
 */
async function environmentIn(root: string, name: string): Promise<string | undefined> {
	const interpreter = path.join(root, name, INTERPRETER);
	const made = (await exists(path.join(root, name, "pyvenv.cfg"))) && (await exists(interpreter));
	if (!made) return undefined;
	return (await listedFiles(root, [name], false)).length === 0 ? interpreter : undefined;
}

/**
 * The interpreter of the checkout's own virtual environment, the first of
 * the directories it is made in.
 * @param root The checkout, absolute.
 * @returns The interpreter, absolute, or undefined when the checkout has none.
 */
async function interpreterOf(root: string): Promise<string | undefined> {
	const found = await Promise.all(ENVIRONMENTS.map((name) => environmentIn(root, name)));
	return found.find((interpreter) => interpreter !== undefined);
}

/**
 * The project pyright answers about: the checkout, read with its own virtual
 * environment when it has one.
 * @param root The checkout, absolute.
 * @returns The project.
 */
async function pythonProjectOf(root: string): Promise<Project> {
	const pythonPath = await interpreterOf(root);
	return pythonPath === undefined ? { root } : { root, settings: { python: { pythonPath } } };
}

export { pythonProjectOf };
