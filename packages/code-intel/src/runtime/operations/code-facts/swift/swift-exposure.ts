// What a Swift module is (ADR 0044, ADR 0046, TASK-368.10): a target of a
// package, the Swift files below the directory `Package.swift` gives the
// target (swift-resolution.ts). Each of those files is a root file, because a
// module exposes its `open`, `public` and `package` declarations from
// whichever file declares them, an extension's members from the extension's
// file. A directory that is no target, such as `Sources` or a folder inside a
// target, is no Swift module. No file stands for a Swift module, as `index.ts`
// stands for its directory.
//
// The manifest's targets are read from its syntax tree, as the resolver reads
// them. The pass gives a file's facts after the resolver has read them, and
// those no longer carry the package, so the manifest is parsed again here: one
// small file for each module a board binds.

import path from "node:path";
import { adapterOf } from "#runtime/operations/code-facts/adapters.ts";
import type { ParsedFacts } from "#runtime/operations/code-facts/facts.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";
import { moduleDirectories } from "#runtime/operations/code-facts/swift/swift-resolution.ts";

/** A Swift file. */
const SWIFT_FILE = /\.swift$/u;

/** The file that declares a package, which is no source of its targets. */
const MANIFEST = "Package.swift";

/**
 * The facts of a manifest with its package, where the pass may read the file.
 * @param pass The pass, which says whether the file may be read.
 * @param checkout The checkout.
 * @param manifest The manifest, relative to the checkout.
 * @returns The facts, or undefined.
 */
async function manifestFacts(
	pass: FactsPass,
	checkout: CheckoutFiles,
	manifest: string,
): Promise<ParsedFacts | undefined> {
	const listed = await pass.read(checkout, manifest);
	const reading = adapterOf(manifest);
	if (listed === undefined || listed.adapter === "text" || reading === undefined) return undefined;
	const text = pass.text(checkout, listed.path);
	return text === undefined ? undefined : reading.parse(text);
}

/**
 * The root files of a Swift module: every Swift file of a target's directory.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param directory The directory.
 * @returns The files; none for a directory that is no target of a package.
 */
async function swiftRootFiles(
	pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<string[]> {
	const targets = await moduleDirectories(checkout.files, directory, (manifest) =>
		manifestFacts(pass, checkout, manifest),
	);
	if (!targets.includes(directory)) return [];
	return [...checkout.files]
		.filter(
			(file) =>
				SWIFT_FILE.test(file) &&
				path.posix.basename(file) !== MANIFEST &&
				(directory === "" || file.startsWith(`${directory}/`)),
		)
		.toSorted();
}

export { SWIFT_FILE, swiftRootFiles };
