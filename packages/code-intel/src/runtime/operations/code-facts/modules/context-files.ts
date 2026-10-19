// The files beside the code that the resolvers read to resolve it (TASK-493).
//
// Code facts resolve an import through a `tsconfig.json` and what it extends,
// a Python project through `pyproject.toml` or `setup.cfg`, a C file through
// `compile_commands.json`, a module's exposure through `package.json`, a Swift
// target through `Package.swift`, a .NET project through its `.csproj`, a
// compose project through its compose files and env files, a Helm chart
// through `values.yaml` and a Kubernetes manifest through the manifests beside
// it. A reader of a ref that supplies only the bound files would resolve none
// of those as the checkout does, so it supplies these too.

import path from "node:path";
import { isComposeFile } from "#runtime/operations/code-facts/compose/compose-project.ts";
import { extendedFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/** Names a resolver reads wherever they stand in a checkout. */
const CONTEXT_NAMES =
	/(?:^|\/)(?:tsconfig[^/]*\.json|jsconfig\.json|package\.json|pyproject\.toml|setup\.cfg|compile_commands\.json|Package\.swift|flake\.lock|values\.yaml)$/u;
/** Extensions of files a resolver reads: a .NET project, a manifest, an env file. */
const CONTEXT_EXTENSIONS = /\.(?:csproj|ya?ml|env)$/u;

/**
 * Whether a resolver may read a file to resolve code beside it.
 * @param file A path relative to its checkout, with `/` between names.
 * @returns True for a configuration, project, manifest, compose or env file.
 */
function isContextFile(file: string): boolean {
	return CONTEXT_NAMES.test(file) || CONTEXT_EXTENSIONS.test(file) || isComposeFile(file);
}

/**
 * The configurations a `tsconfig.json` extends, which a resolver reads in turn.
 * @param file The configuration, relative to its checkout.
 * @param text Its text, comments and trailing commas allowed.
 * @returns Each configuration it extends by a relative path, relative to the checkout.
 */
function extendedConfigs(file: string, text: string): string[] {
	try {
		const parsed: unknown = Bun.JSONC.parse(text);
		const value =
			typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "extends") : null;
		return extendedFiles(value, path.posix.dirname(file));
	} catch {
		return [];
	}
}

export { extendedConfigs, isContextFile };
