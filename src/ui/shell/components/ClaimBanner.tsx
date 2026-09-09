// The per-pane claim banner: while an agent claims a pane's board, a 32px
// strip across the stage says who, why and since when, and offers the one
// control that releases the claim (ADR 0022). The canvas beneath is read-only
// meanwhile; the words say so.

import { useCallback, type JSX } from "react";

import { Button } from "@/ui/components/button";
import type { ShellActions, ShellPane, TakeBackState } from "@/ui/shell/types/contracts";
import { StatusDot } from "@/ui/shell/components/StatusDot";
import { clockTime } from "@/ui/shell/lib/time";
import { agentClaim } from "@/ui/types";

/** Inputs for the banner. */
interface ClaimBannerProps {
	pane: ShellPane;
	actions: ShellActions;
}

/** Inputs for the take-back control. */
interface TakeBackControlProps {
	paneId: string;
	state: TakeBackState;
	actions: ShellActions;
}

/**
 * The take-back button and, when the last attempt failed, why.
 * @param props The pane, the operation's state and the actions.
 * @returns The button with its state text.
 */
function TakeBackControl(props: TakeBackControlProps): JSX.Element {
	const { paneId, state, actions } = props;
	const handleClick = useCallback(() => actions.takeBackControl(paneId), [actions, paneId]);
	const pending = state.kind === "pending";
	return (
		<span className="flex items-center gap-3">
			{state.kind === "failed" && (
				<span className="text-destructive text-body truncate">{state.message}</span>
			)}
			<Button
				variant="outline"
				size="xs"
				className="border-status-foreground/40 bg-background/60 hover:bg-background text-status-foreground hover:text-status-foreground shrink-0 rounded-[2px] font-medium"
				onClick={handleClick}
				disabled={pending}
				aria-busy={pending}
			>
				{pending ? "Taking back control" : "Take back control"}
			</Button>
		</span>
	);
}

/**
 * The banner across the top of one stage.
 * @param props The pane and the actions.
 * @returns The banner, or nothing while no agent claims the board.
 */
function ClaimBanner(props: ClaimBannerProps): JSX.Element | null {
	const { pane, actions } = props;
	const claim = agentClaim(pane.holder);
	if (!claim) {
		return null;
	}
	return (
		<div
			data-slot="claim-banner"
			className="border-border bg-status-subtle text-status-foreground text-body flex h-8 shrink-0 items-center gap-3 border-b px-3"
		>
			<StatusDot tone="live" />
			<span className="shrink-0 font-medium">Agent claimed this board</span>
			{claim.reason !== undefined && <span className="truncate">{claim.reason}</span>}
			<span className="text-technical shrink-0 opacity-80">read-only</span>
			<span className="text-technical shrink-0 opacity-80">
				since{" "}
				<time dateTime={claim.since} className="font-mono">
					{clockTime(claim.since)}
				</time>
			</span>
			<span className="flex-1" />
			<TakeBackControl paneId={pane.status.paneId} state={pane.takeBack} actions={actions} />
		</div>
	);
}

export { ClaimBanner, agentClaim, type ClaimBannerProps };
