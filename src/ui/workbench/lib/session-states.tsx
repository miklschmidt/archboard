// The dock while the session is not ready: loading, empty, or an error with
// its recovery words and the actions that lead out of it. The recent activity
// the shell hands in stays visible in every one of them: the board's
// narration does not depend on Codex.

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Button } from "@/ui/components/button";
import { Skeleton } from "@/ui/components/skeleton";
import type { WorkbenchActions, WorkbenchSessionView } from "@/ui/workbench/contracts";
import { PanelLine } from "@/ui/workbench/lib/panel-line";

/** Inputs for the not-ready presentations. */
interface SessionStateProps {
	session: Exclude<WorkbenchSessionView, { kind: "ready" }>;
	actions: WorkbenchActions;
	/** The recent `doing` lines, rendered by the shell, or null. */
	activity: React.ReactNode;
}

/** A greyed line of the session column's shape. */
const LINE_CLASS = "h-3 rounded-[2px] motion-reduce:animate-none";

/**
 * The loading placeholder: the three columns the ready dock has, greyed.
 * @returns The skeleton with a status for assistive technology.
 */
function LoadingState(): React.JSX.Element {
	return (
		<div aria-busy="true" className="flex h-full min-h-0">
			<output className="sr-only">Loading the agent session</output>
			<div className="border-border flex w-[260px] shrink-0 flex-col gap-3 border-r px-3 py-3">
				<Skeleton className={`${LINE_CLASS} w-1/3`} />
				<Skeleton className={`${LINE_CLASS} w-2/3`} />
				<Skeleton className={`${LINE_CLASS} w-1/2`} />
			</div>
			<div className="flex min-w-0 flex-1 flex-col justify-end gap-3 px-3 py-3">
				<Skeleton className="h-[72px] w-full rounded-sm motion-reduce:animate-none" />
			</div>
			<div className="border-border flex w-[320px] shrink-0 flex-col gap-3 border-l px-3 py-3">
				<Skeleton className={`${LINE_CLASS} w-full`} />
				<Skeleton className={`${LINE_CLASS} w-3/5`} />
			</div>
		</div>
	);
}

/** Inputs for the column the activity keeps while the session is not ready. */
interface ActivityAsideProps {
	activity: React.ReactNode;
	children: React.ReactNode;
}

/**
 * The not-ready body with the activity in the session column's place.
 * @param props The activity and the state presentation beside it.
 * @returns The two columns.
 */
function ActivityAside(props: ActivityAsideProps): React.JSX.Element {
	return (
		<div className="flex h-full min-h-0">
			{props.activity !== null && (
				<section
					aria-label="Activity"
					className="border-border flex w-[260px] shrink-0 flex-col gap-2 overflow-y-auto border-r px-3 pb-3"
				>
					<div className="flex h-8 shrink-0 items-center">
						<h2 className="text-kicker text-muted-foreground uppercase">Activity</h2>
					</div>
					{props.activity}
				</section>
			)}
			<div className="min-w-0 flex-1">{props.children}</div>
		</div>
	);
}

/**
 * The not-ready dock body.
 * @param props The session view, the actions and the activity.
 * @returns The matching presentation.
 */
function SessionState(props: SessionStateProps): React.JSX.Element {
	const { session, actions } = props;
	if (session.kind === "loading") {
		return <LoadingState />;
	}
	if (session.kind === "empty") {
		return (
			<ActivityAside activity={props.activity}>
				<div className="flex items-center gap-3 px-3 py-3">
					<PanelLine tone="muted">{session.message}</PanelLine>
					<Button variant="outline" size="xs" onClick={actions.openAgentSettings}>
						Agent settings
					</Button>
				</div>
			</ActivityAside>
		);
	}
	return (
		<ActivityAside activity={props.activity}>
			<div className="p-3">
				<Alert variant="destructive" className="max-w-2xl rounded-sm">
					<AlertTitle>{session.message}</AlertTitle>
					<AlertDescription>{session.recovery}</AlertDescription>
					<AlertAction>
						{/* The actions keep the foreground colour: only the words are destructive. */}
						<span className="text-foreground flex items-center gap-1">
							<Button variant="outline" size="xs" onClick={actions.retrySession}>
								Retry
							</Button>
							<Button variant="ghost" size="xs" onClick={actions.openAgentSettings}>
								Agent settings
							</Button>
						</span>
					</AlertAction>
				</Alert>
			</div>
		</ActivityAside>
	);
}

export { SessionState, type SessionStateProps };
