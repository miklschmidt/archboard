import type { JSX } from "react";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import {
	NOT_READ,
	type FootprintSkip,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/footprint-lists.ts";

/** The length of a commit as a line shows it. */
const SHORT = 7;

/**
 * What a footprint read and what it could not: each repository's range, the commits it marks as
 * large, the modules it did not read, and the changed files that no module binds. Nothing here is
 * a count of change: it says what the lists cover, so that a module that was not read never looks
 * unchanged (ADR 0045).
 * @param props The answer.
 * @param props.answer The footprint.
 * @returns The facts.
 */
function FootprintFacts(props: { readonly answer: BranchFootprintAnswer }): JSX.Element {
	const { answer } = props;
	const large = answer.commits.filter((one) => one.large).length;
	return (
		<div
			data-slot="footprint-facts"
			className="text-body text-muted-foreground flex flex-col gap-1.5"
		>
			<p data-slot="footprint-vault" data-vault-read={answer.vaultRead.at}>
				{vaultWords(answer.vaultRead)}
			</p>
			{answer.repositories.map((repository) => (
				<p
					key={repository.repo}
					data-footprint-repository={repository.repo}
					className="[overflow-wrap:anywhere]"
				>
					{rangeWords(repository)}
				</p>
			))}
			{large > 0 && (
				<p data-slot="footprint-large">
					{large} large {large === 1 ? "commit changes" : "commits change"} more than 30 files, and{" "}
					{large === 1 ? "it is" : "they are"} kept.
				</p>
			)}
			{answer.skipped.length > 0 && (
				<p data-slot="footprint-skipped">Not read: {skippedWords(answer.skipped)}.</p>
			)}
			{answer.unboundFiles.length > 0 && <UnboundFiles files={answer.unboundFiles} />}
		</div>
	);
}

/**
 * Which model the footprint read its state, its proposals and its bindings from.
 * @param read The vault the answer read.
 * @returns The words.
 */
function vaultWords(read: BranchFootprintAnswer["vaultRead"]): string {
	if (read.at === "checkout") return "The model on disk sets what the commits are read against.";
	return `The model at ${read.ref}, ${read.commit.slice(0, SHORT)}, sets what the commits are read against.`;
}

/**
 * What one repository's range covers, or why it was not read.
 * @param repository The repository of the answer.
 * @returns The words.
 */
function rangeWords(repository: BranchFootprintAnswer["repositories"][number]): string {
	if (repository.status === "unread")
		return `${repository.repo}: not read, ${NOT_READ[repository.reason]}.`;
	const { repo, mergeBase, head, commits } = repository;
	return `${repo}: ${commits} ${commits === 1 ? "commit" : "commits"} from ${mergeBase.slice(0, SHORT)} to ${head.slice(0, SHORT)}.`;
}

/**
 * The modules that were not read, counted by reason, so that no row has to say it.
 * @param skipped The modules the footprint skipped.
 * @returns The words.
 */
function skippedWords(skipped: readonly FootprintSkip[]): string {
	const reasons = new Map<string, number>();
	for (const { reason } of skipped)
		reasons.set(NOT_READ[reason], (reasons.get(NOT_READ[reason]) ?? 0) + 1);
	return [...reasons].map(([reason, count]) => `${count} ${reason}`).join(", ");
}

/**
 * The changed files that no module binds, which no row shows.
 * @param props The files.
 * @param props.files The files of the answer.
 * @returns The list.
 */
function UnboundFiles(props: {
	readonly files: BranchFootprintAnswer["unboundFiles"];
}): JSX.Element {
	const { files } = props;
	// Two repositories can change the same path, so a list of several names each file's.
	const several = new Set(files.map((file) => file.repo)).size > 1;
	return (
		<details data-slot="footprint-unbound">
			<summary className="cursor-default">
				{files.length} changed {files.length === 1 ? "file has" : "files have"} no module bound to{" "}
				{files.length === 1 ? "it" : "them"}.
			</summary>
			<ul className="mt-1 flex flex-col gap-0.5 font-mono">
				{files.map((file) => (
					<li key={`${file.repo}:${file.path}`} className="text-technical [overflow-wrap:anywhere]">
						{several ? `${file.repo}: ${file.path}` : file.path}
					</li>
				))}
			</ul>
		</details>
	);
}

export { FootprintFacts };
