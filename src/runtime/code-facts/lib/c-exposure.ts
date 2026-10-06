// What a C, C++ or Objective-C module is (ADR 0044, ADR 0046, TASK-368.10,
// TASK-367.10): a directory, and its public headers, the root files its
// callers include or import.
//
// A module that holds a directory named `include` publishes its headers
// there: every header below it is public, as leveldb's `include/leveldb`. A
// module without one is a directory of the project, whose public headers are
// the headers directly in it whose source file, their pair (c-pairs.ts), is
// in the module too: `db/db_impl.h` beside `db/db_impl.cc`, `Ledger.h` beside
// `Ledger.m`. A header with no source file in the module, and a header in a
// subfolder, is the module's own. No file stands for such a module, so a
// container names one only when it is bound to a directory. An Objective-C++
// file (`.mm`) is read as text, so it is never counted as a caller.
//
// What a public header exposes is what it declares with external linkage or
// none: functions, `extern` variables, types, enumerators, macros and the
// public members of a class, and in Objective-C its classes, categories and
// protocols and their members, but nothing a class extension declares
// (objc-definitions.ts). A declaration is exposed where its code is, in the
// header's pair, which the header passes on (module-exposure.ts).

import path from "node:path";
import { HEADERS, SOURCES, pairOf } from "@/runtime/code-facts/lib/c-pairs";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import type { FactsPass } from "@/runtime/code-facts/lib/reader";

/**
 * Whether a file is C, C++ or Objective-C, a source file or a header.
 * @param file The file.
 * @returns True when it is.
 */
function isCFile(file: string): boolean {
	const extension = path.posix.extname(file);
	return SOURCES.includes(extension) || HEADERS.includes(extension);
}

/**
 * Whether a path lies below a directory.
 * @param directory The directory, relative to the checkout; empty for the checkout.
 * @param file The path.
 * @returns True when it does.
 */
function below(directory: string, file: string): boolean {
	return directory === "" || file.startsWith(`${directory}/`);
}

/**
 * The public headers of a C, C++ or Objective-C module.
 * @param _pass The pass, which the rule does not need.
 * @param checkout The checkout.
 * @param directory The module's directory.
 * @returns The headers below its `include` directory, else the headers
 * directly in it whose pair is in it; none for a directory with neither.
 */
function cRootFiles(
	_pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<string[]> {
	const headers = [...checkout.files]
		.filter((file) => HEADERS.includes(path.posix.extname(file)) && below(directory, file))
		.toSorted();
	const include = directory === "" ? "include" : `${directory}/include`;
	const published = headers.filter((file) => below(include, file));
	if (published.length > 0) return Promise.resolve(published);
	const own = directory === "" ? "." : directory;
	const paired = headers.filter(
		(file) =>
			path.posix.dirname(file) === own &&
			pairOf(file, checkout.files).some((pair) => below(directory, pair)),
	);
	return Promise.resolve(paired);
}

export { cRootFiles, isCFile };
