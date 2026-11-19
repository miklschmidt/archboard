// Which paths of a repository the model binds (TASK-648), so the file tree marks the row of the
// file or folder that a binding names, and its tooltip names the modules. Only the named path carries the name: a file
// below a bound folder belongs to it by the owners rule, which the server applies when the file opens.

/** A module, as the tree reads it. */
interface BoundModule {
	readonly id: string;
	readonly name: string;
	readonly binding?:
		| { readonly repo: string; readonly path: string; readonly symbol?: string | undefined }
		| undefined;
}

/** The modules bound to one path. */
interface PathBinding {
	readonly names: readonly string[];
	/** The symbols they name, where a binding names one. */
	readonly symbols: readonly string[];
}

/**
 * The modules bound to each path of one repository.
 * @param modules Every module of the reading.
 * @param repo The repository.
 * @returns For each bound path, without a trailing `/`, the names and symbols of its modules.
 */
function boundPaths(
	modules: readonly BoundModule[],
	repo: string,
): ReadonlyMap<string, PathBinding> {
	const paths = new Map<string, { names: string[]; symbols: string[] }>();
	for (const module of modules) {
		const binding = module.binding;
		if (binding?.repo !== repo) continue;
		const path = binding.path.replace(/\/+$/u, "");
		const entry = paths.get(path) ?? { names: [], symbols: [] };
		entry.names.push(module.name);
		if (binding.symbol !== undefined) entry.symbols.push(binding.symbol);
		paths.set(path, entry);
	}
	return paths;
}

/**
 * The repositories the tree offers: the model's own first, then each other one a binding names.
 * @param modules Every module of the reading.
 * @param own The model's own repository, once the server named it.
 * @returns The repositories, each once.
 */
function boundRepositories(modules: readonly BoundModule[], own: string | null): readonly string[] {
	const named = modules.flatMap((module) =>
		module.binding === undefined ? [] : [module.binding.repo],
	);
	return [...new Set([...(own === null ? [] : [own]), ...named.toSorted()])];
}

/** The mark at the end of a bound row: small, so a deep tree keeps its names. */
const BOUND_MARK = "◆";

/**
 * What a tree row says about the modules bound to its path: a mark, and their names in its tooltip.
 * @param binding The modules bound to the path.
 * @returns The mark on the row, and the words of its tooltip.
 */
function bindingLabel(binding: PathBinding): { readonly text: string; readonly title: string } {
	const symbols = binding.symbols.length === 0 ? "" : ` (${binding.symbols.join(", ")})`;
	return { text: BOUND_MARK, title: `Bound by ${binding.names.join(", ")}${symbols}` };
}

export { bindingLabel, boundPaths, boundRepositories, type BoundModule, type PathBinding };
