// The text of one file of a registered checkout, behind every guard that lets a route quote it
// (ADR 0046, "Where the pass runs", and ADR 0080). `GET /api/code/file` quotes through it, and
// is the only route that quotes text, so there is one copy of each guard:
//
// - It resolves the place as the code check and the code opener do
//   (`@archboard/code-binding/resolution`): in a registered checkout, inside the checkout
//   before and after symbolic links resolve, and only a file.
// - It reads only a file that Git lists, judged where its links lead.
// - It never quotes a file whose text the code check never reads: Terraform state, variable
//   files and the `.terraform` directory, an env file, whose values the check never reads, and
//   a file that holds a Kubernetes Secret, whose data the check never reads.
// - It reads no file larger than 1 MiB, and none that is binary or not UTF-8.
// - It opens the file with `O_NOFOLLOW`, so a link swapped in after the check is not followed.
//
// It reads the file as the checkout holds it now, which can differ from the code that a pass read.

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import {
	resolveLocalCodeTarget,
	snapshotCheckoutAccess,
	type LocalCodeTarget,
} from "@archboard/code-binding/resolution";
import { git, GitCommandError } from "@archboard/process/git";
import { errorMessage } from "@archboard/diagnostics/errno";

/** A file in a repository: the place of a quote. */
interface QuotedPlace {
	readonly repo: string;
	/** Relative to the repository, with `/` between names. */
	readonly path: string;
}

/** Why a file is not quoted. */
interface QuoteRefusal {
	readonly ok: false;
	/**
	 * `REPOSITORY_UNAVAILABLE`: this machine has no usable checkout of the repository.
	 * `SOURCE_UNAVAILABLE`: the file cannot be read here now.
	 * `SOURCE_REFUSED`: the file is one that is never quoted.
	 */
	readonly code: "REPOSITORY_UNAVAILABLE" | "SOURCE_UNAVAILABLE" | "SOURCE_REFUSED";
	readonly error: string;
}

/** A file's text, and where its checkout is. */
type Quoted = { readonly ok: true; readonly text: string; readonly root: string } | QuoteRefusal;

/** The largest file the guards let through. */
const MAX_FILE_BYTES = 1024 * 1024;

/**
 * Paths never quoted: the files that code facts never read (`neverRead` of
 * `@archboard/code-intel`), which are Terraform state with its backups and
 * workspaces, variable files and the `.terraform` directory; and env files,
 * `.env`, `.env.<name>`, `.envrc` and `<name>.env`, whose values the check never reads.
 */
const NEVER_QUOTED = [
	/(^|\/)\.terraform(\/|$)/u,
	/\.tfstate(\.|\/|$)/u,
	/\.tfvars(\.json)?$/u,
	/(^|\/)\.env[^/]*$/u,
	/\.env$/u,
];

/** A Kubernetes Secret, in a YAML or a JSON manifest. */
const KUBERNETES_SECRET = /\bkind["']?\s*:\s*["']?Secret\b/u;

/**
 * Nested manifests in a YAML stream or a Kubernetes List.
 * @param value A parsed object or array.
 * @returns Its manifests, if any.
 */
function manifestChildren(value: object): readonly unknown[] {
	if (Array.isArray(value)) return value;
	return "items" in value && Array.isArray(value.items) ? value.items : [];
}

/**
 * Whether a parsed object is a Secret or a nonempty SecretList.
 * @param value A parsed object.
 * @returns True when the object holds a Secret.
 */
function isSecretManifest(value: object): boolean {
	return (
		"kind" in value &&
		(value.kind === "Secret" || (value.kind === "SecretList" && manifestChildren(value).length > 0))
	);
}

/**
 * Whether parsed manifest documents or list items contain a Secret.
 * @param parsed The YAML or JSON value.
 * @returns True when a manifest declares a Secret.
 */
function hasSecret(parsed: unknown): boolean {
	const pending = [parsed];
	const seen = new Set<object>();
	while (pending.length > 0) {
		const value = pending.pop();
		if (typeof value !== "object" || value === null || seen.has(value)) continue;
		seen.add(value);
		if (isSecretManifest(value)) return true;
		manifestChildren(value).forEach((item) => pending.push(item));
	}
	return false;
}

/**
 * Detect a Secret written directly or through YAML or JSON syntax.
 * @param text The text of the file.
 * @returns True if quoting the file would expose a Secret manifest.
 */
function holdsSecret(text: string): boolean {
	if (KUBERNETES_SECRET.test(text)) return true;
	if (!/\bkind\b|\\[uUx]/u.test(text)) return false;
	try {
		return hasSecret(Bun.YAML.parse(text));
	} catch {
		return false;
	}
}

/**
 * Builds a refusal.
 * @param code Why the file is not quoted.
 * @param error What happened, and what the caller can do next.
 * @returns The refusal.
 */
function refusal(code: QuoteRefusal["code"], error: string): QuoteRefusal {
	return { ok: false, code, error };
}

/**
 * Whether a file is one that is never quoted, by any of its paths.
 * @param paths Its paths, relative to its checkout, with `/` between names.
 * @returns True for Terraform state, a variable file, the `.terraform` directory or an env file.
 */
function neverQuoted(...paths: readonly string[]): boolean {
	return paths.some((relative) => NEVER_QUOTED.some((pattern) => pattern.test(relative)));
}

/**
 * Whether Git lists a file of a checkout: tracked, or new and not ignored, as
 * the code check reads it.
 * @param root The checkout's root.
 * @param relative The file, relative to the root, with `/` between names.
 * @param signal Ends the listing when the request is abandoned.
 * @returns True when Git lists exactly that file.
 */
async function gitLists(root: string, relative: string, signal: AbortSignal): Promise<boolean> {
	const listed = await git(
		root,
		["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", `:(literal)${relative}`],
		{ signal, trimOutput: false },
	);
	return (listed ?? "").split("\0").includes(relative);
}

/**
 * The bytes of a file, read through a descriptor that does not follow a link.
 * @param file The canonical file.
 * @returns The bytes, or undefined for a file larger than the limit.
 */
async function readBytes(file: string): Promise<Uint8Array | undefined> {
	const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return bytesRead > MAX_FILE_BYTES ? undefined : buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

/**
 * The text of bytes, when they are text: UTF-8 with no NUL byte.
 * @param bytes The bytes.
 * @returns The text, or undefined for a binary file or one that is not UTF-8.
 */
function textOf(bytes: Uint8Array): string | undefined {
	if (bytes.includes(0)) return undefined;
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch (error) {
		if (error instanceof TypeError) return undefined;
		throw error;
	}
}

/**
 * The file of a place in its checkout.
 * @param vault The vault, whose own checkout holds its own repository (ADR 0049).
 * @param place The place.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The resolved file, or why the place leads to none.
 */
async function resolvedFile(
	vault: string,
	place: QuotedPlace,
	signal: AbortSignal,
): Promise<LocalCodeTarget | QuoteRefusal> {
	const binding = { repo: place.repo, path: place.path };
	const target = resolveLocalCodeTarget(
		binding,
		await snapshotCheckoutAccess({ vault, signal, bindings: [binding] }),
	);
	if (!target.ok) {
		const code =
			target.code === "TARGET_OUTSIDE_CHECKOUT"
				? "SOURCE_REFUSED"
				: target.code === "CHECKOUT_UNAVAILABLE"
					? "REPOSITORY_UNAVAILABLE"
					: "SOURCE_UNAVAILABLE";
		return refusal(code, target.error);
	}
	return target.kind === "file"
		? target
		: refusal("SOURCE_UNAVAILABLE", `${place.path} is no longer a file.`);
}

/**
 * Why a resolved file is never quoted, judged by its path and where its links lead.
 * @param target The resolved file.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The refusal, or undefined when the file may be quoted.
 */
async function quotingRefusal(
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<QuoteRefusal | undefined> {
	const real = path.relative(target.root, target.target).split(path.sep).join("/");
	if (neverQuoted(target.path, real)) {
		return refusal("SOURCE_REFUSED", `${target.path} is a file that is never quoted.`);
	}
	try {
		return (await gitLists(target.root, real, signal))
			? undefined
			: refusal("SOURCE_REFUSED", `Git ignores ${real}, so it is never quoted.`);
	} catch (error) {
		if (signal.aborted || !(error instanceof GitCommandError)) throw error;
		return refusal("SOURCE_UNAVAILABLE", `Git cannot list ${real}: ${error.message}`);
	}
}

/**
 * The text of a resolved file, when the guards let it through.
 * @param target The resolved file.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The text, or why it is not quoted.
 */
async function quotedText(
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<string | QuoteRefusal> {
	let bytes: Uint8Array | undefined;
	try {
		bytes = await readBytes(target.target);
	} catch (error) {
		signal.throwIfAborted();
		return refusal("SOURCE_UNAVAILABLE", `${target.path} cannot be read: ${errorMessage(error)}`);
	}
	if (bytes === undefined) {
		return refusal("SOURCE_REFUSED", `${target.path} is larger than ${MAX_FILE_BYTES} bytes.`);
	}
	const text = textOf(bytes);
	if (text === undefined) {
		return refusal("SOURCE_REFUSED", `${target.path} is a binary file, or not UTF-8 text.`);
	}
	return holdsSecret(text)
		? refusal("SOURCE_REFUSED", `${target.path} holds a Kubernetes Secret.`)
		: text;
}

/**
 * The whole text of a file, read from its checkout.
 * @param vault The vault the reader belongs to.
 * @param place The repository and the path.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The text and the checkout's root, or why the file is not quoted.
 */
async function quoteFile(vault: string, place: QuotedPlace, signal: AbortSignal): Promise<Quoted> {
	const file = await resolvedFile(vault, place, signal);
	if (!file.ok) return file;
	const refused = await quotingRefusal(file, signal);
	if (refused !== undefined) return refused;
	const text = await quotedText(file, signal);
	return typeof text === "string" ? { ok: true, text, root: file.root } : text;
}

export { type QuotedPlace, type Quoted, type QuoteRefusal, neverQuoted, quoteFile };
