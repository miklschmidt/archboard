// The workflow-command annotations of a check's findings. A reviewer sees each finding on the
// diff of the file it is about. A finding that crosses a network hop rests on evidence in several
// files, such as the code that reads an address and the manifest that sets it. It is annotated at
// each of them that is in the checked repository, because GitHub can put an annotation only on a
// file of the pull request's repository. Every annotation carries the whole message with both ends
// and both excerpts, so the reviewer sees the other end, even in another repository. Pure.
/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */

import { excerptText, evidenceDetails, findingFile } from "./evidence.ts";
import type { EvidenceDetail, Locations } from "./evidence.ts";
import { findingTitle } from "./findings.ts";
import type { Finding, FindingLevel } from "./findings.ts";
import { withinLimit } from "../shared/workflow-commands.ts";
import type { Annotation, AnnotationLevel } from "../shared/workflow-commands.ts";

const ANNOTATION_LEVEL: Readonly<Record<FindingLevel, AnnotationLevel>> = {
	error: "error",
	warning: "warning",
	information: "notice",
};

/**
 * One evidence end as the lines of an annotation.
 * @param detail The evidence.
 * @returns The description, then its excerpt.
 */
function detailText(detail: EvidenceDetail): string {
	const lines = [`- ${detail.description}`];
	if (detail.excerpt !== undefined) {
		lines.push(
			...excerptText(detail.excerpt)
				.split("\n")
				.map((line) => `    ${line}`),
		);
	}
	return lines.join("\n");
}

/**
 * The message every annotation of a finding carries.
 * @param finding The finding.
 * @param details Its evidence.
 * @returns The finding's message, then each end of its evidence with an excerpt.
 */
function annotationMessage(finding: Finding, details: readonly EvidenceDetail[]): string {
	if (details.length === 0) return finding.message;
	const missing =
		finding.missing === undefined
			? []
			: [`The check found evidence on one side only, none on the ${finding.missing} side.`];
	return [finding.message, ...missing, "Evidence:", ...details.map(detailText)].join("\n");
}

/**
 * The places a finding is annotated: each distinct evidence line in the checked repository, else
 * the file the finding names.
 * @param finding The finding.
 * @param details Its evidence.
 * @param locations Where files are on this machine.
 * @returns The files and lines. A finding that is in no file of the repository has one place with no file.
 */
function anchorsOf(
	finding: Finding,
	details: readonly EvidenceDetail[],
	locations: Locations,
): { file?: string | undefined; line?: number | undefined }[] {
	const seen = new Set<string>();
	const places = details.flatMap((detail) => {
		const key = `${detail.repositoryFile ?? ""}:${String(detail.line)}`;
		if (detail.repositoryFile === undefined || seen.has(key)) return [];
		seen.add(key);
		return [{ file: detail.repositoryFile, line: detail.line }];
	});
	if (places.length > 0) return places;
	return [{ file: findingFile(finding, locations) }];
}

/**
 * The annotations of one finding.
 * @param finding The finding.
 * @param locations Where files are on this machine.
 * @returns One annotation for each place the finding is anchored.
 */
function annotationsFor(finding: Finding, locations: Locations): Annotation[] {
	const details = evidenceDetails(finding, locations);
	const message = annotationMessage(finding, details);
	return anchorsOf(finding, details, locations).map((anchor) => ({
		level: ANNOTATION_LEVEL[finding.level],
		properties: { ...anchor, title: findingTitle(finding) },
		message,
	}));
}

/**
 * The annotations of every finding, cut to what GitHub shows.
 * @param findings The findings.
 * @param locations Where files are on this machine.
 * @returns The annotations to print, and how many fell over the limit of each level.
 */
function annotationsForAll(
	findings: readonly Finding[],
	locations: Locations,
): { kept: Annotation[]; dropped: number } {
	return withinLimit(findings.flatMap((finding) => annotationsFor(finding, locations)));
}

export { annotationsFor, annotationsForAll };
