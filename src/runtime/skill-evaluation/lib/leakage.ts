// An author who meets an evaluation's names in the skill is reading its answer.
// The harness flags a run that opens `evals/`, but a skill package is read on
// purpose, so a worked example written about the evaluated codebase (its board
// names, its views, its symbols) hands every author of both arms the checklist
// without a read anybody could flag. This refuses such a package before a batch
// can measure it.

import fs from "node:fs";
import path from "node:path";

/**
 * The evaluated codebase and its framework, by name: no example about them can
 * be told apart from an answer. Matched as whole words, so an unrelated
 * identifier that merely contains one (an icon name) is not a leak.
 */
const DOMAIN_TERMS = ["flask", "werkzeug", "wsgi", "jinja", "jinja2", "pallets", "itsdangerous"];

/** The keys whose values name a subject a scenario is graded on. */
const NAME_KEYS = new Set([
	"as",
	"board",
	"container",
	"flow",
	"from",
	"group",
	"label",
	"name",
	"names",
	"node",
	"participants",
	"to",
	"variant",
	"view",
]);

/** The command words a request may quote that are the product's, not the evaluation's. */
const PRODUCT_WORDS = /^(?:archboard|semantic)\b/u;

/**
 * Whether a name is specific enough that meeting it in the skill means meeting
 * the evaluation: code punctuation, an inner capital, a hyphenated id, or more
 * than one word. A single plain word (`Shell`, `external`) is ordinary language.
 * @param name The candidate.
 * @returns True when it is distinctive.
 */
function distinctive(name: string): boolean {
	if (name.length < 4 || PRODUCT_WORDS.test(name) || /["{}:]/u.test(name)) return false;
	return /[_./()-]/u.test(name) || /[a-z][A-Z]/u.test(name) || /\s/u.test(name.trim());
}

/**
 * The names one string gives: itself under a name key, and its backticked spans.
 * @param value The string.
 * @param found Where names go.
 * @param key The key it sits under.
 */
function collectString(value: string, found: Set<string>, key: string | undefined): void {
	if (key !== undefined && NAME_KEYS.has(key)) found.add(value);
	for (const match of value.matchAll(/`([^`]+)`/gu)) found.add(match[1] ?? "");
}

/**
 * The names one object gives: its configured group ids, and every child.
 * @param value The object.
 * @param found Where names go.
 * @param key The key it sits under.
 */
function collectObject(value: object, found: Set<string>, key: string | undefined): void {
	for (const [child, inner] of Object.entries(value)) {
		if (key === "groups") found.add(child);
		collect(inner, found, child);
	}
}

/**
 * Every string a JSON value names under a name key, every backticked span in its
 * prose, and every configured group id, collected into one set.
 * @param value The value.
 * @param found Where names go.
 * @param key The key the value sits under.
 */
function collect(value: unknown, found: Set<string>, key?: string): void {
	if (typeof value === "string") collectString(value, found, key);
	else if (Array.isArray(value)) for (const item of value) collect(item, found, key);
	else if (value !== null && typeof value === "object") collectObject(value, found, key);
}

/**
 * The names a package must not carry: the domain terms, and every distinctive
 * name the scenarios and their fixtures grade or lay down.
 * @param scenarios The scenarios as the suite holds them.
 * @param fixtures Their starting vaults.
 * @returns The names, longest first so a report names the most specific match.
 */
function evaluationNames(scenarios: readonly unknown[], fixtures: Iterable<unknown>): string[] {
	const found = new Set<string>();
	for (const scenario of scenarios) collect(scenario, found);
	for (const fixture of fixtures) collect(fixture, found);
	const specific = [...found].map((name) => name.trim()).filter(distinctive);
	return [...new Set([...DOMAIN_TERMS, ...specific])].toSorted((a, b) => b.length - a.length);
}

/**
 * A pattern matching one name as a whole word, whatever surrounds it.
 * @param name The name.
 * @returns The pattern; domain terms match in any case, subject names exactly.
 */
function wholeWord(name: string): RegExp {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	return new RegExp(
		`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`,
		DOMAIN_TERMS.includes(name) ? "iu" : "u",
	);
}

/**
 * Where the text of one package names an evaluation.
 * @param files The package's text files, by path relative to its root.
 * @param names The names it must not carry.
 * @returns One line per file line that names one, with the name.
 */
function leaks(files: ReadonlyMap<string, string>, names: readonly string[]): string[] {
	const patterns = names.map((name) => ({ name, pattern: wholeWord(name) }));
	return [...files].flatMap(([file, text]) =>
		text.split("\n").flatMap((line, index) => {
			const hit = patterns.find(({ pattern }) => pattern.test(line));
			return hit === undefined ? [] : [`${file}:${index + 1}: names "${hit.name}"`];
		}),
	);
}

/**
 * Every Markdown and JSON file under a skill package, by relative path.
 * @param root The package root.
 * @returns The files' text.
 */
function packageText(root: string): Map<string, string> {
	const files = new Map<string, string>();
	if (!fs.existsSync(root)) return files;
	for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !/\.(?:md|json)$/u.test(entry.name)) continue;
		const full = path.join(entry.parentPath, entry.name);
		files.set(path.relative(root, full), fs.readFileSync(full, "utf8"));
	}
	return files;
}

/** Where the product's own generated contract sits inside a skill package. */
const GENERATED = `references${path.sep}generated${path.sep}`;

/**
 * Every place a skill package names an evaluation. The package's generated
 * files are the product's contract (its schemas, its help), so a name the
 * product itself defines, which a request may quote, is not a leak and those
 * files are not searched.
 * @param scenarios The scenarios as the suite holds them.
 * @param fixtures Their starting vaults.
 * @param packages Each package to search, by the label a problem names it with.
 * @returns One problem line per leak.
 */
function leakageProblems(
	scenarios: readonly unknown[],
	fixtures: Iterable<unknown>,
	packages: ReadonlyMap<string, string>,
): string[] {
	const texts = [...packages].map(([label, root]) => [label, packageText(root)] as const);
	const product = new Map(
		texts.flatMap(([, files]) => [...files].filter(([file]) => file.startsWith(GENERATED))),
	);
	const names = evaluationNames(scenarios, fixtures).filter(
		(name) => leaks(product, [name]).length === 0,
	);
	return texts.flatMap(([label, files]) =>
		leaks(new Map([...files].filter(([file]) => !file.startsWith(GENERATED))), names).map(
			(leak) => `${label}/${leak}: a skill package must not carry an evaluation's names`,
		),
	);
}

export { evaluationNames, leakageProblems, leaks, packageText };
