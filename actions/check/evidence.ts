// What a finding rests on, in words and in excerpts. A finding of the code check names each piece
// of evidence by repository identity, path and line. This module finds the file on this machine
// and quotes the line with one line of context each side. Pure: the caller supplies the files.
/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */

import { isAbsolute, join, relative, sep } from "node:path";
import type { Evidence, Finding } from "./findings.ts";

/** Reads a file of this machine. It answers undefined for a file that is not there. */
interface SourceFiles {
	read(absolutePath: string): string | undefined;
}

/** Where the files of a run are. */
interface Locations {
	/** GITHUB_WORKSPACE. */
	readonly workspace: string;
	/**
	 * The root of the checkout of the repository that this run checks. GitHub puts an annotation
	 * on the diff by the file's path in that repository, so annotations name files relative to it.
	 */
	readonly repository: string;
	/** The checkout of each repository identity, by the registered checkouts of this machine. */
	readonly roots: ReadonlyMap<string, string>;
	/** The vault's directory, which a diagnostic may name its file against. */
	readonly vault?: string | undefined;
	/** The checkout that holds the vault, which an embed names its file against. */
	readonly home: string;
	readonly files: SourceFiles;
}

/** A few lines of a file, and the number of the first. */
interface Excerpt {
	readonly first: number;
	readonly lines: readonly string[];
	/** The line the excerpt is about. */
	readonly line: number;
}

/** One piece of evidence made readable. */
interface EvidenceDetail {
	readonly description: string;
	readonly line: number;
	/** The file relative to the checked repository, when it is a file of that repository. */
	readonly repositoryFile?: string | undefined;
	readonly excerpt?: Excerpt | undefined;
}

const CONTEXT_LINES = 1;
const MAX_LINE_LENGTH = 200;

/**
 * A path relative to the checked repository, with forward slashes.
 * @param repository The root of the checked repository.
 * @param absolute The absolute path.
 * @returns The path, or undefined when it lies outside the repository.
 */
function repositoryRelative(repository: string, absolute: string): string | undefined {
	const path = relative(repository, absolute);
	if (path === "" || path.startsWith("..") || isAbsolute(path)) return undefined;
	return path.split(sep).join("/");
}

/**
 * Quote a line of a file with its context.
 * @param text The file's text.
 * @param line The 1-based line.
 * @returns The excerpt, or undefined when the file has no such line.
 */
function excerptOf(text: string, line: number): Excerpt | undefined {
	const all = text.split(/\r?\n/u);
	if (line < 1 || line > all.length) return undefined;
	const first = Math.max(1, line - CONTEXT_LINES);
	const last = Math.min(all.length, line + CONTEXT_LINES);
	const lines = all
		.slice(first - 1, last)
		.map((one) => (one.length > MAX_LINE_LENGTH ? `${one.slice(0, MAX_LINE_LENGTH)}…` : one));
	return { first, lines, line };
}

/**
 * An excerpt as plain text: each line numbered, the evidence line marked with `>`.
 * @param excerpt The excerpt.
 * @returns The text, one line per source line.
 */
function excerptText(excerpt: Excerpt): string {
	const width = String(excerpt.first + excerpt.lines.length - 1).length;
	return excerpt.lines
		.map((one, index) => {
			const number = excerpt.first + index;
			return `${number === excerpt.line ? ">" : " "} ${String(number).padStart(width)} | ${one}`;
		})
		.join("\n");
}

/**
 * Describe each end of a finding.
 * @param finding The finding.
 * @param locations Where files are on this machine.
 * @returns One detail for each distinct piece of evidence, in the order the check gave them.
 */
function evidenceDetails(finding: Finding, locations: Locations): EvidenceDetail[] {
	const several = new Set(finding.evidence.map((end) => end.repo)).size > 1;
	const seen = new Set<string>();
	return finding.evidence.flatMap((end) => {
		const key = `${end.repo}\0${end.path}\0${String(end.line)}\0${end.kind}\0${end.symbol}`;
		if (seen.has(key)) return [];
		seen.add(key);
		return [describeEnd(end, several, locations)];
	});
}

/**
 * Describe one piece of evidence.
 * @param end The evidence.
 * @param withRepo Whether to name the repository, because the finding spans several.
 * @param locations Where files are on this machine.
 * @returns The detail.
 */
function describeEnd(end: Evidence, withRepo: boolean, locations: Locations): EvidenceDetail {
	const where = `${end.path}:${String(end.line)}${withRepo ? ` in ${end.repo}` : ""}`;
	const read = readEnd(end, locations);
	return {
		description: `${end.kind}, ${end.resolution}: ${where} (${end.symbol})`,
		line: end.line,
		repositoryFile: read && repositoryRelative(locations.repository, read.absolute),
		excerpt: read && excerptOf(read.text, end.line),
	};
}

/**
 * Read the file of a piece of evidence from its repository's checkout.
 * @param end The evidence.
 * @param locations Where files are on this machine.
 * @returns The file's path and text, or undefined when this machine has no such file.
 */
function readEnd(
	end: Evidence,
	locations: Locations,
): { absolute: string; text: string } | undefined {
	const root = locations.roots.get(end.repo);
	if (root === undefined) return undefined;
	const absolute = join(root, end.path);
	const text = locations.files.read(absolute);
	return text === undefined ? undefined : { absolute, text };
}

/**
 * The file a finding names, as a path relative to the checked repository, when it is in it.
 * @param finding The finding.
 * @param locations Where files are on this machine.
 * @returns The path, or undefined.
 */
function findingFile(finding: Finding, locations: Locations): string | undefined {
	const repoRoot =
		finding.fileRepo === undefined ? undefined : locations.roots.get(finding.fileRepo);
	const candidates =
		finding.fileRepo === undefined
			? [
					finding.file,
					join(locations.vault ?? locations.home, finding.file),
					join(locations.home, finding.file),
					join(locations.workspace, finding.file),
				]
			: repoRoot === undefined
				? []
				: [join(repoRoot, finding.file)];
	const found = candidates.find(
		(candidate) => isAbsolute(candidate) && locations.files.read(candidate) !== undefined,
	);
	return found === undefined ? undefined : repositoryRelative(locations.repository, found);
}

export {
	excerptOf,
	excerptText,
	evidenceDetails,
	findingFile,
	repositoryRelative,
	type EvidenceDetail,
	type Excerpt,
	type Locations,
	type SourceFiles,
};
