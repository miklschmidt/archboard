// The dock while the session is not ready: loading, empty, or an error with
// its recovery words and the actions that lead out of it.

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Button } from "@/ui/components/button";
import { Skeleton } from "@/ui/components/skeleton";
import type { WorkbenchActions, WorkbenchSessionView } from "@/ui/workbench/contracts";

/** Inputs for the not-ready presentations. */
interface SessionStateProps {
	session: Exclude<WorkbenchSessionView, { kind: "ready" }>;
	actions: WorkbenchActions;
}

/**
 * The loading placeholder.
 * @returns Three skeleton lines with a status for assistive technology.
 */
function LoadingState(): React.JSX.Element {
	return (
		<div className="flex flex-col gap-2 p-3">
			<output className="sr-only">Loading the agent session</output>
			<Skeleton className="h-3 w-1/3 motion-reduce:animate-none" />
			<Skeleton className="h-3 w-2/3 motion-reduce:animate-none" />
			<Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
		</div>
	);
}

/**
 * The not-ready dock body.
 * @param props The session view and the actions.
 * @returns The matching presentation.
 */
function SessionState(props: SessionStateProps): React.JSX.Element {
	const { session, actions } = props;
	if (session.kind === "loading") {
		return <LoadingState />;
	}
	if (session.kind === "empty") {
		return (
			<div className="flex items-center gap-3 p-3 text-sm">
				<span className="text-muted-foreground">{session.message}</span>
				<Button variant="outline" size="xs" onClick={actions.openAgentSettings}>
					Agent settings
				</Button>
			</div>
		);
	}
	return (
		<div className="p-3">
			<Alert variant="destructive">
				<AlertTitle>{session.message}</AlertTitle>
				<AlertDescription>{session.recovery}</AlertDescription>
				<AlertAction>
					<Button variant="outline" size="xs" onClick={actions.retrySession}>
						Retry
					</Button>
					<Button variant="ghost" size="xs" onClick={actions.openAgentSettings}>
						Agent settings
					</Button>
				</AlertAction>
			</Alert>
		</div>
	);
}

export { SessionState, type SessionStateProps };
