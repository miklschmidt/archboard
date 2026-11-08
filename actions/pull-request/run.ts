// The entry of the pull request action. It draws the architecture at the base and at the head of
// the pull request, reads the proposal, its plan and its footprint, keeps one comment on the pull
// request up to date, and fails the step when the configuration says changes outside the plan
// block. Only existing CLI commands read the architecture: `model proposals`, `model read`,
// `model footprint` and `model render`. Node runs this file as it is.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { appendFileSync, existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { noVaultComment, planProblem, pullRequestComment } from "./comment.ts";
import type { PullRequestReport } from "./comment.ts";
import { addWorktree, archboard, firstLine, readContext } from "./context.ts";
import type { Context } from "./context.ts";
import { readFootprint } from "./footprint.ts";
import { publicationProblem, upsertComment } from "./github.ts";
import type { PostResult } from "./github.ts";
import { folderUrl } from "./links.ts";
import { parseBodyMarker } from "./marker.ts";
import { makePictures } from "./pictures.ts";
import type { Trees } from "./pictures.ts";
import { chooseState, decideOutOfPlan } from "./plan.ts";
import type { ModelState, StateChoice } from "./plan.ts";
import { proposalPlan } from "./proposal-plan.ts";
import type { Buckets, ModelReading, ProposalPlan } from "./proposal-plan.ts";
import { input, parseJson, run } from "../shared/process.ts";
import { annotationLine } from "../shared/workflow-commands.ts";

/** A diagnostic of a refusal of `model proposals`. */
interface ProposalsDiagnostic {
	readonly code?: string;
	readonly file?: string;
	readonly message?: string;
}

/** What `model proposals` says that this action reads. */
interface ProposalsReading {
	readonly success?: boolean;
	readonly code?: string;
	readonly error?: string;
	readonly diagnostics?: readonly ProposalsDiagnostic[];
	readonly states?: readonly ModelState[];
	readonly vault?: { readonly path: string };
}

/** The plan of a pull request with no proposal. */
const NO_PLAN: ProposalPlan = { comparison: [], named: new Map(), baseOnlyBindings: new Set() };

/**
 * Read one complete model, keeping a refusal distinct from an empty architecture.
 * @param context The run.
 * @param directory The vault to read.
 * @param state The state, or Current when absent.
 * @returns The model only when the command succeeded with a model reading.
 */
function readModel(
	context: Context,
	directory: string,
	state?: ModelState,
): ModelReading | undefined {
	const result = archboard(context, directory, [
		"model",
		"read",
		...(state === undefined ? [] : ["--state", state.id]),
	]);
	const model: ModelReading | undefined = parseJson(result.stdout);
	return result.exitCode === 0 && model?.modules !== undefined ? model : undefined;
}

/**
 * The plan of the proposal: what it changes against the base's Current, as the pictures show.
 * @param context The run.
 * @param trees Where the base's and the head's vaults are.
 * @param state The proposal, if the pull request carries one.
 * @returns The plan, empty for no proposal, or why the comparison could not be read.
 */
function readPlan(
	context: Context,
	trees: Trees,
	state: ModelState | undefined,
): { plan: ProposalPlan; note?: string } {
	if (state === undefined) return { plan: NO_PLAN };
	const base = readModel(context, trees.baseDir);
	const head = readModel(context, trees.headDir, state);
	if (base === undefined || head === undefined) {
		const note =
			"The proposal could not be compared: a model could not be read at the base or the head.";
		return { plan: NO_PLAN, note };
	}
	return { plan: proposalPlan(base, head) };
}

/**
 * Put the plan check in the log as an annotation.
 * @param report The report.
 */
function annotatePlan(report: PullRequestReport): void {
	annotateUnavailable(report);
	const outside = report.buckets?.outsidePlan ?? [];
	const text = `${String(outside.length)} module(s) changed outside the plan: ${outside.join(", ")}.`;
	const levels = { warn: "warning", fail: "error", overridden: "notice" } as const;
	const status = report.outOfPlan.status;
	if (status === "warn" || status === "fail" || status === "overridden") {
		process.stdout.write(`${annotationLine(levels[status], { title: "Archboard plan" }, text)}\n`);
	}
}

/**
 * Why the plan could not be checked, first reason first.
 * @param report The report.
 * @returns A sentence.
 */
function uncheckedReason(report: PullRequestReport): string {
	return (
		planProblem(report.choice) ??
		report.comparisonNote ??
		report.footprintNote ??
		"The plan could not be checked."
	);
}

/**
 * Make an unavailable plan check visible in the workflow log.
 * @param report The report.
 */
function annotateUnavailable(report: PullRequestReport): void {
	const { status, failed } = report.outOfPlan;
	if (status !== "unjudged" && status !== "unjudged-overridden") return;
	const level = failed ? "error" : "warning";
	process.stdout.write(
		`${annotationLine(level, { title: "Archboard plan" }, uncheckedReason(report))}\n`,
	);
}

/**
 * Write the comment to the job summary, where it stays when the comment cannot be posted.
 * @param markdown The comment.
 */
function writeSummary(markdown: string): void {
	const summary = input("GITHUB_STEP_SUMMARY", "");
	if (summary !== "") appendFileSync(summary, `${markdown}\n`);
}

/**
 * Register the checkouts that the vault's bindings name.
 * @param context The run.
 * @returns A message when a checkout could not be registered.
 */
function registerCheckouts(context: Context): string | undefined {
	for (const directory of [context.directory, ...context.extraCheckouts]) {
		const result = run(context.cli, ["repo", "add", directory]);
		if (result.exitCode !== 0) {
			return `archboard repo add ${directory} failed: ${firstLine(result.stderr)}`;
		}
	}
	return undefined;
}

/**
 * Judge the footprint against the plan.
 * @param context The run.
 * @param choice The proposal, or why there is none.
 * @param buckets The footprint, if it was read.
 * @returns The decision.
 */
function judge(context: Context, choice: StateChoice, buckets: Buckets | undefined) {
	// A proposal that the pull request names and the model lacks, several drafts and no name, or
	// proposals that cannot be read: each is a plan that cannot be checked.
	const unchecked = planProblem(choice) !== undefined;
	return decideOutOfPlan({
		mode: context.mode,
		hasProposal: choice.state !== undefined || unchecked,
		judgeable: buckets !== undefined && !unchecked,
		outside: buckets?.outsidePlan ?? [],
		labels: context.labels,
		overrideLabel: context.overrideLabel,
	});
}

/**
 * The address of the vault folder on GitHub at the head commit.
 * @param context The run.
 * @param trees Where the head's vault is.
 * @param vault The vault's path in the head checkout, as `model proposals` names it.
 * @returns The address, or undefined when the answer named no vault.
 */
function vaultAddress(
	context: Context,
	trees: Trees,
	vault: string | undefined,
): string | undefined {
	return vault === undefined
		? undefined
		: folderUrl(context.hosting, context.headSha, relative(trees.headRoot, vault));
}

/**
 * Build the report of a pull request.
 * @param context The run.
 * @param trees Where the base's and the head's vaults are.
 * @param proposals What `model proposals` said at the head.
 * @returns The report.
 */
async function buildReport(
	context: Context,
	trees: Trees,
	proposals: ProposalsReading,
): Promise<PullRequestReport> {
	const choice = chooseState(
		context.stateInput,
		parseBodyMarker(context.body),
		proposals.states ?? [],
	);
	const { plan, note } = readPlan(context, trees, choice.state);
	const footprint =
		note !== undefined
			? { note: "The footprint was not judged because the proposal could not be compared." }
			: readFootprint(context, trees.headDir, choice.state, plan);
	// The pictures replace those of older heads, so a run of an older head never pushes them.
	const problem = await publicationProblem(context.access, context.number, context.headSha);
	const pictures =
		problem === undefined ? await makePictures(context, trees, choice.state) : { note: problem };
	return {
		baseSha: context.baseSha,
		headSha: context.headSha,
		choice,
		comparison: plan.comparison,
		comparisonNote: note,
		buckets: footprint.buckets,
		footprintNote: footprint.note,
		before: pictures.before,
		after: pictures.after,
		picturesNote: pictures.note,
		outOfPlan: judge(context, choice, footprint.buckets),
		overrideLabel: context.overrideLabel,
		mapUrl: pictures.after?.light,
		vaultUrl: vaultAddress(context, trees, proposals.vault?.path),
	};
}

/**
 * Post the comment, unless a later push moved the pull request on, and say so when it cannot be
 * posted.
 * @param context The run.
 * @param report The report.
 */
async function postComment(context: Context, report: PullRequestReport): Promise<void> {
	const result = await upsertComment(
		context.access,
		context.number,
		pullRequestComment(report),
		context.headSha,
	);
	reportPost(result);
}

/**
 * Say what came of the comment when it was not posted.
 * @param result What posting it came to.
 */
function reportPost(result: PostResult): void {
	if ("failure" in result) warnUnposted(result.failure);
	if ("stopped" in result) process.stdout.write(`::notice::${result.stopped}\n`);
}

/**
 * Say that GitHub refused the comment.
 * @param failure Why.
 */
function warnUnposted(failure: string): void {
	const text = `The comment was not posted: ${failure}. The report is in the job summary.`;
	process.stdout.write(`${annotationLine("warning", { title: "Archboard" }, text)}\n`);
}

/**
 * Remove the commits checked out beside the workspace, and the checkouts the CLI registered for them.
 * @param context The run.
 */
function cleanUp(context: Context): void {
	for (const name of ["base", "head"]) {
		const folder = join(context.scratch, name);
		run(context.cli, ["repo", "forget", folder], { cwd: context.directory });
		run("git", ["-C", context.directory, "worktree", "remove", "--force", folder]);
	}
	run(context.cli, ["stop"], { cwd: context.directory });
	rmSync(context.scratch, { recursive: true, force: true });
}

/**
 * The report of a pull request whose proposals at the head could not be read. It replaces an
 * earlier comment, so a report of an older head never stands for this one, and in fail mode it
 * fails the step, as any plan that cannot be checked does.
 * @param context The run.
 * @param reason Why the proposals could not be read.
 * @returns The report.
 */
function unreadableReport(context: Context, reason: string): PullRequestReport {
	const choice = { source: "unreadable", reason } as const;
	return {
		baseSha: context.baseSha,
		headSha: context.headSha,
		choice,
		comparison: [],
		picturesNote: "No picture was drawn, because the proposals could not be read.",
		outOfPlan: judge(context, choice, undefined),
		overrideLabel: context.overrideLabel,
	};
}

/**
 * Why `model proposals` gave no usable answer: the refusal it printed with its first diagnostic,
 * else its first line on standard error.
 * @param answer The answer, when it printed one.
 * @param stderr What it wrote on standard error.
 * @returns The reason, without a closing period.
 */
function refusalOf(answer: ProposalsReading | undefined, stderr: string): string {
	if (answer?.code === undefined) return withoutPeriod(firstLine(stderr));
	const error = answer.error === undefined ? "" : `: ${withoutPeriod(answer.error)}`;
	return `${answer.code}${error}${diagnosticDetail(answer.diagnostics?.[0])}`;
}

/**
 * A diagnostic of a refusal, in brackets.
 * @param diagnostic The diagnostic, if any.
 * @returns Its code, file and first line of message, or an empty string.
 */
function diagnosticDetail(diagnostic: ProposalsDiagnostic | undefined): string {
	if (diagnostic?.message === undefined) return "";
	const where = [diagnostic.code, diagnostic.file].filter(Boolean).join(" in ");
	return ` (${where === "" ? "" : `${where}: `}${withoutPeriod(firstLine(diagnostic.message))})`;
}

/**
 * A text without its closing period, to be placed inside a sentence.
 * @param text The text.
 * @returns The text.
 */
function withoutPeriod(text: string): string {
	return text.replace(/\.$/u, "");
}

/**
 * Say that the head holds no vault, and replace an earlier comment so that its report of an older
 * head never stands for this one.
 * @param context The run.
 */
async function reportNoVault(context: Context): Promise<void> {
	process.stdout.write(
		"::notice::The head commit holds no Archboard vault, so there is nothing to report.\n",
	);
	const comment = noVaultComment(context.headSha);
	writeSummary(comment);
	const result = await upsertComment(
		context.access,
		context.number,
		comment,
		context.headSha,
		false,
	);
	reportPost(result);
}

/**
 * Report on the pull request, with the commits checked out.
 * @param context The run.
 * @param trees Where the base's and the head's vaults are.
 * @returns The exit status of this step.
 */
async function reportOn(context: Context, trees: Trees): Promise<number> {
	// A checkout uses only the vault at its root, so without one there is nothing to report.
	if (!existsSync(join(trees.headRoot, ".archboard", "vault"))) {
		await reportNoVault(context);
		return 0;
	}
	const result = archboard(context, trees.headDir, ["model", "proposals"]);
	const answer: ProposalsReading | undefined = parseJson(result.stdout);
	const report =
		result.exitCode !== 0 || answer === undefined || answer.success === false
			? unreadableReport(context, refusalOf(answer, result.stderr))
			: await buildReport(context, trees, answer);
	annotatePlan(report);
	writeSummary(pullRequestComment(report));
	await postComment(context, report);
	return report.outOfPlan.failed ? 1 : 0;
}

/**
 * Report on the pull request.
 * @returns The exit status of this step.
 */
async function main(): Promise<number> {
	const context = await readContext();
	const refusal = registerCheckouts(context);
	if (refusal !== undefined) throw new Error(refusal);
	try {
		return await reportOn(context, {
			baseDir: addWorktree(context, "base", context.baseSha),
			headDir: addWorktree(context, "head", context.headSha),
			headRoot: join(context.scratch, "head"),
		});
	} finally {
		cleanUp(context);
	}
}

try {
	process.exitCode = await main();
} catch (error) {
	const text = error instanceof Error ? error.message : String(error);
	process.stdout.write(`${annotationLine("error", { title: "Archboard" }, text)}\n`);
	process.exitCode = 2;
}
