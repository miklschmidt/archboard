// Persistent notices above the canvas. A message that carries a recovery
// action is never a toast: it stays up until the person chooses or dismisses.

import { RiCloseLine, RiExternalLinkLine } from "@remixicon/react";
import { useCallback } from "react";

import { GitHubHttpsUrlSchema, type CodeTargetNoticeAction } from "@/shared/code-target";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Button, buttonVariants } from "@/ui/components/button";
import type { ShellActions, ShellNotice, ShellNoticeAction } from "@/ui/shell/lib/contracts";

const LINK_BUTTON_CLASS = buttonVariants({ variant: "outline", size: "xs" });

/** The id a `settings` code target action is reported with. */
const SETTINGS_ACTION_ID = "settings";

/** Inputs for one action reported by id. */
interface ReportedActionProps {
	noticeId: string;
	actionId: string;
	label: string;
	actions: ShellActions;
}

/**
 * One recovery action, reported by id when chosen.
 * @param props The notice, the action id, its label and the shell actions.
 * @returns A small outline button.
 */
function ReportedAction(props: ReportedActionProps): React.JSX.Element {
	const { noticeId, actionId, actions } = props;
	const handleClick = useCallback(
		() => actions.selectNoticeAction(noticeId, actionId),
		[actions, noticeId, actionId],
	);
	return (
		<Button variant="outline" size="xs" onClick={handleClick}>
			{props.label}
		</Button>
	);
}

/** Inputs for a GitHub link action. */
interface GitHubActionProps {
	action: Extract<CodeTargetNoticeAction, { kind: "github" }>;
}

/**
 * A link to GitHub, shown only when the URL is an https://github.com one.
 * @param props The action with its URL.
 * @returns The link, or nothing when the URL fails validation.
 */
function GitHubAction(props: GitHubActionProps): React.JSX.Element | null {
	const parsed = GitHubHttpsUrlSchema.safeParse(props.action.href);
	if (!parsed.success) {
		return null;
	}
	return (
		<a href={parsed.data} target="_blank" rel="noopener noreferrer" className={LINK_BUTTON_CLASS}>
			{props.action.label}
			<RiExternalLinkLine data-icon="inline-end" />
		</a>
	);
}

/** Inputs for one notice action of any kind. */
interface NoticeActionProps {
	noticeId: string;
	action: ShellNoticeAction;
	actions: ShellActions;
}

/**
 * One notice action, by kind.
 * @param props The notice, the action and the shell actions.
 * @returns The control for that action.
 */
function NoticeAction(props: NoticeActionProps): React.JSX.Element | null {
	const { noticeId, action, actions } = props;
	if (action.kind === "github") {
		return <GitHubAction action={action} />;
	}
	return (
		<ReportedAction
			noticeId={noticeId}
			actionId={action.kind === "select" ? action.id : SETTINGS_ACTION_ID}
			label={action.label}
			actions={actions}
		/>
	);
}

/**
 * A key for an action, which the code target shapes do not carry.
 * @param action The action.
 * @returns Its id, or its kind and label.
 */
function actionKey(action: ShellNoticeAction): string {
	return action.kind === "select" ? action.id : `${action.kind}:${action.label}`;
}

/** Inputs for one notice. */
interface NoticeProps {
	notice: ShellNotice;
	actions: ShellActions;
}

/**
 * One persistent notice with its actions and a dismiss control.
 * @param props The notice and the shell actions.
 * @returns The alert.
 */
function Notice(props: NoticeProps): React.JSX.Element {
	const { notice, actions } = props;
	const handleDismiss = useCallback(() => actions.dismissNotice(notice.id), [actions, notice.id]);
	return (
		<Alert variant={notice.tone} className="rounded-none border-x-0 border-t-0 pr-2">
			<AlertTitle>{notice.title}</AlertTitle>
			<AlertDescription>{notice.description}</AlertDescription>
			<AlertAction className="flex items-center gap-1.5">
				{notice.actions.map((action) => (
					<NoticeAction
						key={actionKey(action)}
						noticeId={notice.id}
						action={action}
						actions={actions}
					/>
				))}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={`Dismiss notice: ${notice.title}`}
					onClick={handleDismiss}
				>
					<RiCloseLine />
				</Button>
			</AlertAction>
		</Alert>
	);
}

/** Inputs for the notice stack. */
interface NoticesProps {
	notices: readonly ShellNotice[];
	actions: ShellActions;
}

/**
 * Every persistent notice, stacked above the canvas.
 * @param props The notices and the shell actions.
 * @returns The stack, or nothing when there is no notice.
 */
function Notices(props: NoticesProps): React.JSX.Element | null {
	if (props.notices.length === 0) {
		return null;
	}
	return (
		<div className="shrink-0">
			{props.notices.map((notice) => (
				<Notice key={notice.id} notice={notice} actions={props.actions} />
			))}
		</div>
	);
}

export { Notices, SETTINGS_ACTION_ID, type NoticesProps };
