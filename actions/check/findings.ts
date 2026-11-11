// The findings of one `archboard check` answer, in one flat list. Pure: it reads the JSON the
// command printed and decides nothing about files, annotations or the exit status.
//
// The answer has a part for each check that ran. A semantic diagnostic and an embeds warning
// make the command exit 1 like a code warning; information never does. Fields that an older
// CLI may not send are optional here, so the action reads a release older than this checkout.

import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";
import type { VaultCheckSchema } from "@archboard/model/policy";
import type { z } from "zod";

/** One diagnostic of the semantics check. */
type VaultDiagnostic = z.infer<typeof VaultCheckSchema>["diagnostics"][number];

/** One finding of the code check, with the evidence its severity rests on. */
type CodeFinding = CodeCheckAnswer["findings"][number];

/** One piece of code or configuration a finding rests on. */
type Evidence = NonNullable<CodeFinding["evidence"]>[number];

/** What the embeds check reports about a picture in a document. */
interface EmbedFinding {
	readonly severity: "warning" | "information";
	readonly code: string;
	readonly file: string;
	readonly embedRepo?: string | undefined;
	readonly message: string;
}

/** The parts of the answer of `archboard check` that the action reads. */
interface CheckReading {
	readonly semantics?: { readonly diagnostics: readonly VaultDiagnostic[] } | undefined;
	readonly code?:
		| {
				readonly findings: readonly CodeFinding[];
				readonly skipped?: CodeCheckAnswer["skipped"] | undefined;
		  }
		| undefined;
	readonly embeds?:
		| { readonly checkout?: string | undefined; readonly findings: readonly EmbedFinding[] }
		| undefined;
	readonly skipped?: { readonly checks: readonly string[]; readonly message: string } | undefined;
	readonly vault?: { readonly path: string } | undefined;
}

/** How a finding counts: an error or a warning fails the check, information never does. */
type FindingLevel = "error" | "warning" | "information";

/** One finding, whichever check made it. */
interface Finding {
	readonly part: "semantics" | "code" | "embeds";
	readonly level: FindingLevel;
	readonly code: string;
	/** The module, relationship, flow or step it is about. */
	readonly subject?: string | undefined;
	readonly message: string;
	/** The file the CLI names: a vault file, or an embed. */
	readonly file: string;
	/** For an embed of another repository, that repository's identity. */
	readonly fileRepo?: string | undefined;
	readonly evidence: readonly Evidence[];
	/** For a network hop with evidence on one side only, the side that has none. */
	readonly missing?: string | undefined;
}

/**
 * One semantic diagnostic as a finding. Every diagnostic makes the check exit 1, so each is an error.
 * @param diagnostic The diagnostic.
 * @returns The finding.
 */
function fromDiagnostic(diagnostic: VaultDiagnostic): Finding {
	return {
		part: "semantics",
		level: "error",
		code: diagnostic.code,
		subject: diagnostic.subject?.name,
		message: diagnostic.message,
		file: diagnostic.file,
		evidence: [],
	};
}

/**
 * One finding of the code check as a finding.
 * @param finding The code finding.
 * @returns The finding.
 */
function fromCodeFinding(finding: CodeFinding): Finding {
	return {
		part: "code",
		level: finding.severity,
		code: finding.code,
		subject: finding.subject?.name,
		message: finding.message,
		file: finding.file,
		evidence: finding.evidence ?? [],
		missing: finding.missing,
	};
}

/**
 * One embeds finding as a finding.
 * @param finding The embeds finding.
 * @returns The finding.
 */
function fromEmbedFinding(finding: EmbedFinding): Finding {
	return {
		part: "embeds",
		level: finding.severity,
		code: finding.code,
		message: finding.message,
		file: finding.file,
		fileRepo: finding.embedRepo,
		evidence: [],
	};
}

/**
 * The findings of the code check and of the embeds check.
 * @param answer The answer of `archboard check`.
 * @returns The code findings, then the embeds findings.
 */
function collectCodeFindings(answer: CheckReading): Finding[] {
	return [
		...(answer.code?.findings.map(fromCodeFinding) ?? []),
		...(answer.embeds?.findings.map(fromEmbedFinding) ?? []),
	];
}

/**
 * Every finding of the answer, in the order the command prints its checks.
 * @param answer The answer of `archboard check`.
 * @returns The semantic diagnostics, then the code findings, then the embeds findings.
 */
function collectFindings(answer: CheckReading): Finding[] {
	return [
		...(answer.semantics?.diagnostics.map(fromDiagnostic) ?? []),
		...collectCodeFindings(answer),
	];
}

/** How many findings of each level. */
interface FindingCounts {
	readonly errors: number;
	readonly warnings: number;
	readonly information: number;
}

/**
 * How many findings have a level.
 * @param findings The findings.
 * @param level The level.
 * @returns The count.
 */
function countLevel(findings: readonly Finding[], level: FindingLevel): number {
	return findings.filter((finding) => finding.level === level).length;
}

/**
 * Count findings by level.
 * @param findings The findings.
 * @returns The counts.
 */
function countFindings(findings: readonly Finding[]): FindingCounts {
	return {
		errors: countLevel(findings, "error"),
		warnings: countLevel(findings, "warning"),
		information: countLevel(findings, "information"),
	};
}

/**
 * The title of a finding's annotation: its code, and the subject it is about.
 * @param finding The finding.
 * @returns The title.
 */
function findingTitle(finding: Finding): string {
	return finding.subject === undefined ? finding.code : `${finding.code}: ${finding.subject}`;
}

/** Where each finding code is explained. */
const FINDINGS_REFERENCE = "https://usearchboard.dev/docs/reference/findings/";

/**
 * The address of a code's entry in the findings reference.
 * @param code A finding or diagnostic code, such as `RELATIONSHIP_UNDRAWN`.
 * @returns The address, ending in the anchor `#relationship-undrawn`.
 */
function findingDocsUrl(code: string): string {
	return `${FINDINGS_REFERENCE}#${code.toLowerCase().replaceAll("_", "-")}`;
}

export {
	findingDocsUrl,
	collectFindings,
	countFindings,
	findingTitle,
	type CheckReading,
	type CodeFinding,
	type EmbedFinding,
	type Evidence,
	type Finding,
	type FindingCounts,
	type FindingLevel,
};
