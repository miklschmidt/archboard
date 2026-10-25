// The smaller parts of a turn: the person's prompt, the plan's progress, a
// plan the agent wrote out, where an approval stands, and how the turn ended.
// A prompt of work the voice coordinator delegated says so.

import {
	RiCheckboxBlankCircleLine,
	RiCheckboxCircleFill,
	RiErrorWarningLine,
	RiHandHeartLine,
	RiLoader4Line,
} from "@remixicon/react";
import type { JSX } from "react";

import { SHELL_CLOCK_MS } from "@archboard/timing";
import { clockDuration, useClock } from "@archboard/ui-kit/time";
import type { ConversationDataParts } from "#ui/rules/runtime/messages.ts";
import { DelegatedFrom } from "#ui/components/thread/VoiceTurn.tsx";

/**
 * What the person said: set apart from the agent's words on a stone band. When
 * the voice coordinator handed the work over, the band says so first.
 * @param props The prompt.
 * @param props.item The prompt item.
 * @returns The prompt.
 */
function PromptBlock(props: { readonly item: ConversationDataParts["prompt"] }): JSX.Element {
	const { delegatedBy, text } = props.item;
	return (
		<div
			data-slot="prompt"
			className="bg-muted border-border rounded-panel border px-3 py-2 text-[13.5px] leading-[21px] wrap-break-word whitespace-pre-wrap"
		>
			{delegatedBy !== null && <DelegatedFrom delegatedBy={delegatedBy} />}
			{text}
		</div>
	);
}

/** Each step status's mark. */
const STEP_MARKS = {
	completed: (
		<RiCheckboxCircleFill aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
	),
	inProgress: (
		<RiLoader4Line
			aria-hidden="true"
			className="text-foreground size-3.5 shrink-0 motion-safe:animate-spin"
		/>
	),
	pending: (
		<RiCheckboxBlankCircleLine
			aria-hidden="true"
			className="text-muted-foreground size-3.5 shrink-0"
		/>
	),
} as const;

/** Each step status in words, for assistive technology. */
const STEP_WORDS = { completed: "done", inProgress: "in progress", pending: "to do" } as const;

/**
 * Each step with a key of its own: its words, and which time they recur,
 * since the model may write the same step twice.
 * @param steps The plan's steps.
 * @returns Each step with its key.
 */
function stepKeys<Step extends { readonly step: string }>(
	steps: readonly Step[],
): [string, Step][] {
	const seen = new Map<string, number>();
	return steps.map((step) => {
		const time = (seen.get(step.step) ?? 0) + 1;
		seen.set(step.step, time);
		return [`${step.step}#${time}`, step];
	});
}

/**
 * The plan the agent is working to, updated in place as it goes.
 * @param props The plan.
 * @param props.plan The latest plan Codex published.
 * @returns The plan.
 */
function PlanProgress(props: {
	readonly plan: ConversationDataParts["plan-progress"];
}): JSX.Element {
	const { plan } = props;
	const done = plan.steps.filter((step) => step.status === "completed").length;
	return (
		<section data-slot="plan" className="border-border rounded-panel border px-3 py-2.5">
			<h3 className="text-body mb-1.5 flex items-center justify-between font-semibold">
				Plan
				<span className="text-technical text-muted-foreground font-mono font-normal">
					{done} of {plan.steps.length}
				</span>
			</h3>
			{plan.explanation !== null && (
				<p className="text-body text-muted-foreground mb-1.5">{plan.explanation}</p>
			)}
			<ol className="flex flex-col gap-1">
				{stepKeys(plan.steps).map(([key, step]) => (
					<li key={key} className="text-body flex items-start gap-2">
						<span className="mt-px">{STEP_MARKS[step.status]}</span>
						<span className={step.status === "completed" ? "text-muted-foreground" : ""}>
							<span className="sr-only">{STEP_WORDS[step.status]}: </span>
							{step.step}
						</span>
					</li>
				))}
			</ol>
		</section>
	);
}

/**
 * A plan the agent wrote out as its answer.
 * @param props The plan item.
 * @param props.item The plan text.
 * @returns The note.
 */
function PlanNote(props: { readonly item: ConversationDataParts["plan"] }): JSX.Element {
	return (
		<section data-slot="plan-note" className="border-border border-l-2 pl-3">
			<h3 className="text-body text-muted-foreground mb-1 font-semibold">Plan</h3>
			<p className="text-[13.5px] leading-[21px] whitespace-pre-wrap">{props.item.text}</p>
		</section>
	);
}

/** What an approval item says where it stands. */
const APPROVAL_WORDS = {
	pending: "Waiting for your decision",
	resolved: "Decided",
	cancelled: "No longer asked",
} as const;

/**
 * Where an approval stands, at the point in the turn it was asked; the
 * decision itself is made on its card at the foot of the conversation.
 * @param props The approval item.
 * @param props.item The approval.
 * @returns The mark.
 */
function ApprovalMark(props: { readonly item: ConversationDataParts["approval"] }): JSX.Element {
	const pending = props.item.status === "pending";
	return (
		<p
			data-slot="approval-mark"
			className={`text-body flex h-7 items-center gap-2 ${pending ? "text-primary-text font-medium" : "text-muted-foreground"}`}
		>
			<RiHandHeartLine aria-hidden="true" className="size-3.5 shrink-0" />
			{APPROVAL_WORDS[props.item.status]}
		</p>
	);
}

/**
 * How a turn ended: live elapsed time while it runs, how long it took, that
 * it was stopped, or Codex's own words for why it failed.
 * @param props How it ended.
 * @param props.end The turn's end.
 * @returns The line.
 */
function TurnEndLine(props: {
	readonly end: ConversationDataParts["turn-end"];
}): JSX.Element | null {
	const { end } = props;
	if (end.outcome === "running") return <RunningLine startedAtMs={end.startedAtMs} />;
	if (end.outcome === "failed") return <FailedLine error={end.error} />;
	return <EndedLine end={end} />;
}

/**
 * Why a turn failed, in Codex's own words.
 * @param props The error.
 * @param props.error What Codex said, or null.
 * @returns The alert.
 */
function FailedLine(props: {
	readonly error: ConversationDataParts["turn-end"]["error"];
}): JSX.Element {
	const { error } = props;
	return (
		<div data-slot="turn-failed" className="text-body text-destructive flex items-start gap-2">
			<RiErrorWarningLine aria-hidden="true" className="mt-px size-3.5 shrink-0" />
			<span className="min-w-0 wrap-break-word">
				{error?.message ?? "The turn failed."}
				{error?.details != null && (
					<span className="text-muted-foreground block whitespace-pre-wrap">{error.details}</span>
				)}
			</span>
		</div>
	);
}

/**
 * How long a finished turn took, or that it was stopped.
 * @param props How it ended.
 * @param props.end The turn's end.
 * @returns The line, or nothing when Codex reported no duration.
 */
function EndedLine(props: { readonly end: ConversationDataParts["turn-end"] }): JSX.Element | null {
	const { end } = props;
	const took = end.durationMs === null ? null : clockDuration(end.durationMs);
	if (end.outcome === "interrupted") {
		return (
			<p className="text-technical text-muted-foreground font-mono">
				stopped{took === null ? "" : ` after ${took}`}
			</p>
		);
	}
	return took === null ? null : (
		<p className="text-technical text-muted-foreground text-right font-mono">{took}</p>
	);
}

/**
 * The foot of a running turn: that it is working, and for how long.
 * @param props When it started.
 * @param props.startedAtMs When, or null.
 * @returns The line.
 */
function RunningLine(props: { readonly startedAtMs: number | null }): JSX.Element {
	const now = useClock(SHELL_CLOCK_MS.elapsedTick);
	const { startedAtMs } = props;
	return (
		<p data-slot="turn-running" className="text-body text-muted-foreground flex items-center gap-2">
			<span
				aria-hidden="true"
				className="bg-status size-1.5 rounded-full motion-safe:animate-pulse"
			/>
			Working
			{startedAtMs !== null && (
				<span className="font-mono">{clockDuration(now - startedAtMs)}</span>
			)}
		</p>
	);
}

export { ApprovalMark, PlanNote, PlanProgress, PromptBlock, TurnEndLine };
