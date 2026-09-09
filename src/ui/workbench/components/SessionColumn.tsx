// The session column on the left of the dock body: the one private session's
// readiness, the explicit thread link with its actions, and the separate
// coordinator as a definition list, the lease, operation and board-context
// delivery tokens in mono, then the recent activity the shell hands in.

import { RiLinkM, RiLinkUnlinkM, RiRefreshLine, RiSettings3Line } from "@remixicon/react";

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import { Button } from "@/ui/components/button";
import type { WorkbenchActions } from "@/ui/workbench/contracts";
import { IconAction } from "@/ui/workbench/components/IconAction";
import { SessionItem } from "@/ui/workbench/components/SessionItem";
import {
	coordinatorLine,
	leaseText,
	operationText,
	readinessLine,
	semanticText,
	threadLinkLine,
} from "@/ui/workbench/session-projection";

/** Inputs for the column. */
interface SessionColumnProps {
	snapshot: BrowserSnapshot;
	/** The recent `doing` lines, rendered by the shell, or null. */
	activity: React.ReactNode;
	actions: WorkbenchActions;
}

/** Inputs for the thread link actions. */
interface ThreadLinkButtonsProps {
	linked: boolean;
	actions: WorkbenchActions["threadLink"];
}

/**
 * Link, choose, refresh and unlink for the workhorse, on one row: the
 * refresh is an icon so the three fit the column's width.
 * @param props Whether a thread is linked, and the callbacks.
 * @returns The buttons.
 */
function ThreadLinkButtons(props: ThreadLinkButtonsProps): React.JSX.Element {
	return (
		<>
			{props.linked ? (
				<>
					<Button variant="ghost" size="xs" onClick={props.actions.unlink}>
						<RiLinkUnlinkM />
						Unlink
					</Button>
					<Button variant="ghost" size="xs" onClick={props.actions.choose}>
						Choose
					</Button>
					<IconAction label="Refresh thread" onClick={props.actions.refresh}>
						<RiRefreshLine />
					</IconAction>
				</>
			) : (
				<>
					<Button variant="outline" size="xs" onClick={props.actions.link}>
						<RiLinkM />
						Link new thread
					</Button>
					<Button variant="ghost" size="xs" onClick={props.actions.choose}>
						Choose
					</Button>
				</>
			)}
		</>
	);
}

/** Inputs for the technical tokens. */
interface TokensProps {
	snapshot: BrowserSnapshot;
}

/**
 * The lease, last operation and last board-context delivery, one mono line each.
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
		<ul aria-label="Session tokens" className="flex flex-col gap-0.5">
			{tokens.map((token) => (
				<li key={token} className="text-technical text-muted-foreground truncate font-mono">
					{token}
				</li>
			))}
		</ul>
	);
}

/** Inputs for the activity section. */
interface ActivitySectionProps {
	activity: React.ReactNode;
}

/**
 * The recent activity under its own kicker, when there is any.
 * @param props The rendered activity, or null.
 * @returns The section, or nothing.
 */
function ActivitySection(props: ActivitySectionProps): React.JSX.Element | null {
	if (props.activity === null) {
		return null;
	}
	return (
		<div className="border-border flex flex-col gap-2 border-t pt-2">
			<h3 className="text-kicker text-muted-foreground uppercase">Activity</h3>
			{props.activity}
		</div>
	);
}

/**
 * The session column.
 * @param props The snapshot, the activity and the actions.
 * @returns The kicker, the definition list, the tokens and the activity.
 */
function SessionColumn(props: SessionColumnProps): React.JSX.Element {
	const { snapshot, actions } = props;
	return (
		<section
			aria-label="Session state"
			className="border-border flex w-[260px] shrink-0 flex-col gap-3 overflow-y-auto border-r px-3 pb-3"
		>
			<div className="-me-1 flex h-8 shrink-0 items-center">
				<h2 className="text-kicker text-muted-foreground flex-1 uppercase">Session</h2>
				<IconAction label="Agent settings" onClick={actions.openAgentSettings}>
					<RiSettings3Line />
				</IconAction>
			</div>
			<dl className="flex flex-col gap-3">
				<SessionItem line={readinessLine(snapshot.readiness)} />
				<SessionItem line={threadLinkLine(snapshot.threadLink)}>
					<ThreadLinkButtons
						linked={snapshot.threadLink.state !== "unbound"}
						actions={actions.threadLink}
					/>
				</SessionItem>
				<SessionItem line={coordinatorLine(snapshot.coordinator)} />
			</dl>
			<Tokens snapshot={snapshot} />
			<ActivitySection activity={props.activity} />
		</section>
	);
}

export { SessionColumn, type SessionColumnProps };
