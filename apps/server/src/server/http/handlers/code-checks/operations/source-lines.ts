// The source excerpt of one piece of code evidence: the lines of a file around
// the place that a remembered finding names (TASK-590.06).
//
// A finding quotes a symbol, a path and a line, and never other text of a file,
// because a file can hold a secret and the Archboard server answers any request
// from this machine (ADR 0046). This reading is the one exception, which the
// owner asked for, and the amendment of 2026-11-07 to ADR 0046 records its
// limits:
//
// - It answers only a place that a piece of evidence of the vault's remembered
//   findings names, so it reads only a file that a code pass of that vault read.
// - It resolves the place as the code check and the code opener do
//   (`@archboard/code-binding/resolution`): in a registered checkout, inside
//   the checkout before and after symbolic links resolve, and only a file.
// - It reads only a file that Git does not ignore, judged where its links lead.
// - It never quotes a file whose text the code check never reads: Terraform
//   state, variable files and the `.terraform` directory, an env file, whose
//   values the check never reads, and a file that holds a Kubernetes Secret,
//   whose data the check never reads.
// - It reads no file larger than 1 MiB, and cuts each line after 240 characters.
//
// It reads the file as the checkout holds it now, which can differ from the
// code that the pass read.

import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import type { CodeSourceLinesSchema, RememberedFindings } from "@archboard/code-intel/code-check";
import {
	resolveLocalCodeTarget,
	snapshotCheckoutAccess,
	type LocalCodeTarget,
} from "@archboard/code-binding/resolution";
import { git, GitCommandError } from "@archboard/process/git";
import { errorMessage } from "@archboard/diagnostics/errno";

/** The source excerpt of one piece of evidence. */
type CodeSourceLines = z.infer<typeof CodeSourceLinesSchema>;

/** A place in code, as a piece of evidence names it. */
type SourcePlace = Pick<CodeSourceLines, "repo" | "path" | "line">;

/** Why there is no source excerpt for a place. */
type SourceLinesRefusal = {
	readonly ok: false;
	/**
	 * `EVIDENCE_NOT_REMEMBERED`: no remembered finding names the place.
	 * `SOURCE_UNAVAILABLE`: its file or line can no longer be read here.
	 * `SOURCE_REFUSED`: its file is one that this reading never quotes.
	 */
	readonly code: "EVIDENCE_NOT_REMEMBERED" | "SOURCE_UNAVAILABLE" | "SOURCE_REFUSED";
	readonly error: string;
};

/** The source excerpt of a place, or why there is none. */
type SourceLinesOutcome =
	| { readonly ok: true; readonly answer: CodeSourceLines }
	| SourceLinesRefusal;

/** How many lines the excerpt shows on each side of the evidence line. */
const CONTEXT_LINES = 3;
/** The largest file the reading reads. */
const MAX_FILE_BYTES = 1024 * 1024;
/** The characters of a line the excerpt shows; a longer line is cut and ends with `…`. */
const MAX_LINE_CHARACTERS = 240;

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

/** One line terminator: CRLF, LF or CR. */
const LINE_END = /\r\n|\n|\r/u;

/**
 * Builds a refusal.
 * @param code Why there is no excerpt.
 * @param error What happened, and what the caller can do next.
 * @returns The refusal.
 */
function refusal(code: SourceLinesRefusal["code"], error: string): SourceLinesRefusal {
	return { ok: false, code, error };
}

/**
 * Whether a piece of evidence of the remembered findings names a place.
 * @param findings What the server remembers of the vault's code passes.
 * @param place The place.
 * @returns True when one names its repository, path and line.
 */
function namesEvidence(findings: RememberedFindings, place: SourcePlace): boolean {
	return [...findings.readings, ...(findings.models ?? [])]
		.flatMap((reading) => reading.findings)
		.flatMap((finding) => finding.evidence ?? [])
		.some(
			(evidence) =>
				evidence.repo === place.repo &&
				evidence.path === place.path &&
				evidence.line === place.line,
		);
}

/**
 * Whether the reading never quotes a file, by any of its paths.
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
 * The text of a file, read through a descriptor that does not follow a link.
 * @param file The canonical file.
 * @returns The text, or undefined for a file larger than the limit.
 */
async function readText(file: string): Promise<string | undefined> {
	const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		if (bytesRead > MAX_FILE_BYTES) return undefined;
		return new TextDecoder().decode(buffer.subarray(0, bytesRead));
	} finally {
		await handle.close();
	}
}

/**
 * A line as the excerpt shows it.
 * @param text The line.
 * @returns It, or its first characters and `…` when it is longer than the limit.
 */
function shown(text: string): string {
	const characters = Array.from(text);
	return characters.length > MAX_LINE_CHARACTERS
		? `${characters.slice(0, MAX_LINE_CHARACTERS).join("")}…`
		: text;
}

/**
 * The lines around one line of a text.
 * @param text The text.
 * @param line The line, from 1.
 * @returns The number of the first line and the lines, or undefined when the text is shorter.
 */
function windowOf(text: string, line: number): { first: number; lines: string[] } | undefined {
	const all = text.split(LINE_END);
	// A terminator ends the last line and starts no other.
	if (all.at(-1) === "") all.pop();
	if (line > all.length) return undefined;
	const first = Math.max(1, line - CONTEXT_LINES);
	const last = Math.min(all.length, line + CONTEXT_LINES);
	return { first, lines: all.slice(first - 1, last).map(shown) };
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
	place: SourcePlace,
	signal: AbortSignal,
): Promise<LocalCodeTarget | SourceLinesRefusal> {
	const binding = { repo: place.repo, path: place.path };
	const target = resolveLocalCodeTarget(
		binding,
		await snapshotCheckoutAccess({ vault, signal, bindings: [binding] }),
	);
	if (!target.ok) {
		return refusal(
			target.code === "TARGET_OUTSIDE_CHECKOUT" ? "SOURCE_REFUSED" : "SOURCE_UNAVAILABLE",
			target.error,
		);
	}
	return target.kind === "file"
		? target
		: refusal("SOURCE_UNAVAILABLE", `${place.path} is no longer a file.`);
}

/**
 * Why the reading never quotes a resolved file, judged by its path and where its links lead.
 * @param target The resolved file.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The refusal, or undefined when the file may be quoted.
 */
async function quotingRefusal(
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<SourceLinesRefusal | undefined> {
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
 * The text of a resolved file, when the reading quotes it.
 * @param target The resolved file.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The text, or why it is not quoted.
 */
async function quotedText(
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<string | SourceLinesRefusal> {
	let text: string | undefined;
	try {
		text = await readText(target.target);
	} catch (error) {
		signal.throwIfAborted();
		return refusal("SOURCE_UNAVAILABLE", `${target.path} cannot be read: ${errorMessage(error)}`);
	}
	if (text === undefined) {
		return refusal("SOURCE_REFUSED", `${target.path} is larger than ${MAX_FILE_BYTES} bytes.`);
	}
	return KUBERNETES_SECRET.test(text)
		? refusal("SOURCE_REFUSED", `${target.path} holds a Kubernetes Secret.`)
		: text;
}

/**
 * The source excerpt of a place, read from its file in the checkout.
 * @param vault The vault the findings belong to.
 * @param place The place.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The excerpt, or why there is none.
 */
async function excerptOf(
	vault: string,
	place: SourcePlace,
	signal: AbortSignal,
): Promise<SourceLinesOutcome> {
	const file = await resolvedFile(vault, place, signal);
	if (!file.ok) return file;
	const refused = await quotingRefusal(file, signal);
	if (refused !== undefined) return refused;
	const text = await quotedText(file, signal);
	if (typeof text !== "string") return text;
	const window = windowOf(text, place.line);
	return window === undefined
		? refusal(
				"SOURCE_UNAVAILABLE",
				`${place.path} no longer has a line ${place.line}. Run \`archboard check code\` again.`,
			)
		: { ok: true, answer: { ...place, ...window } };
}

/**
 * The source excerpt of a place that a piece of evidence names.
 * @param request What to read.
 * @param request.vault The vault the findings belong to.
 * @param request.place The repository, path and line of the evidence.
 * @param request.findings What the server remembers of the vault's code passes.
 * @param request.signal Ends the reading when the request is abandoned.
 * @returns The excerpt, or why there is none.
 */
async function readSourceLines(request: {
	readonly vault: string;
	readonly place: SourcePlace;
	readonly findings: RememberedFindings;
	readonly signal: AbortSignal;
}): Promise<SourceLinesOutcome> {
	const { vault, place, findings, signal } = request;
	if (!namesEvidence(findings, place)) {
		return refusal(
			"EVIDENCE_NOT_REMEMBERED",
			`No code finding that this server remembers for the vault names ` +
				`${place.repo} ${place.path}:${place.line}. Ask for a place that the evidence of a ` +
				"finding names, after `archboard check code`.",
		);
	}
	return excerptOf(vault, place, signal);
}

export { readSourceLines };
