// The Python environment pyright reads a checkout with (ADR 0046,
// TASK-367.14).
//
// pyright resolves an import of an installed package through the
// environment's `site-packages`. It reads `pyrightconfig.json` or
// `[tool.pyright]` in `pyproject.toml` at the checkout's root itself, and a
// `venvPath` and `venv` there win over what the client says; it reads that
// environment's files and runs none of them. Without them it asks the client
// for `python.pythonPath`, and with none it runs the `python3` on the `PATH`.
//
// pyright runs the interpreter it is given to list its search paths, so the
// client names the interpreter of a virtual environment in the checkout's
// root, `.venv` or then `venv`, only when this machine made it: Git tracks no
// file of the environment's directory and not its interpreter, where each
// really is after symbolic links, in any case of their names. Where Git cannot
// answer, the client names none. basedpyright runs `.venv/bin/python` by
// itself when the client names no interpreter (measured with 1.39.8), so a
// checkout whose `.venv` holds an interpreter the client does not name is not
// asked: the pass says once that it is not ready. An environment elsewhere,
// such as one Poetry or Hatch keeps outside the checkout, is found only by
// running those tools, so pyright then uses the `python3` on the `PATH`.
//
// What an environment this machine made holds is this machine's making: its
// `pyvenv.cfg`, the base interpreter that names, and the startup hooks of the
// packages installed in it, which the interpreter runs as it starts.

import fs from "node:fs/promises";
import path from "node:path";
import type { Once, Project } from "@/runtime/language-servers/lib/languages";
import { listedFiles } from "@/runtime/language-servers/lib/listed-files";

/** The directories a virtual environment of a checkout is made in, in the order they are looked for. */
const ENVIRONMENTS = [".venv", "venv"] as const;

/** The interpreter of a virtual environment, from its directory. */
const INTERPRETER =
	process.platform === "win32" ? path.join("Scripts", "python.exe") : path.join("bin", "python");

/** An interpreter in an environment directory of the checkout's root. */
interface Environment {
	readonly interpreter: string;
	/** This machine made it: Git tracks none of it. */
	readonly made: boolean;
}

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
 * Whether Git tracks no file at or under some paths of a checkout, where each
 * really is after symbolic links and in any case of its name. A path whose
 * real place is outside the checkout is this machine's.
 * @param root The checkout, absolute.
 * @param paths The paths, absolute.
 * @returns True when Git tracks none of them; false also when Git cannot answer.
 */
async function untracked(root: string, paths: readonly string[]): Promise<boolean> {
	try {
		const checkout = await fs.realpath(root);
		const places = await Promise.all(paths.map((each) => fs.realpath(each)));
		const pathspecs = places.flatMap((place) => {
			const relative = path.relative(checkout, place);
			if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
				return [];
			}
			return [`:(icase,literal)${relative === "" ? "." : relative.split(path.sep).join("/")}`];
		});
		if (pathspecs.length === 0) return true;
		return (await listedFiles(root, pathspecs, false))?.length === 0;
	} catch {
		return false;
	}
}

/**
 * The interpreter in an environment directory of the checkout's root, and
 * whether this machine made it.
 * @param root The checkout, absolute.
 * @param name The directory.
 * @returns It, or undefined when the directory holds no interpreter.
 */
async function environmentIn(root: string, name: string): Promise<Environment | undefined> {
	const interpreter = path.join(root, name, INTERPRETER);
	if (!(await exists(interpreter))) return undefined;
	return { interpreter, made: await untracked(root, [path.join(root, name), interpreter]) };
}

/**
 * The project pyright answers about: the checkout, read with its own virtual
 * environment when this machine made one, and not ready when its `.venv`
 * holds an interpreter that basedpyright would run by itself.
 * @param root The checkout, absolute.
 * @returns The project.
 */
async function environmentOf(root: string): Promise<Project> {
	const [venv, other] = await Promise.all(ENVIRONMENTS.map((name) => environmentIn(root, name)));
	const pythonPath = [venv, other].find((each) => each?.made === true)?.interpreter;
	if (pythonPath !== undefined) return { root, settings: { python: { pythonPath } } };
	if (venv === undefined) return { root };
	return {
		root,
		unready: `Git tracks ${path.join(ENVIRONMENTS[0], INTERPRETER)} or its directory, or cannot say, and basedpyright runs it when no other interpreter is named`,
	};
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
