// The solution csharp-ls loads for a .NET checkout (ADR 0046, TASK-367.14).
//
// csharp-ls loads one solution, or with none every project file it finds,
// through MSBuild, and answers a question only once it has loaded them. Left
// to itself it looks under every directory, ignored ones too, and takes the
// solution with the most projects. The client names the solution instead, as
// the check reads a checkout: of the `.sln` and `.slnx` files Git does not
// ignore, the one nearest the root, then the first by name. With no solution
// it leaves csharp-ls to load the `.csproj` files. A checkout with neither
// has nothing a C# server can load, so no server starts and the pass says so
// once.

import path from "node:path";
import type { Once, Project } from "@/runtime/language-servers/lib/languages";
import { listedFiles } from "@/runtime/language-servers/lib/listed-files";

/**
 * How many directories down a file is.
 * @param file The file, relative to the checkout.
 * @returns Its depth: 1 at the root.
 */
function depth(file: string): number {
	return file.split("/").length;
}

/**
 * The solution nearest the root, then the first by name.
 * @param solutions Each solution, relative to the checkout.
 * @returns It, or undefined when there is none.
 */
function nearest(solutions: readonly string[]): string | undefined {
	return solutions.toSorted((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
}

/**
 * The project csharp-ls answers about: the checkout, with the solution it
 * loads, or why it has nothing to load.
 * @param root The checkout, absolute.
 * @returns The project.
 */
async function solutionOf(root: string): Promise<Project> {
	const files = await listedFiles(root, ["*.sln", "*.slnx", "*.csproj"]);
	if (files === undefined) return { root, unready: "Git cannot list the checkout's files" };
	const solution = nearest(files.filter((file) => /\.slnx?$/u.test(file)));
	if (solution !== undefined) {
		return { root, settings: { csharp: { solutionPathOverride: path.join(root, solution) } } };
	}
	if (files.length > 0) return { root };
	return { root, unready: "the checkout has no .sln, .slnx or .csproj file for it to load" };
}

/**
 * The project csharp-ls answers about for a file: the checkout, looked at
 * once in a pass, since Git walks the whole checkout to list its solutions.
 * @param root The checkout, absolute.
 * @param _file The file; every file of a checkout has one project.
 * @param once A look the pass does once for each checkout.
 * @returns The project.
 */
function dotnetProjectOf(root: string, _file: string, once: Once): Promise<Project> {
	return once(`dotnet-solution\0${root}`, () => solutionOf(root));
}

export { dotnetProjectOf };
