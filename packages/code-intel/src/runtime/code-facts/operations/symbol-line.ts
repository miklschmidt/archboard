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
import { listReadableFiles } from "#runtime/code-facts/operations/readable-files.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import {
	isTerraformFile,
	parseTerraformAddress,
} from "#runtime/code-facts/terraform/operations/terraform-address.ts";
import {
	terraformConfiguration,
	terraformRootOf,
} from "#runtime/code-facts/terraform/operations/terraform-configuration.ts";

/** Directories never walked when collecting Terraform files outside a Git checkout. */
const SKIP_DIRS = new Set([".git", ".terraform", "node_modules", "dist", "target"]);

/** One cache for the opener: a file is parsed again only when its bytes change. */
const codeFacts = createCodeFacts();

/** A resolved checkout-contained file, relative path, and 1-based line for "open the code". */
interface SymbolLocation {
	readonly target: string;
	readonly relativePath: string;
	readonly line: number;
}

/**
 * Whether a relative path stays strictly inside its base directory.
 * @param rel Relative path computed from `canonicalRoot`.
 * @returns True when non-empty and not escaping upward.
 */
function isInsideRoot(rel: string): boolean {
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * The canonical path of a checkout-relative regular file if it stays strictly
 * inside `canonicalRoot` after resolving symbolic links.
 * @param canonicalRoot The checkout's realpath.
 * @param relative The file path, relative to the checkout.
 * @returns The realpath inside the checkout, or undefined when outside, missing, or not a file.
 */
function containedRealPath(canonicalRoot: string, relative: string): string | undefined {
	try {
		const real = fs.realpathSync.native(path.join(canonicalRoot, relative));
		const rel = path.relative(canonicalRoot, real);
		return isInsideRoot(rel) && fs.statSync(real).isFile() ? real : undefined;
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
 * Filter checkout-relative paths to readable, checkout-contained Terraform files.
 * @param canonicalRoot The checkout's realpath.
 * @param listed Candidate relative POSIX paths.
 * @returns Readable Terraform files inside `canonicalRoot`.
 */
function filterTerraformFiles(canonicalRoot: string, listed: Iterable<string>): Set<string> {
	const files = new Set<string>();
	for (const relative of listed) {
		if (!isTerraformFile(relative) || neverRead(relative)) continue;
		if (containedRealPath(canonicalRoot, relative) !== undefined) files.add(relative);
	}
	return files;
}

/**
 * List the checkout's Git-readable files, returning undefined only for a non-Git
 * directory (failing closed with an empty set when `.git` exists but Git fails).
 * @param canonicalRoot The checkout's realpath.
 * @param signal Cancels listing when the request is abandoned.
 * @returns The Git allowlist, or undefined when the directory is not a Git checkout.
 */
async function gitAllowlist(
	canonicalRoot: string,
	signal: AbortSignal,
): Promise<ReadonlySet<string> | undefined> {
	try {
		return await listReadableFiles(canonicalRoot, signal);
	} catch {
		signal.throwIfAborted();
		return fs.existsSync(path.join(canonicalRoot, ".git")) ? new Set() : undefined;
	}
}

/**
 * Normalized POSIX relative path without leading `./` or trailing `/`.
 * @param relative The raw relative path.
 * @returns The normalized path, or `""` for root.
 */
function normalizedPosix(relative: string): string {
	const posix = path.posix.normalize(relative.replaceAll("\\", "/")).replace(/\/+$/u, "");
	return posix === "." ? "" : posix;
}

/**
 * Whether both the lexical and resolved paths are allowed by Git (or outside Git).
 * @param listed The Git allowlist, or undefined outside a Git checkout.
 * @param lexical The normalized lexical binding path.
 * @param relative The normalized realpath relative to the checkout.
 * @returns True when permitted.
 */
function inGitAllowlist(
	listed: ReadonlySet<string> | undefined,
	lexical: string,
	relative: string,
): boolean {
	return listed === undefined || (listed.has(relative) && listed.has(lexical));
}

/**
 * Whether a resolved local file target is readable under `neverRead`, checkout
 * realpath containment, and (inside a Git checkout) Git's allowlist for both
 * its lexical binding path and its resolved realpath.
 * @param canonicalRoot The checkout's realpath.
 * @param target The resolved local target.
 * @param listed The Git allowlist, or undefined outside a Git checkout.
 * @returns The checkout-relative POSIX realpath if allowed, or undefined.
 */
function readableFilePath(
	canonicalRoot: string,
	target: LocalCodeTarget,
	listed: ReadonlySet<string> | undefined,
): string | undefined {
	const lexical = normalizedPosix(target.path);
	const relative = normalizedPosix(path.relative(target.root, target.target));
	if (neverRead(lexical) || neverRead(relative)) return undefined;
	if (!inGitAllowlist(listed, lexical, relative)) return undefined;
	return containedRealPath(canonicalRoot, relative) === undefined ? undefined : relative;
}

/**
 * Collect readable Terraform files from the Git allowlist or a non-Git walk.
 * @param canonicalRoot The checkout's realpath.
 * @param listed The Git allowlist, or undefined outside a Git checkout.
 * @param signal Cancels walking when the request is abandoned.
 * @returns Readable Terraform files relative to `canonicalRoot`.
 */
function terraformFilesIn(
	canonicalRoot: string,
	listed: ReadonlySet<string> | undefined,
	signal: AbortSignal,
): Set<string> {
	if (listed !== undefined) return filterTerraformFiles(canonicalRoot, listed);
	const files = new Set<string>();
	walkTerraformFiles(canonicalRoot, "", files, signal);
	return files;
}

/**
 * Resolve a found Terraform configuration declaration into a checkout-contained location.
 * @param canonicalRoot The checkout's realpath.
 * @param declared The configuration lookup result.
 * @returns The location, or undefined when not found or outside the checkout.
 */
function declaredSiteLocation(
	canonicalRoot: string,
	declared: ReturnType<Awaited<ReturnType<typeof terraformConfiguration>>["declared"]>,
): SymbolLocation | undefined {
	if (declared.status !== "found" || declared.site === undefined) return undefined;
	const resolved = containedRealPath(canonicalRoot, declared.site.path);
	if (resolved === undefined) return undefined;
	return {
		target: resolved,
		relativePath: declared.site.path,
		line: declared.site.definition.start,
	};
}

/**
 * Resolve a Terraform or OpenTofu binding symbol through its root module's
 * address space (including local module calls and depth-1 named nested blocks).
 * @param symbol The binding's Terraform address symbol.
 * @param target Where the binding resolved on this machine.
 * @param canonicalRoot The checkout's realpath.
 * @param listed The Git allowlist, or undefined outside a Git checkout.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The checkout-contained file, relative path, and 1-based line, or undefined.
 */
async function terraformSymbolLocation(
	symbol: string,
	target: LocalCodeTarget,
	canonicalRoot: string,
	listed: ReadonlySet<string> | undefined,
	signal: AbortSignal,
): Promise<SymbolLocation | undefined> {
	const relative = normalizedPosix(path.relative(target.root, target.target));
	if (target.kind === "file" && !isTerraformFile(relative)) return undefined;
	if (parseTerraformAddress(symbol) === undefined) return undefined;
	const files = terraformFilesIn(canonicalRoot, listed, signal);
	const root = terraformRootOf(relative, target.kind, files);
	if (root === undefined) return undefined;
	const configuration = await terraformConfiguration(
		codeFacts.pass(signal),
		{ root: canonicalRoot, files },
		root,
	);
	return declaredSiteLocation(canonicalRoot, configuration.declared(symbol));
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
	const file = normalizedPosix(path.relative(target.root, target.target));
	try {
		return await codeFacts.pass(signal).read({ root: target.root, files: new Set([file]) }, file);
	} catch (error) {
		if (signal.aborted) throw error;
		return undefined;
	}
}

/**
 * Resolve a single-file symbol definition to its file path, relative path, and line.
 * @param symbol The bound symbol.
 * @param target The resolved local file target.
 * @param relativePath The verified checkout-relative POSIX path.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The file, relative path, and line, or undefined when absent.
 */
async function singleFileSymbolLocation(
	symbol: string,
	target: LocalCodeTarget,
	relativePath: string,
	signal: AbortSignal,
): Promise<SymbolLocation | undefined> {
	const facts = await factsOfFile(target, signal);
	const found = facts && findSymbol(facts, symbol, "definition");
	if (found?.status !== "found" || found.line === undefined) return undefined;
	return { target: target.target, relativePath, line: found.line };
}

/**
 * Resolve a symbol within a verified checkout, checking Git allowlist membership
 * for file targets before either Terraform lookup or single-file parsing.
 * @param symbol The bound symbol.
 * @param target Where the binding resolved on this machine.
 * @param canonicalRoot The checkout's realpath.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The location, or undefined when ignored, unreadable, or absent.
 */
async function locationInCheckout(
	symbol: string,
	target: LocalCodeTarget,
	canonicalRoot: string,
	signal: AbortSignal,
): Promise<SymbolLocation | undefined> {
	const listed = await gitAllowlist(canonicalRoot, signal);
	const allowedFile =
		target.kind === "file" ? readableFilePath(canonicalRoot, target, listed) : undefined;
	if (target.kind === "file" && allowedFile === undefined) return undefined;
	const terraform = await terraformSymbolLocation(symbol, target, canonicalRoot, listed, signal);
	if (terraform !== undefined) return terraform;
	return allowedFile === undefined
		? undefined
		: singleFileSymbolLocation(symbol, target, allowedFile, signal);
}

/**
 * The checkout-contained file and 1-based line where a binding's symbol is
 * defined, resolving Terraform root-module and local-module addresses as well
 * as single-file symbols while respecting Git's ignore rules and `neverRead`.
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
	const canonicalRoot = canonicalCheckoutRoot(target.root);
	return canonicalRoot === undefined
		? undefined
		: locationInCheckout(binding.symbol, target, canonicalRoot, signal);
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
