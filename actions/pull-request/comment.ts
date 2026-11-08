// The text of the pull request's sticky comment, in Markdown. Pure: the entry gathers the facts
// and these functions only write them down.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { COMMENT_MARKER } from "./marker.ts";
import type { OutOfPlanDecision, StateChoice, StateSource } from "./plan.ts";
import type { Buckets } from "./proposal-plan.ts";

/** One picture, in the themes it was drawn in, by the address it can be embedded from. */
interface PictureLinks {
	readonly light: string;
	readonly dark?: string | undefined;
}

/** Everything the comment says. */
interface PullRequestReport {
	readonly baseSha: string;
	readonly headSha: string;
	readonly choice: StateChoice;
	/** What the proposal changes, as phrases such as "modules: 2 added, 1 changed". */
	readonly comparison: readonly string[];
	/** Why the comparison is absent, when the proposal could not be compared. */
	readonly comparisonNote?: string | undefined;
	/** The footprint, or undefined when it could not be read. */
	readonly buckets?: Buckets | undefined;
	readonly footprintNote?: string | undefined;
	readonly before?: PictureLinks | undefined;
	readonly after?: PictureLinks | undefined;
	/** Why the pictures are absent or incomplete. */
	readonly picturesNote?: string | undefined;
	readonly outOfPlan: OutOfPlanDecision;
	readonly overrideLabel: string;
	/** The full-size picture of the architecture after the change. */
	readonly mapUrl?: string | undefined;
	/** The vault folder on GitHub at the head commit. */
	readonly vaultUrl?: string | undefined;
}

const LISTED_NAMES = 30;

const SOURCE_WORDS: Readonly<Record<StateSource, string>> = {
	input: "named by the action's `state` input",
	"pr-body": "named by the `archboard-pr` marker of this pull request",
	"only-draft": "the only draft proposal of the model",
	none: "none",
	"several-drafts": "none",
	unknown: "none",
	unreadable: "none",
};

/**
 * A picture that follows the reader's colour scheme.
 * @param alt What the picture shows.
 * @param links The picture's addresses.
 * @returns HTML for a Markdown comment.
 */
function pictureHtml(alt: string, links: PictureLinks): string {
	const image = `<img src="${links.light}" alt="${alt}">`;
	if (links.dark === undefined) return image;
	return `<picture><source media="(prefers-color-scheme: dark)" srcset="${links.dark}">${image}</picture>`;
}

/**
 * A list of module names.
 * @param names The names.
 * @returns Markdown bullets, cut after a few dozen.
 */
function nameList(names: readonly string[]): string[] {
	const shown = names.slice(0, LISTED_NAMES).map((name) => `- ${name}`);
	return names.length > LISTED_NAMES
		? [...shown, `- and ${String(names.length - LISTED_NAMES)} more`]
		: shown;
}

/**
 * One footprint bucket.
 * @param title The bucket's name.
 * @param names Its modules.
 * @returns The Markdown lines.
 */
function bucket(title: string, names: readonly string[]): string[] {
	return [
		`**${title}** (${String(names.length)})`,
		"",
		...(names.length === 0 ? ["- none"] : nameList(names)),
		"",
	];
}

/**
 * The proposal's heading and what it says.
 * @param report The report.
 * @returns The Markdown lines.
 */
function proposalSection(report: PullRequestReport): string[] {
	const { state, source } = report.choice;
	if (state === undefined) return [noProposalText(report.choice), ""];
	return [
		`Proposal **${state.name}** (${SOURCE_WORDS[source]}).`,
		"",
		...(state.summary === undefined || state.summary === ""
			? []
			: [`> ${state.summary.replaceAll("\n", " ")}`, ""]),
		...(report.comparison.length === 0 ? [] : [`Changes: ${report.comparison.join("; ")}.`, ""]),
		...(report.comparisonNote === undefined ? [] : [report.comparisonNote, ""]),
	];
}

/**
 * Why the pull request has no proposal.
 * @param choice The choice of proposal.
 * @returns A sentence.
 */
function noProposalText(choice: StateChoice): string {
	return (
		planProblem(choice) ??
		"The pull request carries no proposal. The changed modules are listed without a plan."
	);
}

/**
 * Why the plan cannot be checked, when the choice of proposal is the reason: the pull request
 * names a proposal the model lacks, the model has several drafts and the pull request names none,
 * or the proposals could not be read.
 * @param choice The choice of proposal.
 * @returns A sentence, or undefined when the choice is no reason.
 */
function planProblem(choice: StateChoice): string | undefined {
	if (choice.source === "unreadable") {
		return `The proposals at the head commit could not be read, so the plan was not checked: ${choice.named ?? "no reason given"}.`;
	}
	if (choice.source === "unknown") {
		return `The pull request names the proposal "${choice.named ?? ""}", and the model at the head commit has no state by that identity or name.`;
	}
	if (choice.source === "several-drafts") {
		return "The model has several draft proposals and the pull request names none. Name one with the `archboard-pr` marker in the description, or with the action's `state` input.";
	}
	return undefined;
}

/**
 * The before and after pictures, stacked.
 * @param report The report.
 * @returns The Markdown lines.
 */
function picturesSection(report: PullRequestReport): string[] {
	const after =
		report.choice.state === undefined
			? "current architecture at the head"
			: `proposal "${report.choice.state.name}" at the head`;
	return [
		"### Before and after",
		"",
		...(report.picturesNote === undefined ? [] : [`_${report.picturesNote}_`, ""]),
		...(report.before === undefined
			? []
			: [
					`**Before:** current architecture at the base \`${report.baseSha.slice(0, 7)}\``,
					"",
					pictureHtml("Architecture before this pull request", report.before),
					"",
				]),
		...(report.after === undefined
			? []
			: [
					`**After:** ${after} \`${report.headSha.slice(0, 7)}\``,
					"",
					pictureHtml("Architecture after this pull request", report.after),
					"",
				]),
	];
}

/**
 * The footprint buckets, or why there are none.
 * @param report The report.
 * @returns The Markdown lines.
 */
function footprintSection(report: PullRequestReport): string[] {
	const heading = [
		"### Footprint",
		"",
		...(report.footprintNote === undefined ? [] : [report.footprintNote, ""]),
	];
	if (report.buckets === undefined)
		return report.footprintNote === undefined
			? [...heading, "The footprint was not read.", ""]
			: heading;
	if (report.choice.state === undefined) {
		return [...heading, ...bucket("Modules changed by this pull request", report.buckets.changed)];
	}
	return [
		...heading,
		...bucket("Planned and changed", report.buckets.plannedAndChanged),
		...bucket("Changed outside the plan", report.buckets.outsidePlan),
		...bucket("Planned but unchanged", report.buckets.plannedUnchanged),
	];
}

/**
 * A count of modules in words.
 * @param count The count.
 * @returns The phrase, such as "1 module" or "3 modules".
 */
function modules(count: number): string {
	return `${String(count)} module${count === 1 ? "" : "s"}`;
}

/**
 * What the plan check decided, in a sentence a reviewer can act on.
 * @param report The report.
 * @returns The Markdown lines, none when the check is off.
 */
function outOfPlanSection(report: PullRequestReport): string[] {
	const label = `\`${report.overrideLabel}\``;
	const outside = modules(report.buckets?.outsidePlan.length ?? 0);
	const by: Record<OutOfPlanDecision["status"], string> = {
		off: "",
		"no-proposal": "No proposal, so the changes are not judged against a plan.",
		unjudged: report.outOfPlan.failed
			? `The plan could not be checked, so this check fails. Add the label ${label} to let this pull request through.`
			: "The plan could not be checked.",
		"unjudged-overridden": `The plan could not be checked. The label ${label} lets this pull request through.`,
		"in-plan": "Every module the footprint found changed is in the plan.",
		warn: `${outside} changed outside the plan. The action warns only; set \`out-of-plan: fail\` to make it fail.`,
		fail: `${outside} changed outside the plan, so this check fails. Update the proposal to name them, or add the label ${label} to let this pull request through.`,
		overridden: `${outside} changed outside the plan. The label ${label} lets this pull request through.`,
	};
	return by[report.outOfPlan.status] === ""
		? []
		: ["### Plan", "", by[report.outOfPlan.status], ""];
}

/**
 * The links to the map.
 * @param report The report.
 * @returns The Markdown lines.
 */
function linksSection(report: PullRequestReport): string[] {
	const links = [
		...(report.mapUrl === undefined ? [] : [`[Open the map, full size](${report.mapUrl})`]),
		...(report.vaultUrl === undefined
			? []
			: [`[Browse the vault at the head commit](${report.vaultUrl})`]),
	];
	return links.length === 0 ? [] : [links.join(" · "), ""];
}

/**
 * The sticky comment.
 * @param report What the comment says.
 * @returns The comment's Markdown, starting with the hidden marker.
 */
function pullRequestComment(report: PullRequestReport): string {
	return [
		COMMENT_MARKER,
		"## Architecture",
		"",
		...proposalSection(report),
		...picturesSection(report),
		...linksSection(report),
		...footprintSection(report),
		...outOfPlanSection(report),
	].join("\n");
}

export { planProblem, pullRequestComment, type PictureLinks, type PullRequestReport };
