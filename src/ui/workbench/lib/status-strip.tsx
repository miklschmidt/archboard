// The compact lifecycle strip above the thread: the one private session's
// readiness, the explicit thread link with its actions, the separate
// coordinator, and the lease, operation and board-context delivery tokens.

import { RiLinkM, RiLinkUnlinkM, RiRefreshLine, RiSettings3Line } from "@remixicon/react";

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import type { WorkbenchActions } from "@/ui/workbench/contracts";
import { StateLineRow } from "@/ui/workbench/lib/state-line";
import {
	coordinatorLine,
	leaseText,
	operationText,
	readinessLine,
	semanticText,
	threadLinkLine,
} from "@/ui/workbench/session-projection";

/** Inputs for the strip. */
interface StatusStripProps {
	snapshot: BrowserSnapshot;
	actions: WorkbenchActions;
}

/** Inputs for the thread link actions. */
interface ThreadLinkButtonsProps {
	linked: boolean;
	actions: WorkbenchActions["threadLink"];
	openAgentSettings: () => void;
}

/**
 * Link, choose, refresh and unlink for the workhorse, plus the settings door.
 * @param props Whether a thread is linked, and the callbacks.
 * @returns The buttons.
 */
function ThreadLinkButtons(props: ThreadLinkButtonsProps): React.JSX.Element {
	return (
		<>
			{props.linked ? (
				<>
					<Button variant="ghost" size="xs" onClick={props.actions.refresh}>
						<RiRefreshLine />
						Refresh
					</Button>
					<Button variant="ghost" size="xs" onClick={props.actions.unlink}>
						<RiLinkUnlinkM />
						Unlink
					</Button>
				</>
			) : (
				<Button variant="outline" size="xs" onClick={props.actions.link}>
					<RiLinkM />
					Link new thread
				</Button>
			)}
			<Button variant="ghost" size="xs" onClick={props.actions.choose}>
				Choose
			</Button>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Agent settings"
				onClick={props.openAgentSettings}
			>
				<RiSettings3Line />
			</Button>
		</>
	);
}

/** Inputs for the technical tokens. */
interface TokensProps {
	snapshot: BrowserSnapshot;
}

/**
 * The lease, last operation and last board-context delivery, in mono.
 * @param props The snapshot.
 * @returns The tokens, or nothing when none is published.
 */
function Tokens(props: TokensProps): React.JSX.Element | null {
	const tokens = [
		leaseText(props.snapshot.lease),
		operationText(props.snapshot.operation),
		semanticText(props.snapshot.semantic),
	].filter((token): token is string => token !== null);
	if (tokens.length === 0) {
		return null;
	}
	return (
		<p className="text-muted-foreground truncate font-mono text-[11px]">{tokens.join(" · ")}</p>
	);
}

/**
 * The lifecycle strip.
 * @param props The snapshot and the actions.
 * @returns Three state lines and the technical tokens.
 */
function StatusStrip(props: StatusStripProps): React.JSX.Element {
	const { snapshot, actions } = props;
	return (
		<section
			aria-label="Session state"
			className="border-border flex flex-col gap-1 border-b px-3 py-2"
		>
			<StateLineRow line={readinessLine(snapshot.readiness)} />
			<StateLineRow line={threadLinkLine(snapshot.threadLink)}>
				<ThreadLinkButtons
					linked={snapshot.threadLink.state !== "unbound"}
					actions={actions.threadLink}
					openAgentSettings={actions.openAgentSettings}
				/>
			</StateLineRow>
			<StateLineRow line={coordinatorLine(snapshot.coordinator)} />
			<Tokens snapshot={snapshot} />
		</section>
	);
}

export { StatusStrip, type StatusStripProps };
