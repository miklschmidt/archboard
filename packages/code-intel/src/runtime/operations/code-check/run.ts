// One run of the code check over a vault's boards (ADR 0046), with behind beside it (ADR 0045).
//
// It reads every board at its current variant, or at the draft `variant`
// names, and gives `boards`, `findings` and `skipped`. `everyDraft` reads every
// draft of every board instead, and a `variant` beside it is not read
// (TASK-488). Behind (TASK-369.02) reads the current variant of each board
// once, whatever the pass reads. A `variant` that names no draft on any board
// is refused with the drafts that exist. Each plan names a Terraform or
// OpenTofu plan JSON by its absolute path (TASK-367.17); one outside every
// registered checkout, one the check never reads or one that is not a plan
// JSON refuses the check, as `PLAN_REFUSED`, before the pass starts.

import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import {
	readBoardsToCheck,
	readEveryDraftToCheck,
	type NoSuchDraft,
} from "#runtime/operations/code-check/boards.ts";
import { checkCode } from "#runtime/operations/code-check/check.ts";
import { readPlans, type PlanRefused } from "#runtime/operations/code-check/plans.ts";

/** What one run reads: the vault, the draft to read where a board has one, the plans an agent named, and how to cancel. */
interface CodeCheckRequest {
	/** The vault whose boards the run reads, and the checkouts it reads them against. */
	readonly vault: string;
	readonly variant: string | undefined;
	/** Read every draft of every board, in place of `variant`. */
	readonly everyDraft: boolean;
	readonly plans: readonly string[];
	/** Cancels the run and every Git command it starts. */
	readonly signal: AbortSignal;
}

/** Why a run is refused before its pass starts: a draft no board has, or a plan the check does not read. */
interface CodeCheckRefusal {
	readonly code: NoSuchDraft["code"] | "PLAN_REFUSED";
	readonly error: string;
}

/** The code check, with the memory of behind that every run shares. */
interface CodeCheck {
	/**
	 * Run the code check over every board of the vault, at its current variant,
	 * the named draft or every draft, with behind beside it.
	 * @param request What to read, and the signal that cancels it.
	 * @returns The answer, or why the run is refused.
	 */
	run(request: CodeCheckRequest): Promise<CodeCheckAnswer | CodeCheckRefusal>;
}

/**
 * The refusal of a variant that names no draft.
 * @param refused The variant asked for and the drafts that exist.
 * @returns The refusal.
 */
function noSuchDraft(refused: NoSuchDraft): CodeCheckRefusal {
 return {code:refused.code,error:refused.diagnostics.map((item)=>`${item.message} ${item.recovery}`).join(" ")};
}

/**
 * The refusal of a plan the check does not read.
 * @param refused The plan and why.
 * @returns The refusal.
 */
function planRefused(refused: PlanRefused): CodeCheckRefusal {
	return {
		code: "PLAN_REFUSED",
		error:
			`The check does not read the plan ${JSON.stringify(refused.plan)}: ${refused.reason}. ` +
			"Name a plan JSON that terraform show -json or tofu show -json wrote inside the " +
			"checkout that holds the vault, or inside the chosen checkout of another repository, by its path. " +
			"archboard repo list shows which checkout is chosen.",
	};
}

/**
 * Create the code check. Its reading of behind keeps what it read, so one
 * check serves every run of a process.
 * @returns The code check.
 */
function createCodeCheck(): CodeCheck {
	return {
		/**
		 * Run the code check with behind beside it.
		 * @param request What to read, and the signal that cancels it.
		 * @returns The answer, or why the run is refused.
		 */
		async run(request) {
			const { vault } = request;
			const read = await (request.everyDraft ? readEveryDraftToCheck(vault) : readBoardsToCheck(vault, request.variant));
			if (!("ok" in read)) return noSuchDraft(read);
			const plans = await readPlans(vault, request.plans, request.signal);
			if (!plans.ok) return planRefused(plans);
   const code=await checkCode(vault,read.boards,request.signal,plans.plans);
			return CodeCheckAnswerSchema.parse({
				timings: code.timings,
				boards: [],
 models:read.boards.flatMap(({model})=>model===undefined?[]:[{model:model.manifest.id,state:model.selectedState?.id ?? null,revision:model.revision}]),
				findings: code.findings,
				skipped: [...read.skipped, ...code.skipped],
				behind: [],
			});
		},
	};
}

export { type CodeCheck, type CodeCheckRefusal, type CodeCheckRequest, createCodeCheck };
