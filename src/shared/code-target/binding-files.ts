/**
 * The normalized repository-relative path whose files a binding names. A
 * .NET project file stands for its whole project directory; other bindings
 * name their own file or directory. The empty string names the checkout.
 * @param bound The normalized binding path, with `/` between names.
 * @returns The path whose exact file or descendants belong to the binding.
 */
function bindingPathOf(bound: string): string {
	if (!bound.endsWith(".csproj")) return bound;
	const separator = bound.lastIndexOf("/");
	return separator === -1 ? "" : bound.slice(0, separator);
}

/**
 * The files of a binding's scope: its exact path or every descendant of its
 * directory. `bindingPathOf` supplies the directory of a project file. Callers resolve checkout
 * access and symbolic links, and choose which files they may inspect.
 * @param bound The normalized repository-relative scope or former file name.
 * @param files The files to select from, with `/` between names.
 * @returns The matching files in their original order.
 */
function filesOfBinding(bound: string, files: Iterable<string>): string[] {
	return [...files].filter(
		(file) => bound === "" || file === bound || file.startsWith(`${bound}/`),
	);
}

export { bindingPathOf, filesOfBinding };
