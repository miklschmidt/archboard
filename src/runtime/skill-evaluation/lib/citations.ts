// What grading cites, and the check that every citation still lands: a
// passage of the skill, a row of its catalogue, a section of the rubric.
//
// The grader answers to a
// scenario's checklist and to the rubric, and neither said where in the skill
// an expectation came from, so a rubric sentence that had drifted from the
// skill was graded as the author's failure (TASK-268). Every expected feature
// therefore names the passage it derives from, and every catalogue row the
// rubric grades is one the skill's own catalogue holds; `eval:skill check`
// refuses a suite where either has come loose.
//
// A citation is `<file>#<anchor>`: a markdown file of the skill, relative to
// its root, and the anchor of one of its headings, slugged the way the skill's
// own links slug them (`SKILL.md#everything-the-code-shows`). It is never a
// line number, so rewording a passage keeps it cited, and renaming a heading
// breaks the citation loudly at check time rather than silently at grading.

import fs from "node:fs";
import path from "node:path";

/**
 * What a citation looks like: a markdown file of the skill and a heading
 * anchor in it. Plain groups only, since it also travels to the grader as a
 * JSON Schema pattern.
 */
const CITATION_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.md#[a-z0-9-]+$/u;

/**
 * The rows of the skill's catalogue ("Everything the code shows"), which the
 * rubric's unprompted walk grades in the same words. A closed set, so a
 * grader's `unprompted` answer can only name one of them and a report can sum
 * missed rows into a number two arms share.
 */
const CATALOGUE_ROWS = [
	"external",
	"binding",
	"containment",
	"relationship",
	"traffic",
	"emphasis",
	"repeat",
	"note",
	"groups",
	"flow",
	"view",
	"walkthrough",
	"drillDown",
	"description",
] as const;
type CatalogueRow = (typeof CATALOGUE_ROWS)[number];

/** Where a batch keeps the candidate skill it ran, relative to the batch root. */
const BATCH_SKILL_DIRECTORY = "skill";

/**
 * Keeps a copy of the candidate skill in the batch, once, so the batch can be
 * graded against the skill it ran whatever the checkout holds by then: the
 * grader reads it and its findings are resolved against it. The derived
 * `references/generated/` is left out; it is regenerated from the product's
 * source, not written as the skill's teaching, and no citation names it. A
 * resumed batch keeps its first copy, which its provenance already binds.
 * @param skillRoot The candidate skill in the checkout.
 * @param batchRoot The batch.
 * @returns The kept copy's directory.
 */
function keepBatchSkill(skillRoot: string, batchRoot: string): string {
	const target = path.join(batchRoot, BATCH_SKILL_DIRECTORY);
	if (fs.existsSync(target)) return target;
	const generated = path.join(skillRoot, "references", "generated");
	/**
	 * Whether a path is copied: all but the derived generated files.
	 * @param source The path.
	 * @returns True to copy it.
	 */
	const authored = (source: string): boolean => source !== generated;
	fs.cpSync(skillRoot, target, { recursive: true, dereference: true, filter: authored });
	return target;
}

/** Where the skill states its catalogue; the rows above are that table's. */
const CATALOGUE_PASSAGE = "SKILL.md#everything-the-code-shows";

/**
 * The rubric sections the grader prompt points at by name instead of
 * restating them, by what each governs. A prompt that paraphrased the rubric
 * drifted from it one level closer to the model (TASK-268); a pointer cannot,
 * and a renamed section is refused at check time rather than pointed past.
 */
const RUBRIC_SECTIONS = {
	features: "Per-feature verdicts",
	findings: "Findings",
	correctUse: "What correct use means",
	unprompted: "What the skill adds unprompted",
	inherited: "What the run inherited",
	visual: "What you can and cannot see",
	scores: "Scores (0-10 each)",
	concerns: "Concerns",
} as const;

/**
 * A heading's anchor as a markdown link names it: lower case, punctuation
 * dropped, spaces as hyphens.
 * @param heading The heading's text, without its hashes.
 * @returns The anchor.
 */
function headingAnchor(heading: string): string {
	return heading
		.trim()
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}\s-]/gu, "")
		.replaceAll(/\s/gu, "-");
}

/**
 * A document's lines outside fenced code.
 * @param markdown The document.
 * @returns The lines, fence markers left out.
 */
function unfencedLines(markdown: string): string[] {
	let fenced = false;
	return markdown.split("\n").filter((line) => {
		if (!/^\s*(?:```|~~~)/u.test(line)) return !fenced;
		fenced = !fenced;
		return false;
	});
}

/**
 * The text of every heading a markdown document holds, fenced code left out.
 * @param markdown The document.
 * @returns The headings' text, in order.
 */
function headingsOf(markdown: string): string[] {
	return unfencedLines(markdown).flatMap((line) => {
		const text = /^#{1,6}\s+(?<text>.+?)\s*#*\s*$/u.exec(line)?.groups?.["text"];
		return text === undefined ? [] : [text];
	});
}

/**
 * Every heading anchor a markdown document offers, a repeated heading
 * numbered the way a renderer numbers it.
 * @param markdown The document.
 * @returns The anchors.
 */
function anchorsOf(markdown: string): Set<string> {
	const anchors = new Set<string>();
	for (const heading of headingsOf(markdown)) {
		const anchor = headingAnchor(heading);
		let numbered = anchor;
		for (let index = 1; anchors.has(numbered); index += 1) numbered = `${anchor}-${index}`;
		anchors.add(numbered);
	}
	return anchors;
}

/**
 * A file of the skill by its path under the skill's root.
 * @param skillRoot The skill's root directory.
 * @param file The path under it.
 * @returns The absolute path, or null when it is outside the skill, absent, or generated.
 */
function skillFile(skillRoot: string, file: string): string | null {
	// Derived from the product's source and left out of the batch's copy, so
	// a passage there would pass here and name nothing when graded.
	if (file.startsWith("references/generated/")) return null;
	const resolved = path.resolve(skillRoot, file);
	const inside = resolved.startsWith(`${path.resolve(skillRoot)}${path.sep}`);
	return inside && fs.existsSync(resolved) ? resolved : null;
}

/**
 * Why a citation does not name a passage of the skill, or null when it does.
 * @param skillRoot The skill's root directory.
 * @param citation The citation.
 * @returns The problem, or null.
 */
function citationProblem(skillRoot: string, citation: string): string | null {
	if (!CITATION_PATTERN.test(citation))
		return `${citation} is not a <file>#<heading-anchor> citation`;
	const [file = "", anchor = ""] = citation.split("#");
	const resolved = skillFile(skillRoot, file);
	if (resolved === null) return `${citation}: ${file} is not in the skill`;
	return anchorsOf(fs.readFileSync(resolved, "utf8")).has(anchor)
		? null
		: `${citation}: ${file} has no heading #${anchor}`;
}

/**
 * The body lines of a document's catalogue table: the table whose header's
 * first cell is `Row`, wherever it sits in the document.
 * @param markdown The document.
 * @returns The body lines, or null when there is no such table.
 */
function catalogueTableOf(markdown: string): string[] | null {
	const lines = markdown.split("\n");
	const header = lines.findIndex((line) => /^\|\s*Row\s*\|/u.test(line));
	if (header === -1) return null;
	const body = lines.slice(header + 2);
	const end = body.findIndex((line) => !line.startsWith("|"));
	return end === -1 ? body : body.slice(0, end);
}

/**
 * The row keys of a document's catalogue table, one backticked key per body row.
 * @param markdown The document (the rubric, or the skill's SKILL.md).
 * @returns The keys in table order, or null when the document has no such table.
 */
function catalogueRowsOf(markdown: string): string[] | null {
	return (
		catalogueTableOf(markdown)?.flatMap((line) => {
			const key = /^\|\s*`(?<key>[^`]+)`\s*\|/u.exec(line)?.groups?.["key"];
			return key === undefined ? [] : [key];
		}) ?? null
	);
}

/**
 * Where a document's catalogue departs from the closed set: rows it lacks,
 * rows it adds, or no catalogue at all.
 * @param label The document, for the message.
 * @param markdown Its text.
 * @returns Problems, one line each.
 */
function catalogueProblems(label: string, markdown: string): string[] {
	const rows = catalogueRowsOf(markdown);
	if (rows === null) return [`${label}: no catalogue table (a table whose first column is Row)`];
	const known = new Set<string>(CATALOGUE_ROWS);
	const present = new Set(rows);
	return [
		...CATALOGUE_ROWS.filter((row) => !present.has(row)).map(
			(row) => `${label}: catalogue row \`${row}\` is missing`,
		),
		...rows
			.filter((row) => !known.has(row))
			.map((row) => `${label}: catalogue row \`${row}\` is not one of the skill's rows`),
	];
}

/**
 * Rubric sections the grader prompt points at that the rubric no longer has.
 * @param label The rubric, for the message.
 * @param rubric Its text.
 * @returns Problems, one line each.
 */
function rubricSectionProblems(label: string, rubric: string): string[] {
	const anchors = anchorsOf(rubric);
	return Object.values(RUBRIC_SECTIONS)
		.filter((section) => !anchors.has(headingAnchor(section)))
		.map((section) => `${label}: the grader prompt points at section "${section}", which it lacks`);
}

export {
	BATCH_SKILL_DIRECTORY,
	keepBatchSkill,
	CATALOGUE_PASSAGE,
	RUBRIC_SECTIONS,
	rubricSectionProblems,
	CATALOGUE_ROWS,
	CITATION_PATTERN,
	anchorsOf,
	catalogueProblems,
	catalogueRowsOf,
	citationProblem,
	headingAnchor,
	type CatalogueRow,
};
