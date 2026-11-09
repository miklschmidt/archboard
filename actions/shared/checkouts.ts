// The checkouts this machine knows, from `archboard repo list`, and the files in them. A binding
// and a piece of evidence name a repository by identity. The registry says where that
// repository's checkout is.

import { readFileSync } from "node:fs";

/** The part of `archboard repo list` that names a checkout. */
interface RepoList {
	readonly repos?:
		| readonly {
				readonly repo: string;
				readonly root: string;
				readonly chosen?: boolean | undefined;
				readonly exists?: boolean | undefined;
		  }[]
		| undefined;
}

/**
 * The checkout of each repository identity: the checked repository's own root, the chosen one,
 * else the first that exists. The CLI reads its own vault's checkout regardless of registry choice.
 * @param list The answer of `archboard repo list`.
 * @param preferredRoot The root of the repository whose vault was checked.
 * @returns The root of each repository's checkout.
 */
function checkoutRoots(list: RepoList | undefined, preferredRoot?: string): Map<string, string> {
	const roots = new Map<string, string>();
	const present = (list?.repos ?? []).filter((entry) => entry.exists !== false);
	for (const entry of present.toSorted(
		(a, b) =>
			Number(b.root === preferredRoot) - Number(a.root === preferredRoot) ||
			Number(b.chosen === true) - Number(a.chosen === true),
	)) {
		if (!roots.has(entry.repo)) roots.set(entry.repo, entry.root);
	}
	return roots;
}

/**
 * Read files of this machine once each.
 * @returns A reader that answers undefined for a file that is missing or not readable.
 */
function cachedFileReader(): { read(absolutePath: string): string | undefined } {
	const cache = new Map<string, string | undefined>();
	return {
		/**
		 * Read a file once.
		 * @param absolutePath The file.
		 * @returns Its text, or undefined when it cannot be read.
		 */
		read(absolutePath) {
			if (!cache.has(absolutePath)) {
				try {
					cache.set(absolutePath, readFileSync(absolutePath, "utf8"));
				} catch {
					cache.set(absolutePath, undefined);
				}
			}
			return cache.get(absolutePath);
		},
	};
}

export { cachedFileReader, checkoutRoots, type RepoList };
