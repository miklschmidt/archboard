// What the grader is shown about one run, and nothing that says which skill
// version produced it: anonymous ids, the request and its sources, the saved
// boards before and after, the renders, the deterministic verdicts, and the
// commands the author ran without what they printed, since a printed SKILL.md
// would be the unblinding.

import { createHash } from "node:crypto";
import path from "node:path";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import type { ClassifiedCommand, Usage } from "@/runtime/skill-evaluation/lib/events";
import type { CheckVerdict, Reading } from "@/runtime/skill-evaluation/lib/reading";
import type { Scenario } from "@/runtime/skill-evaluation/lib/suite";

type Arm = "baseline" | "candidate";
type RunStatus = "completed" | "failed" | "timed-out" | "cancelled";

/** One finished author run, as the harness keeps it (with its arm). */
interface CompletedRun {
	readonly arm: Arm;
	readonly scenario: Scenario;
	readonly repetition: number;
	readonly status: RunStatus;
	readonly exitCode: number | null;
	readonly durationMs: number;
	readonly finalMessage: string | null;
	readonly usage: Usage | null;
	readonly commands: readonly ClassifiedCommand[];
	readonly boards: ReadonlyMap<string, SemanticBoard>;
	readonly snapshot: ReadonlyMap<string, SemanticBoard>;
	readonly policy: Reading["policy"] | null;
	readonly inspections: Reading["inspections"];
	readonly renders: readonly {
		readonly board: string;
		readonly variant?: string | undefined;
		readonly view?: string | undefined;
		readonly file?: string | undefined;
	}[];
	readonly outcomes: readonly CheckVerdict[];
	readonly guardrails: readonly CheckVerdict[];
	/** Paths that must not reach the grader as themselves: the home, the skill root, the vault. */
	readonly privatePaths: readonly string[];
}

/** What the grader receives for one run. */
interface RunBundle {
	readonly run: string;
	readonly scenario: string;
	readonly revision: string;
	readonly prompt: string;
	readonly sources: readonly string[];
	readonly expectedFeatures: Scenario["expectedFeatures"];
	readonly status: RunStatus;
	readonly finalMessage: string | null;
	readonly boardsBefore: Record<string, SemanticBoard>;
	readonly boardsAfter: Record<string, SemanticBoard>;
	readonly policy: Reading["policy"] | null;
	readonly inspections: Reading["inspections"];
	readonly renders: readonly {
		readonly board: string;
		readonly variant: string | null;
		readonly view: string | null;
		readonly file: string | null;
	}[];
	readonly harnessOutcomes: readonly CheckVerdict[];
	readonly harnessGuardrails: readonly CheckVerdict[];
	readonly commands: readonly {
		readonly class: string;
		readonly command: string;
		readonly exitCode: number | null;
	}[];
}

/**
 * A stable anonymous id for one run of one batch. Two batches with different
 * salts never share ids, and nothing about the arm survives the hash.
 * @param salt The batch's salt.
 * @param arm Which skill version ran.
 * @param scenario The scenario id.
 * @param repetition The repetition number.
 * @returns An id of the form run-xxxxxxxxxx.
 */
function anonymousRunId(salt: string, arm: Arm, scenario: string, repetition: number): string {
	return `run-${createHash("sha256").update(`${salt}\n${arm}\n${scenario}\n${repetition}`).digest("hex").slice(0, 10)}`;
}

/**
 * Text with every private path replaced by a neutral placeholder.
 * @param text The text.
 * @param privatePaths The paths, longest first so a prefix does not eat a longer path.
 * @returns The redacted text.
 */
function redacted(text: string, privatePaths: readonly string[]): string {
	return [...privatePaths]
		.toSorted((a, b) => b.length - a.length)
		.reduce(
			(current, privatePath, index) => current.replaceAll(privatePath, `<private-${index}>`),
			text,
		);
}

/**
 * The grader's view of one run.
 * @param run The run with its arm.
 * @param id Its anonymous id.
 * @returns The bundle, with the arm withheld and private paths redacted.
 */
function bundleForGrader(run: CompletedRun, id: string): RunBundle {
	/**
	 * Text with this run's private paths redacted.
	 * @param text The text.
	 * @returns The redacted text.
	 */
	const hide = (text: string): string => redacted(text, run.privatePaths);
	return {
		run: id,
		scenario: run.scenario.id,
		revision: run.scenario.flask,
		prompt: run.scenario.prompt,
		sources: run.scenario.sources,
		expectedFeatures: run.scenario.expectedFeatures,
		status: run.status,
		finalMessage: run.finalMessage === null ? null : hide(run.finalMessage),
		boardsBefore: Object.fromEntries(run.snapshot),
		boardsAfter: Object.fromEntries(run.boards),
		policy: run.policy,
		inspections: run.inspections.map((inspection) => ({
			...inspection,
			detail: hide(inspection.detail),
		})),
		renders: run.renders.map((render) => ({
			board: render.board,
			variant: render.variant ?? null,
			view: render.view ?? null,
			file: render.file === undefined ? null : `renders/${path.basename(render.file)}`,
		})),
		harnessOutcomes: run.outcomes.map((verdict) => ({ ...verdict, detail: hide(verdict.detail) })),
		harnessGuardrails: run.guardrails.map((verdict) => ({
			...verdict,
			detail: hide(verdict.detail),
		})),
		commands: run.commands.map((command) => ({
			class: command.class,
			command: hide(command.command),
			exitCode: command.exitCode,
		})),
	};
}

export {
	anonymousRunId,
	bundleForGrader,
	redacted,
	type Arm,
	type CompletedRun,
	type RunBundle,
	type RunStatus,
};
