// The entry of the pull request action. It draws the architecture at the base and at the head of
// the pull request, reads the proposal, its plan and its footprint, keeps one comment on the pull
// request up to date, and fails the step when the configuration says changes outside the plan
// block. Only existing CLI commands read the architecture: `model proposals`, `model read`,
// `model footprint` and `model render`. Node runs this file as it is.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { appendFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { pullRequestComment } from "./comment.ts";
import type { PullRequestReport } from "./comment.ts";
import { addWorktree, archboard, firstLine, readContext } from "./context.ts";
import type { Context } from "./context.ts";
import { upsertComment } from "./github.ts";
import { folderUrl } from "./links.ts";
import { parseBodyMarker } from "./marker.ts";
import { makePictures } from "./pictures.ts";
import type { Trees } from "./pictures.ts";
import { chooseState, decideOutOfPlan } from "./plan.ts";
import type { ModelState } from "./plan.ts";
import { planBuckets, proposalPlan } from "./proposal-plan.ts";
import type { Buckets, FootprintReading, ModelReading, ProposalPlan } from "./proposal-plan.ts";
import { input, parseJson, run } from "../shared/process.ts";
import { annotationLine } from "../shared/workflow-commands.ts";

/** What `model proposals` says that this action reads. */
interface ProposalsReading {
	readonly states?: readonly ModelState[];
	readonly vault?: { readonly path: string };
}

/**
 * The footprint of the pull request, from `model footprint`.
 * @param context The run.
 * @param headDir The vault at the head.
 * @param state The proposal, if the pull request carries one. Its bindings place the changes.
 * @param plan The proposal's plan.
 * @returns The buckets, or the reason there are none.
 */
function readFootprint(
	context: Context,
	headDir: string,
	state: ModelState | undefined,
	plan: ProposalPlan,
): { buckets?: Buckets; note?: string } {
	const result = archboard(context, headDir, [
		"model",
		"footprint",
		"--base",
		footprintBase(context),
		...(state === undefined ? [] : ["--state", state.id]),
	]);
	const answer: FootprintReading | undefined = parseJson(result.stdout);
	if (result.exitCode !== 0 || answer === undefined) {
		return { note: `The footprint could not be read: ${firstLine(result.stderr)}` };
	}
	return { buckets: planBuckets(answer, plan.named) };
}

/**
 * The ref that the footprint counts from. Every registered repository reads the same --base, and
 * only this one holds the pull request's commits. The base branch's remote ref exists in each
 * checkout that CI fetched in full. Without --head, each checkout counts up to its own HEAD: this
 * one's is the head commit.
 * @param context The run.
 * @returns The base branch's remote ref, else the base commit.
 */
function footprintBase(context: Context): string {
	return context.baseRef === undefined ? context.baseSha : `origin/${context.baseRef}`;
}

/** The plan of a pull request with no proposal. */
const NO_PLAN: ProposalPlan = { comparison: [], named: new Map() };

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
 * Make an unavailable plan check visible in the workflow log.
 * @param report The report.
 */
function annotateUnavailable(report: PullRequestReport): void {
	if (report.outOfPlan.status !== "unjudged") return;
	const text = report.comparisonNote ?? report.footprintNote ?? "The plan could not be checked.";
	process.stdout.write(`${annotationLine("warning", { title: "Archboard plan" }, text)}\n`);
}

/**
 * Write the comment to the job summary, where it stays when the comment cannot be posted.
 * @param report The report.
 */
function writeSummary(report: PullRequestReport): void {
	const summary = input("GITHUB_STEP_SUMMARY", "");
	if (summary !== "") appendFileSync(summary, `${pullRequestComment(report)}\n`);
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
 * @param state The proposal, if any.
 * @param buckets The footprint, if it was read.
 * @returns The decision.
 */
function judge(context: Context, state: ModelState | undefined, buckets: Buckets | undefined) {
	return decideOutOfPlan({
		mode: context.mode,
		hasProposal: state !== undefined,
		footprintRead: buckets !== undefined,
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
function buildReport(
	context: Context,
	trees: Trees,
	proposals: ProposalsReading,
): PullRequestReport {
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
	const pictures = makePictures(context, trees, choice.state);
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
		outOfPlan: judge(context, choice.state, footprint.buckets),
		overrideLabel: context.overrideLabel,
		mapUrl: pictures.after?.light,
		vaultUrl: vaultAddress(context, trees, proposals.vault?.path),
	};
}

/**
 * Post the comment, and say so when it cannot be posted.
 * @param context The run.
 * @param report The report.
 */
async function postComment(context: Context, report: PullRequestReport): Promise<void> {
	const result = await upsertComment(context.access, context.number, pullRequestComment(report));
	if ("failure" in result) {
		const text = `The comment was not posted: ${result.failure}. The report is in the job summary.`;
		process.stdout.write(`${annotationLine("warning", { title: "Archboard" }, text)}\n`);
	}
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
 * Report on the pull request, with the commits checked out.
 * @param context The run.
 * @param trees Where the base's and the head's vaults are.
 * @returns The exit status of this step.
 */
async function reportOn(context: Context, trees: Trees): Promise<number> {
	const answer: ProposalsReading | undefined = parseJson(
		archboard(context, trees.headDir, ["model", "proposals"]).stdout,
	);
	if (answer === undefined) {
		process.stdout.write(
			"::notice::The head commit holds no Archboard vault, so there is nothing to report.\n",
		);
		return 0;
	}
	const report = buildReport(context, trees, answer);
	annotatePlan(report);
	writeSummary(report);
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
