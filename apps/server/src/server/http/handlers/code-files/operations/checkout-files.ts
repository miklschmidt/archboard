// The files of one registered checkout that Git lists, for the file tree of the code browser
// (ADR 0080): tracked, or new and not ignored, as the code check reads them, so a tree never
// names a file that Git ignores. It lists names and reads no file.

import type { z } from "zod";
import type { codeFilesSchema } from "@archboard/code-intel/code-check";
import {
	resolveRegisteredCheckout,
	snapshotCheckoutAccess,
	vaultIdentity,
} from "@archboard/code-binding/resolution";
import { git } from "@archboard/process/git";
import { neverQuoted } from "#server/http/handlers/code-files/operations/quoted-file.ts";

type CodeFiles = z.infer<ReturnType<typeof codeFilesSchema>>;

/**
 * The most a listing reads from Git: the names of a checkout with hundreds of thousands of files.
 * Git's ordinary limit of 64 KiB holds only about a thousand names.
 */
const MAX_LISTING_BYTES = 64 * 1024 * 1024;

/** The files of a checkout, or why this machine has none to list. */
type CheckoutFilesOutcome =
	| { readonly ok: true; readonly answer: CodeFiles }
	| { readonly ok: false; readonly code: "REPOSITORY_UNAVAILABLE"; readonly error: string };

/**
 * The files Git lists in a checkout, sorted.
 * @param vault The vault the reader belongs to: its own checkout holds its own repository (ADR 0049).
 * @param asked The repository identity, or undefined for the vault's own.
 * @param signal Ends the listing when the request is abandoned.
 * @returns The repository's files and the ones never quoted, or why there are none.
 */
async function listCheckoutFiles(
	vault: string,
	asked: string | undefined,
	signal: AbortSignal,
): Promise<CheckoutFilesOutcome> {
	const repo = asked ?? vaultIdentity(vault);
	if (repo === undefined) {
		return {
			ok: false,
			code: "REPOSITORY_UNAVAILABLE",
			error:
				"The vault is not inside a Git checkout, so it has no repository of its own. " +
				"Name a registered repository with repo=<identity>; archboard repo list shows them.",
		};
	}
	const checkout = resolveRegisteredCheckout(repo, await snapshotCheckoutAccess({ vault, signal }));
	if (!checkout.ok) return { ok: false, code: "REPOSITORY_UNAVAILABLE", error: checkout.error };
	const listed = await git(
		checkout.root,
		["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
		{ signal, trimOutput: false, maxOutputBytes: MAX_LISTING_BYTES },
	);
	const files = [...new Set((listed ?? "").split("\0").filter((file) => file !== ""))].toSorted();
	return {
		ok: true,
		answer: { repo, files, neverQuoted: files.filter((file) => neverQuoted(file)) },
	};
}

export { listCheckoutFiles };
