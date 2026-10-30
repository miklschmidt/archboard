// What the last code check found about the selected subject.
//
// The picture marks a subject the check warns about with the warning triangle
// in its corner, and this is where that mark is cashed in: the check's own
// words for each finding, quoted rather than rewritten because the check is
// what knows what it found, and the code each one rests on. A warning wears the
// triangle the picture draws; information wears nothing, as it has no mark on
// the picture either (ADR 0046). The time of the pass says how old the news is:
// code edited since then is code the pass did not read.

import { useMemo, type JSX } from "react";

import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { lineWarning } from "@archboard/renderer/picture";
import {
	SidebarGlyph,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { cn } from "@archboard/ui-kit/components";
import type { CodeStanding } from "#ui/rules/semantic-board-canvas/code/code-standing.ts";
import { whenChecked } from "#ui/rules/semantic-board-canvas/code/when-checked.ts";

/** One finding of the code check. */
type CodeFinding = CodeCheckAnswer["findings"][number];

/** One piece of evidence behind a finding. */
type CodeEvidence = NonNullable<CodeFinding["evidence"]>[number];

/**
 * The picture's warning triangle, at the size of a row's glyph.
 * @returns The mark.
 */
function WarningGlyph(): JSX.Element {
	const markup = useMemo(() => ({ __html: lineWarning({ x: 0, y: 0 }) }), []);
	return (
		<svg
			aria-hidden="true"
			width="12"
			height="12"
			viewBox="-6 -6 12 12"
			className="shrink-0"
			dangerouslySetInnerHTML={markup}
		/>
	);
}

/**
 * One place in code a finding rests on: what it proves, whether it was resolved
 * or matched by name, and where it is.
 * @param props The evidence.
 * @param props.evidence What the finding rests on.
 * @returns The line.
 */
function Evidence(props: { readonly evidence: CodeEvidence }): JSX.Element {
	const { evidence } = props;
	return (
		<li className="text-muted-foreground text-body">
			{evidence.kind}, {evidence.resolution}{" "}
			<span className="text-technical font-mono [overflow-wrap:anywhere]">
				{evidence.path}:{evidence.line}
			</span>
		</li>
	);
}

/** What assistive technology says before a finding, which a sighted reader tells by glyph and tone. */
const SEVERITY_WORDS: Readonly<Record<CodeFinding["severity"], string>> = {
	warning: "Warning",
	information: "Information",
};

/**
 * One finding: its glyph, the check's words, and what it rests on.
 * @param props The finding.
 * @param props.finding What the check found.
 * @returns The row.
 */
function Finding(props: { readonly finding: CodeFinding }): JSX.Element {
	const { finding } = props;
	const warning = finding.severity === "warning";
	return (
		<li className="flex gap-2" data-severity={finding.severity}>
			<SidebarGlyph>{warning && <WarningGlyph />}</SidebarGlyph>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p
					className={cn("text-body [overflow-wrap:anywhere]", !warning && "text-muted-foreground")}
				>
					<span className="sr-only">{SEVERITY_WORDS[finding.severity]}: </span>
					{finding.message}
				</p>
				{finding.evidence !== undefined && (
					<ul className="flex flex-col gap-0.5">
						{finding.evidence.map((evidence) => (
							<Evidence
								key={`${evidence.path}:${evidence.line}:${evidence.symbol}`}
								evidence={evidence}
							/>
						))}
					</ul>
				)}
			</div>
		</li>
	);
}

/**
 * The findings of the last code check on the selected subject.
 * @param props What the check said, or null when it said nothing about it.
 * @param props.code The findings and when the pass ran.
 * @returns The section, or nothing.
 */
function CodeBlock(props: { readonly code: CodeStanding | null }): JSX.Element | null {
	const { code } = props;
	if (code === null) {
		return null;
	}
	return (
		<SidebarSection title="Against the code" slot="semantic-inspector-code" level={3}>
			<ul className="flex flex-col gap-2" data-slot="semantic-inspector-findings">
				{code.findings.map((finding) => (
					// One subject can carry one code twice: for its binding and for its
					// anchor, which the place in the board tells apart, or for two
					// symbols, which the message names.
					<Finding key={`${finding.code}|${finding.path}|${finding.message}`} finding={finding} />
				))}
			</ul>
			<p className="text-muted-foreground text-body">
				Code check at{" "}
				<time dateTime={code.checkedAt} className="text-technical font-mono">
					{whenChecked(code.checkedAt)}
				</time>
			</p>
		</SidebarSection>
	);
}

export { CodeBlock };
