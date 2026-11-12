// The entry of the check action: register the checkouts, run `archboard check`, then annotate the
// pull request, write the job summary and the outputs, and fail the step as `fail-on` says.
// Node runs this file as it is. It reads its inputs from the environment the action sets.
/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { annotationsForAll } from "./annotations.ts";
import { collectFindings, countFindings } from "./findings.ts";
import type { CheckReading, Finding } from "./findings.ts";
import type { FailOn } from "./outcome.ts";
import { countBlocking, decideOutcome, parseAllowCodes, parseFailOn } from "./outcome.ts";
import type { Outcome } from "./outcome.ts";
import { checkSummary } from "./summary.ts";
import type { Locations } from "./evidence.ts";
import { splitArguments, inputLines } from "../shared/arguments.ts";
import { cachedFileReader, checkoutRoots } from "../shared/checkouts.ts";
import { input, parseJson, run } from "../shared/process.ts";
import {
	ANNOTATION_LIMIT_PER_LEVEL,
	annotationLine,
	outputLines,
} from "../shared/workflow-commands.ts";

const CHECKS = ["all", "semantics", "code", "embeds"];

/**
 * Register the checkouts a check reads. A binding names a repository by identity, so a platform
 * setup with the infrastructure in another checkout needs that checkout registered.
 * @param cli The archboard program.
 * @param directories The checkouts, the working directory first.
 * @returns The first refusal's message, or undefined when all were registered.
 */
function registerCheckouts(cli: string, directories: readonly string[]): string | undefined {
	for (const directory of directories) {
		const result = run(cli, ["repo", "add", directory]);
		if (result.exitCode !== 0)
			return `archboard repo add ${directory} failed: ${result.stderr.trim()}`;
	}
	return undefined;
}

/**
 * The checkout the embeds check read, which is the one that holds the vault.
 * @param answer The answer of the check.
 * @returns Its path, when the embeds check ran.
 */
function embedsCheckout(answer: CheckReading | undefined): string | undefined {
	return answer?.embeds?.checkout;
}

/**
 * The root of the checkout that holds the working directory: the repository that the pull
 * request belongs to. A directory outside Git is its own root.
 * @param directory The working directory.
 * @returns The root.
 */
function repositoryRoot(directory: string): string {
	const top = run("git", ["-C", directory, "rev-parse", "--show-toplevel"]);
	return top.exitCode === 0 && top.stdout.trim() !== "" ? resolve(top.stdout.trim()) : directory;
}

/**
 * Where files are on this machine, from the registered checkouts.
 * @param cli The archboard program.
 * @param workspace GITHUB_WORKSPACE.
 * @param directory The working directory.
 * @param answer The answer of the check.
 * @returns The locations.
 */
function locate(
	cli: string,
	workspace: string,
	directory: string,
	answer: CheckReading | undefined,
): Locations {
	const list = run(cli, ["repo", "list"], { cwd: directory });
	const repository = repositoryRoot(directory);
	return {
		workspace,
		repository,
		roots: checkoutRoots(parseJson(list.stdout), repository),
		vault: answer?.vault?.path,
		home: embedsCheckout(answer) ?? directory,
		files: cachedFileReader(),
	};
}

/**
 * Print the annotations of the findings.
 * @param findings The findings.
 * @param locations Where files are on this machine.
 * @returns How many annotations GitHub will not show.
 */
function printAnnotations(findings: readonly Finding[], locations: Locations): number {
	const { kept, dropped } = annotationsForAll(findings, locations);
	for (const annotation of kept) {
		process.stdout.write(
			`${annotationLine(annotation.level, annotation.properties, annotation.message)}\n`,
		);
	}
	return dropped;
}

/**
 * Write the job summary and the outputs.
 * @param report The saved answer.
 * @param exitCode The exit status of the check.
 * @param findings The findings.
 * @param summary The job summary.
 */
function publish(
	report: string,
	exitCode: number,
	findings: readonly Finding[],
	summary: string,
): void {
	const counts = countFindings(findings);
	const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
	if (summaryFile !== undefined && summaryFile !== "") appendFileSync(summaryFile, `${summary}\n`);
	const outputFile = process.env["GITHUB_OUTPUT"];
	if (outputFile !== undefined && outputFile !== "") {
		appendFileSync(
			outputFile,
			outputLines({
				"exit-code": String(exitCode),
				errors: String(counts.errors),
				warnings: String(counts.warnings),
				information: String(counts.information),
				report,
			}),
		);
	}
}

/** What the action was asked to do, from its inputs. */
interface Request {
	readonly cli: string;
	readonly workspace: string;
	readonly directory: string;
	readonly checks: string;
	readonly args: readonly string[];
	readonly failOn: FailOn;
	readonly allowed: ReadonlySet<string>;
	readonly extraCheckouts: readonly string[];
}

/**
 * Read and validate the inputs.
 * @returns The request.
 * @throws {Error} When an input has a value the action does not accept.
 */
function readRequest(): Request {
	const workspace = resolve(input("GITHUB_WORKSPACE", process.cwd()));
	const checks = input("ARCHBOARD_INPUT_CHECKS", "all");
	if (!CHECKS.includes(checks))
		throw new Error(`checks is "${checks}". Use one of ${CHECKS.join(", ")}.`);
	return {
		cli: input("ARCHBOARD_BIN", "archboard"),
		workspace,
		directory: resolve(workspace, input("ARCHBOARD_INPUT_WORKING_DIRECTORY", ".")),
		checks,
		args: splitArguments(input("ARCHBOARD_INPUT_ARGS", "")),
		failOn: parseFailOn(input("ARCHBOARD_INPUT_FAIL_ON", "warning")),
		allowed: parseAllowCodes(input("ARCHBOARD_INPUT_ALLOW_CODES", "")),
		extraCheckouts: inputLines(input("ARCHBOARD_INPUT_REPOS", "")).map((path) =>
			resolve(workspace, path),
		),
	};
}

/**
 * Decide whether the step fails. Checks that read a vault, in a checkout without one, could not
 * run: the CLI skips them and exits 0, and no configuration forgives that.
 * @param exitCode The exit status of the check.
 * @param request What the action was asked to do.
 * @param answer The answer of the check, when it printed one.
 * @param findings Its findings.
 * @returns Whether to fail, and why.
 */
function outcomeOf(
	exitCode: number,
	request: Request,
	answer: CheckReading | undefined,
	findings: readonly Finding[],
): Outcome {
	if (answer?.skipped !== undefined) {
		const reason = `${answer.skipped.message} Commit the vault, or set checks to embeds.`;
		return { failed: true, reason };
	}
	const { allowed } = request;
	const blocking =
		answer === undefined || allowed.size === 0 ? undefined : countBlocking(findings, allowed);
	return decideOutcome(exitCode, request.failOn, blocking);
}

/**
 * Check, annotate and report.
 * @param request What the action was asked to do.
 * @returns The exit status of this step.
 */
function execute(request: Request): number {
	const { cli, workspace, directory, allowed } = request;
	const refusal = registerCheckouts(cli, [directory, ...request.extraCheckouts]);
	if (refusal !== undefined) throw new Error(refusal);

	const result = run(cli, ["check", request.checks, ...request.args], { cwd: directory });
	process.stderr.write(result.stderr);
	const report = join(input("RUNNER_TEMP", tmpdir()), "archboard-check.json");
	mkdirSync(join(report, ".."), { recursive: true });
	writeFileSync(report, result.stdout);

	const answer: CheckReading | undefined = parseJson(result.stdout);
	const findings = answer === undefined ? [] : collectFindings(answer);
	const locations = locate(cli, workspace, directory, answer);
	const dropped = printAnnotations(findings, locations);
	const outcome = outcomeOf(result.exitCode, request, answer, findings);
	reportOutcome(outcome, result.exitCode, answer === undefined, dropped);
	publish(
		report,
		result.exitCode,
		findings,
		checkSummary({ answer, findings, outcome, locations, allowed }),
	);
	return outcome.failed ? 1 : 0;
}

/**
 * Run the check from the action's inputs, and stop the server it started, whatever happens.
 * @returns The exit status of this step.
 */
function main(): number {
	const request = readRequest();
	try {
		return execute(request);
	} finally {
		run(request.cli, ["stop"], { cwd: request.directory });
	}
}

/**
 * Say in the log why the step passes or fails, and what could not be shown.
 * @param outcome The decision.
 * @param exitCode The exit status of the check.
 * @param unreadable Whether the command printed no answer to read.
 * @param dropped How many annotations GitHub will not show.
 */
function reportOutcome(
	outcome: Outcome,
	exitCode: number,
	unreadable: boolean,
	dropped: number,
): void {
	if (dropped > 0) {
		process.stdout.write(
			`::notice::GitHub shows ${String(ANNOTATION_LIMIT_PER_LEVEL)} annotations of each level. ${String(dropped)} annotations were omitted; the saved JSON report contains all findings.\n`,
		);
	}
	if (outcome.failed) {
		process.stdout.write(
			`${annotationLine("error", { title: "archboard check" }, outcome.reason)}\n`,
		);
	} else if (exitCode !== 0) {
		process.stdout.write(
			`${annotationLine("notice", { title: "archboard check" }, outcome.reason)}\n`,
		);
	}
	if (unreadable && exitCode < 2)
		process.stdout.write("::warning::archboard check printed no JSON answer to read.\n");
}

try {
	process.exitCode = main();
} catch (error) {
	process.stdout.write(
		`${annotationLine("error", { title: "archboard check" }, error instanceof Error ? error.message : String(error))}\n`,
	);
	process.exitCode = 2;
}
