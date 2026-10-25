// The parts of the agent's state the dock says in words: how long it has been
// at it, or how long ago it stopped, and the one control the state needs.

import { RiExternalLinkLine, RiStopFill } from "@remixicon/react";
import { useCallback, type JSX } from "react";

import { Button } from "@archboard/ui-kit/components";
import { clockDuration, shortAge } from "@archboard/ui-kit/time";
import type { AgentStatus, StatusTone } from "#ui/rules/dock/agent-status.ts";
import type { AgentActions } from "#ui/state/surfaces/contracts.ts";

/** The lamp for each tone: lime while it works, gold while it needs the person. */
const LAMPS: Readonly<Record<StatusTone, string>> = {
	quiet: "ring-muted-foreground/60 size-2 rounded-full ring-[1.5px]",
	working: "bg-status size-2 rounded-full motion-safe:animate-pulse",
	attention: "bg-primary size-2 rounded-full",
	failed: "bg-destructive size-2 rounded-full",
};

/**
 * The agent's state as a lamp.
 * @param props The tone.
 * @param props.tone How the line is lit.
 * @returns The lamp.
 */
function StatusLamp(props: { readonly tone: StatusTone }): JSX.Element {
	return <span aria-hidden="true" className={`shrink-0 ${LAMPS[props.tone]}`} />;
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
			<span className="text-body text-muted-foreground shrink-0 font-mono">
				{clockDuration(now - status.sinceMs)}
			</span>
		);
	}
	if (status.endedAtMs === null) return null;
	const age = shortAge(new Date(status.endedAtMs).toISOString(), now);
	return (
		<span className="text-body text-muted-foreground shrink-0 font-mono">
			{age === "now" ? "just now" : `${age} ago`}
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
					className="rounded-control h-7 shrink-0 gap-1.5 px-2.5"
					onClick={actions.stop}
				>
					<RiStopFill aria-hidden="true" className="size-3" />
					Stop
				</Button>
			);
		case "review":
			return (
				<Button size="sm" className="rounded-control h-7 shrink-0 px-3" onClick={actions.openPanel}>
					Review
				</Button>
			);
		case "sign_in":
			return (
				<Button size="sm" className="rounded-control h-7 shrink-0 px-3" onClick={signIn}>
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
					className="rounded-control h-7 shrink-0 px-3"
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
					className="text-control text-primary-text hover:bg-sidebar-accent rounded-control flex h-7 items-center gap-1 px-2 font-medium"
				>
					Open the page
					<RiExternalLinkLine aria-hidden="true" className="size-3.5" />
				</a>
			)}
			<Button
				variant="ghost"
				size="sm"
				className="rounded-control h-7 px-2.5"
				onClick={props.onCancel}
			>
				Cancel
			</Button>
		</span>
	);
}

export { StatusAction, StatusLamp, Timing };
