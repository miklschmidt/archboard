// What a Go module is (ADR 0044, ADR 0046, TASK-575): a package, the `.go`
// files directly in one directory. Each of its files but its tests is a root
// file, because a package exports its capitalized names from whichever file
// declares them. A package `main` is a program that no other package can
// import, so it exposes nothing. A file that `//go:build ignore` leaves out of
// every build, such as a generator, is no file of the package. A directory
// below the package's is another package, which can call it. No file stands for
// a Go package, as `index.ts` stands for its directory.

import { ignoredByBuild } from "#runtime/operations/code-facts/go/go-adapter.ts";
import type { ExposureRule } from "#runtime/operations/code-facts/modules/module-exposure.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";
import {
	directoryOf,
	GO_FILE,
	TEST_FILE,
} from "#runtime/operations/code-facts/go/go-resolution.ts";

/** The package clause of a program. */
const MAIN = /^\s*package\s+main\b/mu;

/**
 * The root files of a Go package: its files directly in the directory, but
 * its tests; none for a program.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param directory The package's directory.
 * @returns The files; none for a directory that holds no importable package.
 */
function goRootFiles(
	pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<string[]> {
	const files = [...checkout.files]
		.filter(
			(file) => GO_FILE.test(file) && !TEST_FILE.test(file) && directoryOf(file) === directory,
		)
		.toSorted();
	const built = files.filter((file) => !ignoredByBuild(pass.text(checkout, file) ?? ""));
	const program = built.some((file) => MAIN.test(pass.text(checkout, file) ?? ""));
	return Promise.resolve(program ? [] : built);
}

/**
 * Whether a file is the package's own: directly in its directory.
 * @param directory The package's directory.
 * @param file A Go file.
 * @returns True when it is.
 */
function goHolds(directory: string, file: string): boolean {
	return directoryOf(file) === directory;
}

/** Go's rule: a package, whose files export its capitalized names. */
const GO: ExposureRule = {
	/**
	 * Whether a file is Go.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => GO_FILE.test(file),
	/**
	 * No file stands for a Go package.
	 * @returns False.
	 */
	entry: () => false,
	rootFiles: goRootFiles,
	holds: goHolds,
};

export { GO };
