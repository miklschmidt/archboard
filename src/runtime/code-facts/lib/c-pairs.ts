// A C or C++ header and its source file (ADR 0046, TASK-367.09). A part is
// often bound to `ledger.c` while its interface is declared in `ledger.h`, so
// the bound code of a part bound to either file is both: the pair.
//
// The pair of a file is the file of the other role with the same name in the
// same directory (`ledger.h` beside `ledger.c`, `.hpp` beside `.cpp`). A
// header kept apart from its source, as `include/shop/ledger.h` for
// `src/ledger.c`, pairs only when it is the one file of its name and role in
// the checkout, because two candidates cannot be told apart without the
// build.

import path from "node:path";

/** The extensions of a C or C++ source file. */
const SOURCES: readonly string[] = [".c", ".cc", ".cpp", ".cxx"];
/** The extensions of a C or C++ header. */
const HEADERS: readonly string[] = [".h", ".hh", ".hpp", ".hxx"];

/** Each checkout's files by name without extension, for the files of the other role. */
const STEMS = new WeakMap<ReadonlySet<string>, Map<string, string[]>>();

/**
 * The files of a checkout by their name without extension.
 * @param files The checkout's files.
 * @returns Each name and the C and C++ files that have it.
 */
function stemsOf(files: ReadonlySet<string>): Map<string, string[]> {
	let stems = STEMS.get(files);
	if (stems === undefined) {
		stems = new Map();
		for (const file of files) {
			const extension = path.posix.extname(file);
			if (!SOURCES.includes(extension) && !HEADERS.includes(extension)) continue;
			const stem = path.posix.basename(file, extension);
			stems.set(stem, [...(stems.get(stem) ?? []), file]);
		}
		STEMS.set(files, stems);
	}
	return stems;
}

/**
 * The extensions of the other role: a source file's for a header, a header's
 * for a source file.
 * @param extension A file's extension.
 * @returns The extensions, or undefined for a file of another language.
 */
function otherRole(extension: string): readonly string[] | undefined {
	if (HEADERS.includes(extension)) return SOURCES;
	return SOURCES.includes(extension) ? HEADERS : undefined;
}

/**
 * The pair of a C or C++ file: the header of a source file, or the source
 * file of a header.
 * @param file The file, relative to its checkout.
 * @param files Every file of the checkout.
 * @returns The files of the other role beside it, else the one such file of
 * its name in the checkout, else none; none for a file of another language.
 */
function pairOf(file: string, files: ReadonlySet<string>): string[] {
	const extension = path.posix.extname(file);
	const other = otherRole(extension);
	if (other === undefined) return [];
	const directory = path.posix.dirname(file);
	const stem = path.posix.basename(file, extension);
	const beside = other
		.map((each) => path.posix.join(directory, `${stem}${each}`))
		.filter((each) => files.has(each));
	if (beside.length > 0) return beside;
	const elsewhere = (stemsOf(files).get(stem) ?? []).filter((each) =>
		other.includes(path.posix.extname(each)),
	);
	return elsewhere.length === 1 ? elsewhere : [];
}

export { HEADERS, SOURCES, pairOf };
