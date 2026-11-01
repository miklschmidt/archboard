import { useCallback, useMemo, useState } from "react";

import { pathTo, type ModuleTree } from "#ui/rules/architecture-model/module-tree.ts";

/** What the reader did to the tree, and where the pane stood when they did. */
interface Branches {
	/** The branches the reader opened. */
	readonly opened: ReadonlySet<string>;
	/** The branches on the way to the open module that the reader closed. */
	readonly closed: ReadonlySet<string>;
	readonly at: string | null;
}

/**
 * Which branches of the tree are open: the way to the open module, and whatever the reader
 * opened. A branch the reader closed on that way opens again when the pane moves.
 * @param tree The tree.
 * @param scope The open module.
 * @returns The open branches, and how to fold one.
 */
function useModuleBranches(tree: ModuleTree, scope: string | null) {
	const [branches, setBranches] = useState<Branches>({
		opened: new Set(),
		closed: new Set(),
		at: scope,
	});
	if (branches.at !== scope) setBranches({ ...branches, closed: new Set(), at: scope });
	const way = useMemo(() => new Set(pathTo(tree, scope).map((branch) => branch.id)), [tree, scope]);
	const open = useMemo(
		() => new Set([...way, ...branches.opened].filter((id) => !branches.closed.has(id))),
		[way, branches],
	);
	const toggle = useCallback(
		(id: string): void => {
			setBranches((current) => {
				const opened = new Set(current.opened);
				const closed = new Set(current.closed);
				if (open.has(id)) {
					opened.delete(id);
					if (way.has(id)) closed.add(id);
				} else {
					opened.add(id);
					closed.delete(id);
				}
				return { ...current, opened, closed };
			});
		},
		[open, way],
	);
	return { open, toggle };
}

export { useModuleBranches };
