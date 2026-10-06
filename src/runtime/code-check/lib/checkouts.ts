// The registered checkouts one pass reads, and the files in each that it may
// read (ADR 0046).
//
// A repository this machine has not registered stays silent: its subjects get
// no finding and are listed as skipped. A registered checkout that is gone, is
// no longer a Git checkout or no longer identifies as its repository is said
// once, with no subject, because the reason holds for the whole checkout. Every
// path is resolved through the code opener's rules, so it stays inside its
// checkout before and after symbolic links resolve.

import fs from "node:fs";
import path from "node:path";
import {
	isPathWithin,
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	type CheckoutSnapshot,
	type LocalCodeTarget,
	type OtherRef,
} from "@/runtime/code-target/index";
import { listReadableFiles, neverRead } from "@/runtime/code-check/lib/readable-files";
import type { CodeBinding } from "@/shared/code-target/index";
import { errorMessage } from "@/shared/thrown-error/index";

/** One repository as the pass finds it on this machine. */
type Checkout =
	| { readonly status: "unregistered" }
	| { readonly status: "unavailable"; readonly detail: string }
	| { readonly status: "read"; readonly root: string; readonly files: ReadonlySet<string> };

/** What the pass may read of one bound or anchored path. */
type Readable =
	| { readonly status: "files"; readonly files: readonly string[] }
	| { readonly status: "ignored" }
	| { readonly status: "never-read" };

/**
 * Each repository the claims name, as this machine has it, with the files the
 * pass may read in each registered checkout.
 * @param repos The repositories.
 * @param snapshot The registered checkouts.
 * @param signal Cancels every listing.
 * @returns Each repository's checkout.
 */
async function readCheckouts(
	repos: Iterable<string>,
	snapshot: CheckoutSnapshot,
	signal: AbortSignal,
): Promise<Map<string, Checkout>> {
	const each = await Promise.all(
		[...new Set(repos)].map(async (repo): Promise<[string, Checkout]> => {
			if (snapshot.inspection(repo) === undefined) return [repo, { status: "unregistered" }];
			const checkout = resolveRegisteredCheckout(repo, snapshot);
			if (!checkout.ok) return [repo, { status: "unavailable", detail: checkout.error }];
			try {
				const files = await listReadableFiles(checkout.root, signal);
				return [repo, { status: "read", root: checkout.root, files }];
			} catch (error) {
				signal.throwIfAborted();
				return [repo, { status: "unavailable", detail: errorMessage(error) }];
			}
		}),
	);
	return new Map(each);
}

/**
 * The ref a binding is pinned to, when its checkout has another one out. The
 * ref rule does not depend on the path, so it is read at the checkout root,
 * which a snapshot always holds.
 * @param binding The binding.
 * @param snapshot The registered checkouts.
 * @returns The two refs, or undefined when the checkout has the pinned ref out or none is pinned.
 */
function otherRefOf(binding: CodeBinding, snapshot: CheckoutSnapshot): OtherRef | undefined {
	if (binding.branch === undefined && binding.commit === undefined) return undefined;
	const root = resolveLocalCodeTarget({ ...binding, path: "." }, snapshot);
	return root.ok ? root.otherRef : undefined;
}

/**
 * A repository-relative path with `/` between names and no `.` or trailing `/`.
 * @param relative The path.
 * @returns It normalized; the empty string is the whole checkout.
 */
function normalized(relative: string): string {
	const posix = path.posix.normalize(relative.replaceAll("\\", "/")).replace(/\/+$/u, "");
	return posix === "." ? "" : posix;
}

/**
 * What the pass may read of a resolved path: the file, or every file below the
 * directory, that Git does not ignore and that is not one the pass never reads.
 * @param target The resolved path.
 * @param files The files Git does not ignore in its checkout.
 * @returns The files to read, or why there are none.
 */
function readableOf(target: LocalCodeTarget, files: ReadonlySet<string>): Readable {
	const lexical = normalized(target.path);
	const real = normalized(path.relative(target.root, target.target));
	const spellings = [...new Set([lexical, real])];
	if (spellings.some(neverRead)) return { status: "never-read" };
	const listed =
		target.kind === "file"
			? spellings.filter((spelling) => files.has(spelling))
			: [...files].filter((file) =>
					spellings.some((dir) => dir === "" || file.startsWith(`${dir}/`)),
				);
	if (listed.length === 0) return { status: "ignored" };
	const readable = listed.filter((file) => !neverRead(file));
	return readable.length === 0 ? { status: "never-read" } : { status: "files", files: readable };
}

/** Reads files of checkouts as text, each at most once in a pass. */
interface TextFiles {
	/**
	 * The text of one file.
	 * @param root The checkout's root.
	 * @param relative The file, relative to the root.
	 * @returns Its text, or undefined when it is not a file inside the checkout.
	 */
	read(root: string, relative: string): string | undefined;
}

/**
 * A reader of the files of one pass. It follows a symbolic link only to a
 * file inside the same checkout.
 * @returns The reader.
 */
function createTextFiles(): TextFiles {
	const read = new Map<string, string | undefined>();
	return {
		/**
		 * The text of one file, read once in a pass.
		 * @param root The checkout's root.
		 * @param relative The file, relative to the root.
		 * @returns Its text, or undefined when it is not a file inside the checkout.
		 */
		read(root, relative) {
			const file = path.join(root, relative);
			if (!read.has(file)) {
				try {
					const real = fs.realpathSync.native(file);
					const inside = isPathWithin(root, real) && fs.statSync(real).isFile();
					read.set(file, inside ? fs.readFileSync(real, "utf8") : undefined);
				} catch {
					read.set(file, undefined);
				}
			}
			return read.get(file);
		},
	};
}

export {
	type Checkout,
	type Readable,
	type TextFiles,
	createTextFiles,
	otherRefOf,
	readCheckouts,
	readableOf,
};
