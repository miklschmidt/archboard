// The text of the pull request's sticky comment, in GitHub Markdown. Pure: the entry gathers the
// facts and these functions only write them down. Each list of modules or files folds into a
// disclosure, so a large pull request keeps a short comment.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { COMMENT_MARKER } from "./marker.ts";
import type { OutOfPlanDecision, StateChoice, StateSource } from "./plan.ts";
import type { Buckets, UnboundFile } from "./proposal-plan.ts";

/** Everything the comment says. */
interface PullRequestReport {
	readonly choice: StateChoice;
	/** What the proposal changes, as phrases such as "modules: 2 added, 1 changed". */
	readonly comparison: readonly string[];
	/** Why the comparison is absent, when the proposal could not be compared. */
	readonly comparisonNote?: string | undefined;
	/** The footprint, or undefined when it could not be read. */
	readonly buckets?: Buckets | undefined;
	readonly footprintNote?: string | undefined;
	readonly outOfPlan: OutOfPlanDecision;
	readonly overrideLabel: string;
	/** The vault folder on GitHub at the head commit. */
	readonly vaultUrl?: string | undefined;
}

const LISTED_ENTRIES = 30;

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
 * Text that GitHub shows as written, never as HTML. A module name comes from the pull request, so
 * a name such as `</details>` must not close the disclosure around it.
 * @param text The text.
 * @returns The text with `&`, `<` and `>` as entities.
 */
function plain(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * A list of entries.
 * @param entries The entries, as Markdown.
 * @returns Markdown bullets, cut after a few dozen.
 */
function entryList(entries: readonly string[]): string[] {
	const shown = entries.slice(0, LISTED_ENTRIES).map((entry) => `- ${entry}`);
	return entries.length > LISTED_ENTRIES
		? [...shown, `- and ${String(entries.length - LISTED_ENTRIES)} more`]
		: shown;
}

/**
 * One footprint group: a disclosure with the count in its summary, or one line when it is empty.
 * @param title The group's name.
 * @param entries Its entries, as Markdown.
 * @param open Whether the disclosure starts open.
 * @returns The Markdown lines.
 */
function bucket(title: string, entries: readonly string[], open = false): string[] {
	if (entries.length === 0) return [`${title}: none.`, ""];
	return [
		open ? "<details open>" : "<details>",
		`<summary>${title} (${String(entries.length)})</summary>`,
		"",
		...entryList(entries),
		"",
		"</details>",
		"",
	];
}

/**
 * A group of modules.
 * @param title The group's name.
 * @param names Its modules.
 * @param open Whether the disclosure starts open.
 * @returns The Markdown lines.
 */
function moduleBucket(title: string, names: readonly string[], open = false): string[] {
	return bucket(title, names.map(plain), open);
}

/**
 * Text as one Markdown code span, whatever it holds. The pull request's author names its files, so
 * a backtick or a line break in a name must not end the span or start formatting.
 * @param text The text.
 * @returns The code span.
 */
function codeSpan(text: string): string {
	const flat = text.replaceAll(/\r\n|\r|\n/gu, "\\n");
	const longest = Math.max(0, ...[...flat.matchAll(/`+/gu)].map(([run]) => run.length));
	const fence = "`".repeat(longest + 1);
	const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
	return `${fence}${pad}${flat}${pad}${fence}`;
}

/**
 * The changed files that no module is bound to, when there are any. A file names its repository
 * when the files are in more than one.
 * @param files The files.
 * @returns The Markdown lines, none when a module is bound to every changed file.
 */
function unboundBucket(files: readonly UnboundFile[]): string[] {
	if (files.length === 0) return [];
	const several = new Set(files.map(({ repo }) => repo)).size > 1;
	return bucket(
		"Changed files that no module is bound to",
		files.map(({ repo, path }) => (several ? `${codeSpan(path)} in ${repo}` : codeSpan(path))),
	);
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
		`Proposal **${plain(state.name)}** (${SOURCE_WORDS[source]}).`,
		"",
		...(state.summary === undefined || state.summary === ""
			? []
			: [`> ${plain(state.summary.replaceAll("\n", " "))}`, ""]),
		...(report.comparison.length === 0 ? [] : [`Changes: ${report.comparison.join("; ")}.`, ""]),
		...(report.comparisonNote === undefined ? [] : [plain(report.comparisonNote), ""]),
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
		return `The proposals at the head commit could not be read, so the plan was not checked: ${choice.reason ?? "no reason given"}.`;
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
 * The footprint buckets, or why there are none.
 * @param report The report.
 * @returns The Markdown lines.
 */
function footprintSection(report: PullRequestReport): string[] {
	const heading = [
		"### Footprint",
		"",
		...(report.footprintNote === undefined ? [] : [plain(report.footprintNote), ""]),
	];
	if (report.buckets === undefined)
		return report.footprintNote === undefined
			? [...heading, "The footprint was not read.", ""]
			: heading;
	if (report.choice.state === undefined) {
		return [
			...heading,
			...moduleBucket("Modules changed by this pull request", report.buckets.changed),
			...unboundBucket(report.buckets.unbound),
		];
	}
	// The plan check counts the modules changed outside the plan, so that group starts open.
	return [
		...heading,
		...moduleBucket("Changed outside the plan", report.buckets.outsidePlan, true),
		...moduleBucket("Planned and changed", report.buckets.plannedAndChanged),
		...moduleBucket("Planned but unchanged", report.buckets.plannedUnchanged),
		...unboundBucket(report.buckets.unbound),
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
 * The link to the vault.
 * @param report The report.
 * @returns The Markdown lines.
 */
function linksSection(report: PullRequestReport): string[] {
	return report.vaultUrl === undefined
		? []
		: [`[Browse the vault at the head commit](${report.vaultUrl})`, ""];
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
		...linksSection(report),
		...outOfPlanSection(report),
		...footprintSection(report),
	].join("\n");
}

/**
 * The comment that replaces an earlier report when the head commit holds no vault, so the report
 * of an older head never stands for this one.
 * @param headSha The head commit.
 * @returns The comment's Markdown.
 */
function noVaultComment(headSha: string): string {
	return [
		COMMENT_MARKER,
		"## Architecture",
		"",
		`The head commit ${headSha.slice(0, 7)} holds no Archboard vault, so there is nothing to report.`,
	].join("\n");
}

export { noVaultComment, planProblem, pullRequestComment, type PullRequestReport };
