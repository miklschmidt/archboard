// The registered checkouts one pass reads, and the files in each that it may
// read (ADR 0046).
//
// A repository this machine has not registered stays silent: its subjects get
// no finding and are listed as skipped. A registered checkout that is gone, is
// no longer a Git checkout or no longer identifies as its repository is said
// once, with no subject, because the reason holds for the whole checkout. Every
// path is resolved through the code opener's rules, so it stays inside its
// checkout before and after symbolic links resolve, and a file is read only
// where its links lead to a file Git lists in that checkout.

import fs from "node:fs";
import path from "node:path";
import {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	type CheckoutSnapshot,
	type LocalCodeTarget,
	type OtherRef,
} from "@/runtime/code-target/index";
import { listReadableFiles, neverRead } from "@/runtime/code-check/lib/readable-files";
import type { CodeBinding } from "@/shared/code-target/index";
import { errorMessage } from "@/shared/thrown-error/index";

/** A registered checkout the pass reads: its canonical root, and the files Git does not ignore. */
interface ReadCheckout {
	readonly status: "read";
	readonly root: string;
	readonly files: ReadonlySet<string>;
}

/** One repository as the pass finds it on this machine. */
type Checkout =
	| { readonly status: "unregistered" }
	| { readonly status: "unavailable"; readonly detail: string }
	| ReadCheckout;

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
 * A file is judged where its symbolic links lead, so a tracked link to an
 * ignored file is ignored.
 * @param target The resolved path.
 * @param files The files Git does not ignore in its checkout.
 * @returns The files to read, or why there are none.
 */
function readableOf(target: LocalCodeTarget, files: ReadonlySet<string>): Readable {
	const lexical = normalized(target.path);
	const real = normalized(path.relative(target.root, target.target));
	if (neverRead(lexical) || neverRead(real)) return { status: "never-read" };
	const listed =
		target.kind === "file"
			? [real].filter((file) => files.has(file))
			: [...files].filter((file) =>
					[lexical, real].some((dir) => dir === "" || file.startsWith(`${dir}/`)),
				);
	if (listed.length === 0) return { status: "ignored" };
	const readable = listed.filter((file) => !neverRead(file));
	return readable.length === 0 ? { status: "never-read" } : { status: "files", files: readable };
}

/** Reads files of checkouts as text, each at most once in a pass. */
interface TextFiles {
	/**
	 * The text of one file.
	 * @param checkout The checkout and the files Git lists in it.
	 * @param relative The file, relative to the checkout's root.
	 * @returns Its text, or undefined when the pass may not read it.
	 */
	read(checkout: ReadCheckout, relative: string): string | undefined;
}

/**
 * The text of one file, if the pass may read where its symbolic links lead: a
 * file Git lists in the same checkout, so never outside it, and never one the
 * pass never reads. This is the one place the pass reads the bytes of a file,
 * so a tracked link below a bound directory cannot reach an ignored file or
 * Terraform state either.
 * @param checkout The checkout and the files Git lists in it.
 * @param file The file's absolute path.
 * @returns Its text, or undefined.
 */
function readListed(checkout: ReadCheckout, file: string): string | undefined {
	try {
		const real = fs.realpathSync.native(file);
		const listed = normalized(path.relative(checkout.root, real));
		return checkout.files.has(listed) && !neverRead(listed)
			? fs.readFileSync(real, "utf8")
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * A reader of the files of one pass.
 * @returns The reader.
 */
function createTextFiles(): TextFiles {
	const read = new Map<string, string | undefined>();
	return {
		/**
		 * The text of one file, read once in a pass.
		 * @param checkout The checkout and the files Git lists in it.
		 * @param relative The file, relative to the checkout's root.
		 * @returns Its text, or undefined when the pass may not read it.
		 */
		read(checkout, relative) {
			const file = path.join(checkout.root, relative);
			if (!read.has(file)) read.set(file, readListed(checkout, file));
			return read.get(file);
		},
	};
}

export {
	type Checkout,
	type ReadCheckout,
	type Readable,
	type TextFiles,
	createTextFiles,
	otherRefOf,
	readCheckouts,
	readableOf,
};
