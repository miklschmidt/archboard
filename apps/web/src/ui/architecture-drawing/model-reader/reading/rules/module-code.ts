// What the last code pass says of each module of a reading, for the Code columns of Measures
// (TASK-646.07, ADR 0082): its exports by kind, the logic behind them and its findings, or why the
// pass did not judge it. A module the pass read only in part never looks clean.

import type { RememberedFindings } from "@archboard/code-intel/code-check";

type Remembered = NonNullable<RememberedFindings["models"]>[number];
type Depth = NonNullable<Remembered["depth"]>[number];
type Skip = NonNullable<Remembered["skipped"]>[number];

/** What the code pass says of one module. */
type ModuleCode =
	| {
			readonly kind: "read";
			readonly exports: Depth["exports"];
			readonly logic: number;
			/** The findings of the pass on the module itself. */
			readonly findings: number;
			/** What the pass did not read of it, in words; none for a whole read. */
			readonly partial: readonly string[];
	  }
	| {
			readonly kind: "skipped";
			/** Why, as a key: the skip's reason, or `unjudged` for a module no rule reads. */
			readonly reason: string;
			readonly words: string;
	  };

/** The names of the languages a pass reads, as a reader spells them. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
	typescript: "TypeScript",
	python: "Python",
	csharp: "C#",
	swift: "Swift",
	c: "C",
	cpp: "C++",
	rust: "Rust",
	go: "Go",
};

/** Why the pass did not judge a module, in words, for the reasons a part can be skipped for. */
const NOT_JUDGED: Readonly<Partial<Record<Skip["reason"], string>>> = {
	unbound: "no code binding",
	"exposure-unknown": "no root file in a language the check reads",
	"repository-unregistered": "repository not registered here",
	"checkout-unavailable": "checkout could not be read",
	"ref-not-checked-out": "its ref is not checked out",
	"path-ignored": "Git ignores its path",
	"path-never-read": "the check never reads its path",
	"module-not-read": "a module the check does not read",
};

/** The reasons a language server gives no answer, said once for a checkout and a language. */
const SERVER_SKIPS: ReadonlySet<Skip["reason"]> = new Set([
	"language-server-missing",
	"language-server-unready",
	"language-server-failed",
]);

/**
 * A language as a reader spells it.
 * @param language The language as the pass names it.
 * @returns Its name.
 */
function languageName(language: string): string {
	return LANGUAGE_NAMES[language] ?? language;
}

/**
 * The language a server skip names: its detail starts with it.
 * @param skip The skip.
 * @returns The language, or undefined.
 */
function skippedLanguage(skip: Skip): string | undefined {
	return skip.detail?.split(":", 1)[0];
}

/**
 * What the pass did not read of a module it measured: languages no rule judges, and languages of
 * the module whose server gave no answer in its checkout.
 * @param depth The module.
 * @param skipped What the pass skipped.
 * @returns The words, one for each.
 */
function partialOf(depth: Depth, skipped: readonly Skip[]): string[] {
	const servers = skipped.flatMap((skip) => {
		const language = skippedLanguage(skip);
		return SERVER_SKIPS.has(skip.reason) &&
			skip.repo === depth.repo &&
			language !== undefined &&
			depth.languages.includes(language)
			? [`no ${languageName(language)} language server answered`]
			: [];
	});
	const rules = depth.unjudged.map((language) => `no rule judges ${languageName(language)} yet`);
	return [...rules, ...new Set(servers)];
}

/**
 * What one measured module says: its counts, or that no rule judged any of its languages.
 * @param depth The module.
 * @param findings How many findings the pass made on it.
 * @param skipped What the pass skipped.
 * @returns What it says.
 */
function measuredModule(depth: Depth, findings: number, skipped: readonly Skip[]): ModuleCode {
	if (depth.languages.length === 0) {
		const languages = depth.unjudged.map(languageName).join(", ");
		return {
			kind: "skipped",
			reason: "unjudged",
			words: languages === "" ? "no export that a rule judges" : `no rule judges ${languages} yet`,
		};
	}
	const { exports, logic } = depth;
	return { kind: "read", exports, logic, findings, partial: partialOf(depth, skipped) };
}

/**
 * How many findings the pass made on each subject.
 * @param findings The findings.
 * @returns The count of each subject that has one.
 */
function findingsBySubject(findings: Remembered["findings"]): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const id of findings.flatMap(({ subject }) => subject?.id ?? []))
		counts.set(id, (counts.get(id) ?? 0) + 1);
	return counts;
}

/**
 * A module the pass skipped, and why.
 * @param skip The skip of a part.
 * @returns What the pass says of it.
 */
function skippedModule(skip: Skip): ModuleCode {
	const words = NOT_JUDGED[skip.reason] ?? skip.reason.replaceAll("-", " ");
	return { kind: "skipped", reason: skip.reason, words };
}

/**
 * What the pass says of each module it measured or skipped. A module it neither measured nor
 * skipped, such as one with no binding of its own, has nothing to say.
 * @param reading The pass that read the reading on screen.
 * @returns Each module the pass names.
 */
function codeByModule(reading: Remembered): ReadonlyMap<string, ModuleCode> {
	const skipped = reading.skipped ?? [];
	const findings = findingsBySubject(reading.findings);
	return new Map([
		...skipped.flatMap((skip) =>
			skip.subject?.kind === "node" ? [[skip.subject.id, skippedModule(skip)] as const] : [],
		),
		...(reading.depth ?? []).map(
			(depth) =>
				[
					depth.subject.id,
					measuredModule(depth, findings.get(depth.subject.id) ?? 0, skipped),
				] as const,
		),
	]);
}

/**
 * Why modules were not judged, once for the table, by how many modules each reason holds.
 * @param modules What the pass says of each module.
 * @returns The words, or nothing when it judged every module it names.
 */
function notJudgedWords(modules: ReadonlyMap<string, ModuleCode>): string {
	const reasons = new Map<string, number>();
	for (const code of modules.values())
		if (code.kind === "skipped") reasons.set(code.words, (reasons.get(code.words) ?? 0) + 1);
	const words = [...reasons].map(([reason, count]) => `${count} ${reason}`);
	return words.length === 0 ? "" : `Not judged: ${words.join(", ")}.`;
}

/** The languages of one checkout that have no server, for one line that offers to set them up. */
interface MissingServers {
	readonly repo: string;
	/** The languages, as the pass names them, in the order it met them. */
	readonly languages: readonly string[];
}

/**
 * The checkout and the language a skip says has no server.
 * @param skip The skip.
 * @returns Them, or none for any other skip.
 */
function serverMissing(skip: Skip): { readonly repo: string; readonly language: string }[] {
	const language = skippedLanguage(skip);
	if (skip.reason !== "language-server-missing") return [];
	return skip.repo === undefined || language === undefined ? [] : [{ repo: skip.repo, language }];
}

/**
 * The checkouts of the pass that miss the server of a language, each with those languages.
 * @param reading The pass.
 * @returns Each checkout once.
 */
function missingServers(reading: Remembered): readonly MissingServers[] {
	const byRepo = new Map<string, Set<string>>();
	for (const { repo, language } of (reading.skipped ?? []).flatMap(serverMissing))
		byRepo.set(repo, (byRepo.get(repo) ?? new Set()).add(language));
	return [...byRepo].map(([repo, languages]) => ({ repo, languages: [...languages] }));
}

export {
	codeByModule,
	languageName,
	missingServers,
	notJudgedWords,
	type MissingServers,
	type ModuleCode,
};
