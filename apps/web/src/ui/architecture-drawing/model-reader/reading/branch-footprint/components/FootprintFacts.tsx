import type { JSX } from "react";
import { RiInformationLine } from "@remixicon/react";
import { buttonVariants, Popover } from "@archboard/ui-kit/components";
import type { BranchFootprintAnswer } from "#ui/architecture-drawing/model-reader/access/clients/branch-footprint.ts";
import {
	NOT_READ,
	type FootprintSkip,
} from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/footprint-lists.ts";

/** The length of a commit as a line shows it. */
const SHORT = 7;

/** The key's look: a small outline key, as `Refresh` beside it is. */
const KEY = buttonVariants({ variant: "outline", size: "icon-xs" });

/** The popover's heading, which names it. */
const HEADING = "footprint-facts-heading";

/**
 * What a footprint read and what it could not, behind a key on the range row: each repository's
 * range, the commits it marks as large, and the modules it did not read. Nothing here is a count of
 * change: it says what the lists cover, so that a module that was not read never looks unchanged
 * (ADR 0045). The key names the vault it read in `data-vault-read` while the popover is closed.
 * @param props The answer, or undefined while there is none.
 * @param props.answer The footprint.
 * @returns The key and its popover.
 */
function FootprintFacts(props: {
	readonly answer: BranchFootprintAnswer | undefined;
}): JSX.Element {
	const { answer } = props;
	return (
		<Popover>
			<Popover.Trigger
				disabled={answer === undefined}
				aria-label="What the lists cover"
				data-slot="footprint-facts"
				data-vault-read={answer?.vaultRead.at}
				className={KEY}
			>
				<RiInformationLine aria-hidden="true" />
			</Popover.Trigger>
			<Popover.Content align="end" aria-labelledby={HEADING} className="w-96">
				<h3 id={HEADING} className="text-control font-semibold">
					What the lists cover
				</h3>
				{answer !== undefined && <FactLines answer={answer} />}
			</Popover.Content>
		</Popover>
	);
}

/**
 * The lines of the popover.
 * @param props The answer.
 * @param props.answer The footprint.
 * @returns The lines.
 */
function FactLines(props: { readonly answer: BranchFootprintAnswer }): JSX.Element {
	const { answer } = props;
	const large = answer.commits.filter((one) => one.large).length;
	return (
		<div className="text-body text-muted-foreground flex flex-col gap-1.5">
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

export { FootprintFacts };
