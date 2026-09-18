// Whether a command reached into the batch tree outside its own run's world,
// read as the shell would read it: words joined across quotes, relative paths
// from every directory the script could be in, and a path exempt only when the
// command itself shows it read nothing.

import path from "node:path";
import type { ExposureRoots } from "@/runtime/skill-evaluation/lib/classify";

/**
 * Whether a script reaches into the batch tree outside its own world: another
 * run, the blinding table that names every run's arm, the batch manifest, or
 * the harness's own records of this run. Every path a shell word names there
 * counts, unless the command itself shows it read nothing: the word is a plain
 * literal, with no quote, escape or expansion that could make the shell pass
 * something else, the path does not exist, and the command's output says so.
 * A script that assigns or expands a variable, or substitutes a command, can
 * build a path no word spells, so none of its paths is exempt. Existence alone
 * is not enough: the disk is read when the report is, and a file deleted since
 * the run was there when the author read it.
 * @param script The unwrapped script.
 * @param output What the command printed.
 * @param roots Where the batch and this run's world live.
 * @param cwd The author's working directory.
 * @returns True when it names part of the batch that is not this run's world.
 */
function reachesBatchOutsideWorld(
	script: string,
	output: string,
	roots: ExposureRoots,
	cwd: string,
): boolean {
	const words = shellWords(script);
	const check: ReadCheck = {
		roots,
		output,
		exemptable: !/[$`]/u.test(script) && !words.some((word) => ASSIGNMENT_RE.test(word.value)),
	};
	let places: Places = { start: cwd, latest: cwd, possible: [cwd], awaitingTarget: false };
	return words.some((word) => {
		const reached = batchPathsIn(word.value, roots.batchRoot).some((named) =>
			namesOutsideWorld(word, named, places, check),
		);
		places = afterWord(places, word.value);
		return reached;
	});
}

/** A shell word that assigns a variable. */
const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/u;
/** The commands that change the working directory for the words after them. */
const CD_RE = /^(?:cd|pushd)$/u;

/** What deciding whether a path was read needs. */
interface ReadCheck {
	readonly roots: ExposureRoots;
	readonly output: string;
	/** False when the script can build a path no word spells, so nothing is exempt. */
	readonly exemptable: boolean;
}

/**
 * Where a relative word may be read from. A `cd` can fail, run in a subshell
 * or be undone, so the directories the script could be in are kept: where it
 * started, where it is after each `cd` if every one took effect, and each
 * `cd` target taken from where it started. That is one or two more per `cd`,
 * never a product of them, so a script of many relative `cd`s stays cheap.
 */
interface Places {
	readonly start: string;
	readonly latest: string;
	readonly possible: readonly string[];
	/** True after `cd` or `pushd` and its flags, until the directory it names. */
	readonly awaitingTarget: boolean;
}

/**
 * Where the script may be after one more word: a `cd` or `pushd` waits for
 * its directory, past any flag; `cd -` goes back to a directory already kept.
 * @param places Where it may be before.
 * @param value The word as the shell passes it.
 * @returns Where it may be after.
 */
function afterWord(places: Places, value: string): Places {
	if (CD_RE.test(value)) return { ...places, awaitingTarget: true };
	if (!places.awaitingTarget) return places;
	if (value.startsWith("-") && value !== "-") return places;
	if (value === "-") return { ...places, awaitingTarget: false };
	const latest = path.resolve(places.latest, value);
	return {
		start: places.start,
		latest,
		possible: [...new Set([...places.possible, latest, path.resolve(places.start, value)])],
		awaitingTarget: false,
	};
}

/**
 * Whether one path a word names is part of the batch outside the run's world.
 * Resolved from the latest directory, the path counts unless the command shows
 * it read nothing. From any other directory the script could be in, it counts
 * when it exists, or when the latest reading names nothing either: a read that
 * found its file where every `cd` took it is not a read of another run.
 * @param word The shell word.
 * @param named The path as the word spells it.
 * @param places Where the script may be.
 * @param check What deciding needs.
 * @returns True when it counts.
 */
function namesOutsideWorld(
	word: ShellWord,
	named: string,
	places: Places,
	check: ReadCheck,
): boolean {
	const latest = path.resolve(places.latest, named);
	if (countsAsRead(word, named, latest, check)) return true;
	const foundLatest = check.roots.exists(latest);
	return places.possible.some((directory) => {
		const target = path.resolve(directory, named);
		if (target === latest || !outsideWorld(target, check.roots)) return false;
		return check.roots.exists(target) || (!foundLatest && countsAsRead(word, named, target, check));
	});
}

/**
 * Whether a path is part of the batch outside the run's world.
 * @param target The resolved path.
 * @param roots Where the batch and the world live.
 * @returns True when it is.
 */
function outsideWorld(target: string, roots: ExposureRoots): boolean {
	return inside(roots.batchRoot, target) && !inside(roots.world, target);
}

/**
 * Whether one resolution of a path counts: it lies outside the world and the
 * command does not show it read nothing.
 * @param word The shell word.
 * @param named The path as the word spells it.
 * @param target The resolved path.
 * @param check What deciding needs.
 * @returns True when it counts.
 */
function countsAsRead(word: ShellWord, named: string, target: string, check: ReadCheck): boolean {
	return (
		outsideWorld(target, check.roots) &&
		!(check.exemptable && readNothing(word, target, named, check))
	);
}

/**
 * Whether naming a path read nothing: its word is plain, the path does not
 * exist, and the command's output reports it missing.
 * @param word The shell word.
 * @param target The path it resolves to.
 * @param named The path as the word spells it.
 * @param check Where to ask whether it exists, and what the command printed.
 * @returns True when the command shows it read nothing.
 */
function readNothing(word: ShellWord, target: string, named: string, check: ReadCheck): boolean {
	return word.plain && !check.roots.exists(target) && reportedMissing(check.output, named);
}

/**
 * The paths a shell word names that could lie in the batch: from each place
 * the batch root appears in it, and the whole word when it is relative:
 * `.`, `..`, or a path beginning with either.
 * @param value The word as the shell passes it.
 * @param batchRoot The batch.
 * @returns The paths, as spelled.
 */
function batchPathsIn(value: string, batchRoot: string): string[] {
	const found: string[] = [];
	for (let at = value.indexOf(batchRoot); at >= 0; at = value.indexOf(batchRoot, at + 1))
		found.push(value.slice(at));
	if (/^\.\.?(?:\/|$)/u.test(value)) found.push(value);
	return found;
}

/**
 * Whether a command's output says a path it named does not exist, as sed, cat,
 * ls, head and rg put it.
 * @param output What the command printed.
 * @param named The path as the command spelled it.
 * @returns True when the output reports it missing.
 */
function reportedMissing(output: string, named: string): boolean {
	return [`${named}: No such file or directory`, `${named}': No such file or directory`].some(
		(line) => output.includes(line),
	);
}

/** Characters the shell expands: a word holding one names whatever it matches. */
const EXPANSION_RE = /[*?[\]{}$`~]/u;

/** One shell word: what the shell passes, and whether it is spelled exactly so. */
interface ShellWord {
	readonly value: string;
	/** True when the word has no quote, escape or expansion character: what is written is what is passed. */
	readonly plain: boolean;
}

/** One shell word as written: quoted runs, escapes and plain characters, up to unquoted space or an operator. */
const SHELL_WORD_RE = /(?:'[^']*'?|"(?:\\.|[^"\\])*"?|\\.?|[^\s|;&<>()'"\\])+/gsu;
/** One quoted run or escape inside a word, to be replaced by what it passes. */
const QUOTING_RE = /'([^']*)'?|"((?:\\.|[^"\\])*)"?|\\(.?)/gsu;

/**
 * Splits a script into shell words, joining quoted and unquoted parts of one
 * word as the shell does: `base"line"` and `..'/'..` are single words.
 * @param script The unwrapped script.
 * @returns The words in order.
 */
function shellWords(script: string): ShellWord[] {
	return [...script.matchAll(SHELL_WORD_RE)].map(([raw]) => ({
		value: raw.replaceAll(QUOTING_RE, unquoted),
		plain: !/['"\\]/u.test(raw) && !EXPANSION_RE.test(raw),
	}));
}

/**
 * What one quoted run or escape passes. Inside double quotes a backslash
 * escapes only a dollar, a backtick, a double quote, a backslash or a newline.
 * @param _match The whole quoted run.
 * @param single The inside of single quotes.
 * @param double The inside of double quotes.
 * @param escaped The escaped character.
 * @returns The text the shell passes.
 */
function unquoted(
	_match: string,
	single: string | undefined,
	double: string | undefined,
	escaped: string | undefined,
): string {
	return single ?? double?.replaceAll(/\\([$`"\\\n])/gu, "$1") ?? escaped ?? "";
}

/**
 * Tests whether a resolved path is the directory or one of its descendants.
 * @param directory The containing directory.
 * @param target The resolved path to test.
 * @returns True when target is inside directory.
 */
function inside(directory: string, target: string): boolean {
	const relative = path.relative(directory, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export { reachesBatchOutsideWorld };
