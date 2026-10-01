// The agent bar's first cell: the agent's state in one line — a lamp, a word
// or two, how long, what it is on, how far through its plan, what waits behind
// it — and the one control that state needs. Clicking the words opens the
// conversation.

import { RiExternalLinkLine, RiStopFill } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import { AGENT_ELAPSED_TICK_MS, SHELL_AGE_TICK_MS } from "@/shared/timing/timing";
import { clockDuration, shortAge } from "@/ui/components/age";
import { Button } from "@/ui/components/button";
import { useClock } from "@/ui/components/use-clock";
import type { AgentStatus, StatusTone } from "@/ui/workbench/lib/agent-status";
import type { AgentActions } from "@/ui/workbench/contracts";

/** The lamp for each tone. */
const LAMPS: Readonly<Record<StatusTone, string>> = {
	quiet: "ring-muted-foreground/60 size-2 rounded-full ring-[1.5px]",
	working: "bg-status size-2 rounded-full motion-safe:animate-pulse",
	attention: "bg-primary size-2 rounded-full",
	failed: "bg-destructive size-2 rounded-full",
};

/** Inputs for the status line. */
interface StatusLineProps {
	readonly status: AgentStatus;
	readonly actions: AgentActions;
}

/**
 * The agent's state in one line.
 * @param props The status and the actions.
 * @returns The cell.
 */
function StatusLine(props: StatusLineProps): JSX.Element {
	const { status, actions } = props;
	const timed = status.sinceMs !== null || status.endedAtMs !== null;
	const now = useClock(status.sinceMs === null ? SHELL_AGE_TICK_MS : AGENT_ELAPSED_TICK_MS, timed);
	return (
		<div
			data-slot="agent-status"
			data-tone={status.tone}
			className="flex h-full min-w-0 flex-1 items-center gap-3 pr-2"
		>
			<button
				type="button"
				onClick={actions.openPanel}
				className="hover:bg-sidebar-accent flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-[3px] px-2 text-left"
			>
				<span aria-hidden="true" className={`shrink-0 ${LAMPS[status.tone]}`} />
				<span className="text-control shrink-0 font-semibold">{status.headline}</span>
				<Timing status={status} now={now} />
				{status.detail !== null && (
					<span
						className="text-control text-muted-foreground min-w-0 flex-1 truncate font-normal"
						title={status.detail}
					>
						{status.detail}
					</span>
				)}
			</button>
			<Facts status={status} />
			<StatusAction status={status} actions={actions} />
		</div>
	);
}

/**
 * How long: a running turn's elapsed clock, or how long ago the last one ended.
 * @param props The status and the clock.
 * @param props.status The status.
 * @param props.now The clock.
 * @returns The time, or nothing.
 */
function Timing(props: { readonly status: AgentStatus; readonly now: number }): JSX.Element | null {
	const { status, now } = props;
	if (status.sinceMs !== null) {
		return (
			<span className="text-technical text-muted-foreground shrink-0 font-mono">
				{clockDuration(now - status.sinceMs)}
			</span>
		);
	}
	if (status.endedAtMs === null) return null;
	const age = shortAge(new Date(status.endedAtMs).toISOString(), now);
	return (
		<span className="text-technical text-muted-foreground shrink-0 font-mono">
			{age === "now" ? "just now" : `${age} ago`}
		</span>
	);
}

/**
 * The facts after the words: plan progress, what is queued, and whether it has gone quiet.
 * @param props The status.
 * @param props.status The status.
 * @returns The facts.
 */
function Facts(props: { readonly status: AgentStatus }): JSX.Element {
	const { progress, queued, quiet } = props.status;
	return (
		<span className="text-technical text-muted-foreground flex shrink-0 items-center gap-3 font-mono empty:hidden">
			{progress !== null && <PlanMeter done={progress.done} total={progress.total} />}
			{queued > 0 && <span>{queued} queued</span>}
			{quiet && <span className="text-warning-foreground">quiet</span>}
		</span>
	);
}

/**
 * How far through its plan: one segment per step, and the count.
 * @param props Steps done and planned.
 * @param props.done Steps done.
 * @param props.total Steps planned.
 * @returns The meter.
 */
function PlanMeter(props: { readonly done: number; readonly total: number }): JSX.Element {
	const segments = Math.min(props.total, 12);
	const lit = Math.round((props.done / Math.max(props.total, 1)) * segments);
	return (
		<span
			className="flex items-center gap-1.5"
			title={`${props.done} of ${props.total} plan steps done`}
		>
			<span aria-hidden="true" className="flex gap-[2px]">
				{Array.from({ length: segments }, (_, index) => (
					<span
						key={index}
						className={`h-2 w-1 rounded-[1px] ${index < lit ? "bg-foreground/70" : "bg-foreground/15"}`}
					/>
				))}
			</span>
			<span>
				{props.done}/{props.total}
			</span>
		</span>
	);
}

/**
 * The one control the state needs.
 * @param props The status and the actions.
 * @param props.status The status.
 * @param props.actions The actions.
 * @returns The control, or nothing.
 */
function StatusAction(props: {
	readonly status: AgentStatus;
	readonly actions: AgentActions;
}): JSX.Element | null {
	const { status, actions } = props;
	const signIn = useCallback(() => actions.signIn({ type: "chatgpt" }), [actions]);
	switch (status.action) {
		case "stop":
			return (
				<Button
					variant="outline"
					size="sm"
					className="h-7 shrink-0 gap-1.5 rounded-[3px] px-2.5"
					onClick={actions.stop}
				>
					<RiStopFill aria-hidden="true" className="size-3" />
					Stop
				</Button>
			);
		case "review":
			return (
				<Button size="sm" className="h-7 shrink-0 rounded-[3px] px-3" onClick={actions.openPanel}>
					Review
				</Button>
			);
		case "sign_in":
			return (
				<Button size="sm" className="h-7 shrink-0 rounded-[3px] px-3" onClick={signIn}>
					Sign in with ChatGPT
				</Button>
			);
		case "cancel_sign_in":
			return <SignInPending url={status.signInUrl} onCancel={actions.cancelSignIn} />;
		case "show":
			return (
				<Button
					variant="outline"
					size="sm"
					className="h-7 shrink-0 rounded-[3px] px-3"
					onClick={actions.openPanel}
				>
					Show
				</Button>
			);
		default:
			return null;
	}
}

/**
 * A sign-in waiting on the provider's page: open it again, or cancel.
 * @param props The page and the cancel.
 * @param props.url The provider's page, or null before Codex names it.
 * @param props.onCancel Cancel the sign-in.
 * @returns The controls.
 */
function SignInPending(props: {
	readonly url: string | null;
	readonly onCancel: () => void;
}): JSX.Element {
	return (
		<span className="flex shrink-0 items-center gap-1">
			{props.url !== null && (
				<a
					href={props.url}
					target="_blank"
					rel="noreferrer"
					className="text-control text-primary-text hover:bg-sidebar-accent flex h-7 items-center gap-1 rounded-[3px] px-2 font-medium"
				>
					Open the page
					<RiExternalLinkLine aria-hidden="true" className="size-3.5" />
				</a>
			)}
			<Button
				variant="ghost"
				size="sm"
				className="h-7 rounded-[3px] px-2.5"
				onClick={props.onCancel}
			>
				Cancel
			</Button>
		</span>
	);
}

export { StatusLine, type StatusLineProps };
