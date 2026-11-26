// The file and line where a binding's symbol is defined, for "open the code" (ADR 0046).
//
// For a regular file binding, the opener reads that one bound file and jumps to
// the symbol's first line. For a Terraform or OpenTofu binding naming a root
// module directory or `.tf`/`.tofu` file—including module-qualified addresses
// and depth-1 named nested blocks inside local modules—the opener resolves the
// address through `terraformConfiguration` to the checkout-contained module
// file and line that defines it.

import fs from "node:fs";
import path from "node:path";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { LocalCodeTarget } from "@archboard/code-binding/resolution";
import type { FileFacts } from "#runtime/code-facts/operations/facts.ts";
import { findSymbol } from "#runtime/code-facts/operations/lookup.ts";
import { neverRead } from "#runtime/code-facts/operations/never-read.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import {
	isTerraformFile,
	parseTerraformAddress,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import {
	terraformConfiguration,
	terraformRootOf,
} from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";

/** Directories never walked when collecting Terraform files for "open the code". */
const SKIP_DIRS = new Set([".git", ".terraform", "node_modules", "dist", "target"]);

/** One cache for the opener: a file is parsed again only when its bytes change. */
const codeFacts = createCodeFacts();

/** A resolved checkout-contained file and 1-based line for "open the code". */
interface SymbolLocation {
	readonly target: string;
	readonly line: number;
}

/**
 * The canonical path of a checkout-relative file if it stays strictly inside
 * `canonicalRoot` after resolving symbolic links.
 * @param canonicalRoot The checkout's realpath.
 * @param relative The file path, relative to the checkout.
 * @returns The realpath inside the checkout, or undefined when outside or missing.
 */
function containedRealPath(canonicalRoot: string, relative: string): string | undefined {
	try {
		const real = fs.realpathSync.native(path.join(canonicalRoot, relative));
		const rel = path.relative(canonicalRoot, real);
		return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) ? real : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read directory entries safely, returning empty on unreadable paths.
 * @param directory Absolute directory path.
 * @returns Directory entries.
 */
function readEntries(directory: string): fs.Dirent[] {
	try {
		return fs.readdirSync(directory, { withFileTypes: true });
	} catch {
		return [];
	}
}

/**
 * Record one directory entry during the Terraform file walk.
 * @param canonicalRoot The checkout's realpath.
 * @param relative Entry path relative to `canonicalRoot`.
 * @param entry The directory entry.
 * @param found Collected relative POSIX paths.
 * @param signal Cancels the walk when the request is abandoned.
 */
function visitTerraformEntry(
	canonicalRoot: string,
	relative: string,
	entry: fs.Dirent,
	found: Set<string>,
	signal: AbortSignal,
): void {
	if (neverRead(relative)) return;
	if (entry.isDirectory()) {
		walkTerraformFiles(canonicalRoot, relative, found, signal);
		return;
	}
	if (isTerraformFile(relative) && containedRealPath(canonicalRoot, relative) !== undefined) {
		found.add(relative);
	}
}

/**
 * Recursively collect checkout-contained `.tf` and `.tofu` files inside one directory.
 * @param canonicalRoot The checkout's realpath.
 * @param dir Current directory relative to `canonicalRoot` (`""` for root).
 * @param found Collected relative POSIX paths.
 * @param signal Cancels the walk when the request is abandoned.
 */
function walkTerraformFiles(
	canonicalRoot: string,
	dir: string,
	found: Set<string>,
	signal: AbortSignal,
): void {
	signal.throwIfAborted();
	for (const entry of readEntries(path.join(canonicalRoot, dir))) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const relative = dir === "" ? entry.name : `${dir}/${entry.name}`;
		visitTerraformEntry(canonicalRoot, relative, entry, found, signal);
	}
}

/**
 * Resolve the checkout root realpath, returning undefined when inaccessible.
 * @param root The checkout root path.
 * @returns The canonical realpath, or undefined.
 */
function canonicalCheckoutRoot(root: string): string | undefined {
	try {
		return fs.realpathSync.native(root);
	} catch {
		return undefined;
	}
}

/**
 * Collect checkout-contained Terraform files and determine the root module directory.
 * @param canonicalRoot The checkout's realpath.
 * @param relative The binding's relative path inside the checkout.
 * @param kind Whether the binding names a file or directory.
 * @param signal Cancels the walk when the request is abandoned.
 * @returns The files and root directory, or undefined when not a Terraform root.
 */
function terraformRootFiles(
	canonicalRoot: string,
	relative: string,
	kind: LocalCodeTarget["kind"],
	signal: AbortSignal,
): { readonly files: Set<string>; readonly root: string } | undefined {
	const files = new Set<string>();
	walkTerraformFiles(canonicalRoot, "", files, signal);
	const root = terraformRootOf(relative === "." ? "" : relative, kind, files);
	return root === undefined ? undefined : { files, root };
}

/**
 * Prepare a checkout-contained Terraform lookup scope for one binding target.
 * @param symbol The binding's Terraform address symbol.
 * @param target Where the binding resolved on this machine.
 * @param signal Cancels the walk when the request is abandoned.
 * @returns The canonical root, files, and Terraform root directory, or undefined.
 */
function terraformLookupScope(symbol: string, target: LocalCodeTarget, signal: AbortSignal) {
	const relative = path.relative(target.root, target.target).split(path.sep).join("/");
	if (target.kind === "file" && !isTerraformFile(relative)) return undefined;
	if (parseTerraformAddress(symbol) === undefined) return undefined;
	const canonicalRoot = canonicalCheckoutRoot(target.root);
	if (canonicalRoot === undefined) return undefined;
	const scope = terraformRootFiles(canonicalRoot, relative, target.kind, signal);
	return scope === undefined ? undefined : { canonicalRoot, ...scope };
}

/**
 * Resolve a Terraform or OpenTofu binding symbol through its root module's
 * address space (including local module calls and depth-1 named nested blocks).
 * @param symbol The binding's Terraform address symbol.
 * @param target Where the binding resolved on this machine.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The checkout-contained file and 1-based line, or undefined.
 */
async function terraformSymbolLocation(
	symbol: string,
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<SymbolLocation | undefined> {
	const scope = terraformLookupScope(symbol, target, signal);
	if (scope === undefined) return undefined;
	const configuration = await terraformConfiguration(
		codeFacts.pass(signal),
		{ root: scope.canonicalRoot, files: scope.files },
		scope.root,
	);
	const declared = configuration.declared(symbol);
	if (declared.status !== "found" || declared.site === undefined) return undefined;
	const resolved = containedRealPath(scope.canonicalRoot, declared.site.path);
	return resolved === undefined
		? undefined
		: { target: resolved, line: declared.site.definition.start };
}

/**
 * The code facts of the one file a target names, if they can be read.
 * @param target Where the binding resolved on this machine.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The facts, or undefined for a file that went away or cannot be read since it resolved.
 * @throws {unknown} The signal's reason, when it ends the reading.
 */
async function factsOfFile(
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<FileFacts | undefined> {
	const file = path.relative(target.root, target.target).split(path.sep).join("/");
	try {
		return await codeFacts.pass(signal).read({ root: target.root, files: new Set([file]) }, file);
	} catch (error) {
		if (signal.aborted) throw error;
		return undefined;
	}
}

/**
 * Resolve a single-file symbol definition to its file path and line.
 * @param symbol The bound symbol.
 * @param target The resolved local file target.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The file and line, or undefined when absent.
 */
async function singleFileSymbolLocation(
	symbol: string,
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<SymbolLocation | undefined> {
	const facts = await factsOfFile(target, signal);
	const found = facts && findSymbol(facts, symbol, "definition");
	return found?.status === "found" && found.line !== undefined
		? { target: target.target, line: found.line }
		: undefined;
}

/**
 * The checkout-contained file and 1-based line where a binding's symbol is
 * defined, resolving Terraform root-module and local-module addresses as well
 * as single-file symbols.
 * @param binding The binding, with the symbol to find.
 * @param target Where the binding resolved on this machine.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The file and line, or undefined when absent or unresolved.
 * @throws {unknown} The signal's reason, when it ends the reading.
 */
async function symbolLocation(
	binding: CodeBinding,
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<SymbolLocation | undefined> {
	if (binding.symbol === undefined) return undefined;
	const terraform = await terraformSymbolLocation(binding.symbol, target, signal);
	if (terraform !== undefined) return terraform;
	return target.kind === "file"
		? singleFileSymbolLocation(binding.symbol, target, signal)
		: undefined;
}

/**
 * The line where a binding's symbol is defined in the file or Terraform root it names.
 * @param binding The binding, with the symbol to find.
 * @param target Where the binding resolved on this machine.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The first line of the definition, or undefined when absent or unresolved.
 * @throws {unknown} The signal's reason, when it ends the reading.
 */
async function symbolLine(
	binding: CodeBinding,
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<number | undefined> {
	return (await symbolLocation(binding, target, signal))?.line;
}

export { type SymbolLocation, symbolLine, symbolLocation };
