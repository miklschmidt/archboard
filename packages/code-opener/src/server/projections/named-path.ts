// A file an agent's answer names, as the binding it would be: the checkout that
// holds the file among those the vault reads, and the file's path in it. The
// binding resolver then holds the file to what a binding of the vault can open
// (ADR 0018), so a path in no such checkout opens nothing, and neither does a
// path that a link leads out of its checkout.

import fs from "node:fs";
import path from "node:path";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import { checkoutsReadFrom, isPathWithin } from "@archboard/code-binding/resolution";

/** The binding a named file would be, or why it has none. */
type NamedPathBinding =
	| { readonly ok: true; readonly binding: CodeBinding }
	| {
			readonly ok: false;
			readonly code: "TARGET_UNAVAILABLE" | "TARGET_OUTSIDE_CHECKOUT";
			readonly error: string;
	  };

/**
 * The real path of a file or directory.
 * @param candidate The path.
 * @returns Its real path, or undefined when nothing is there.
 */
function realpathOf(candidate: string): string | undefined {
	try {
		return fs.realpathSync.native(candidate);
	} catch {
		return undefined;
	}
}

/**
 * The binding of a file an answer names, in the checkout that holds it.
 * @param vault The vault whose checkouts the file must be in.
 * @param named The absolute path the answer names.
 * @returns The binding, or why the file has none.
 */
function namedPathBinding(vault: string, named: string): NamedPathBinding {
	if (!path.isAbsolute(named)) {
		return { ok: false, code: "TARGET_OUTSIDE_CHECKOUT", error: `${named} is not absolute.` };
	}
	const target = realpathOf(named);
	if (target === undefined) {
		return {
			ok: false,
			code: "TARGET_UNAVAILABLE",
			error: `${named} does not exist on this machine.`,
		};
	}
	// A checkout can hold another, as a worktree in the directory of its main checkout does,
	// so the innermost checkout holds the file.
	const holder = checkoutsReadFrom(vault)
		.flatMap((entry) => {
			const root = realpathOf(entry.root);
			return root !== undefined && isPathWithin(root, target) ? [{ repo: entry.repo, root }] : [];
		})
		.toSorted((a, b) => b.root.length - a.root.length)[0];
	if (holder === undefined) {
		return {
			ok: false,
			code: "TARGET_OUTSIDE_CHECKOUT",
			error: `${named} is in no checkout that this vault reads. Choose the checkout of its repository with archboard repo use <dir>.`,
		};
	}
	return { ok: true, binding: { repo: holder.repo, path: path.relative(holder.root, target) } };
}

export { namedPathBinding };
