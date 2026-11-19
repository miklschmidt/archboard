// A file an agent's answer names, as the binding it would be: the checkout that
// holds the file among those the vault reads, and the file's path in it. The
// binding resolver then holds the file to what a binding of the vault can open
// (ADR 0018), so a path in no such checkout opens nothing, and neither does a
// path that a link leads out of its checkout. A file a code export names is in a repository
// already, and the vault must read a checkout of it too.

import fs from "node:fs";
import path from "node:path";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { CodeTargetOpenRequest } from "#shared/schemas/code-target-open.ts";
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

/**
 * The binding of a file a code export names by its path in its repository, with the symbol the
 * export defines.
 * @param vault The vault, which must read a checkout of the repository.
 * @param request The repository, the file's path in it and the symbol. The binding resolver refuses
 * a path that leaves the checkout.
 * @returns The binding, or why the file has none.
 */
function repositoryPathBinding(
	vault: string,
	request: Extract<CodeTargetOpenRequest, { repo: string }>,
): NamedPathBinding {
	const { repo, path: named, symbol } = request;
	if (!checkoutsReadFrom(vault).some((entry) => entry.repo === repo)) {
		return {
			ok: false,
			code: "TARGET_OUTSIDE_CHECKOUT",
			error: `This vault reads no checkout of ${repo}. Choose one with archboard repo use <dir>.`,
		};
	}
	return { ok: true, binding: { repo, path: named, ...(symbol === undefined ? {} : { symbol }) } };
}

/**
 * The binding of a file that a request names: by its absolute path, or by its path in a repository.
 * @param vault The vault whose checkouts the file must be in.
 * @param request The file.
 * @returns The binding, or why the file has none.
 */
function requestedPathBinding(
	vault: string,
	request: Extract<CodeTargetOpenRequest, { path: string }>,
): NamedPathBinding {
	return "repo" in request
		? repositoryPathBinding(vault, request)
		: namedPathBinding(vault, request.path);
}

export { requestedPathBinding };
