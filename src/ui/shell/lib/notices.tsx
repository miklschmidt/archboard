// Persistent notices above the canvas. A message that carries a recovery
// action is never a toast: it stays up until the person chooses.

import { useCallback } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/ui/components/alert";
import { Button } from "@/ui/components/button";
import type { ShellActions, ShellNotice, ShellNoticeAction } from "@/ui/shell/lib/contracts";

/** Inputs for one recovery action. */
interface NoticeActionButtonProps {
	noticeId: string;
	action: ShellNoticeAction;
	actions: ShellActions;
}

/**
 * One recovery action.
 * @param props The notice, the action and the shell actions.
 * @returns A small outline button.
 */
function NoticeActionButton(props: NoticeActionButtonProps): React.JSX.Element {
	const { noticeId, action, actions } = props;
	const handleClick = useCallback(
		() => actions.selectNoticeAction(noticeId, action.id),
		[actions, noticeId, action.id],
	);
	return (
		<Button variant="outline" size="xs" onClick={handleClick}>
			{action.label}
		</Button>
	);
}

/** Inputs for one notice. */
interface NoticeProps {
	notice: ShellNotice;
	actions: ShellActions;
}

/**
 * One persistent notice with its actions.
 * @param props The notice and the shell actions.
 * @returns The alert.
 */
function Notice(props: NoticeProps): React.JSX.Element {
	const { notice } = props;
	return (
		<Alert variant={notice.tone} className="rounded-none border-x-0 border-t-0">
			<AlertTitle>{notice.title}</AlertTitle>
			<AlertDescription>{notice.description}</AlertDescription>
			<AlertAction className="flex gap-1.5">
				{notice.actions.map((action) => (
					<NoticeActionButton
						key={action.id}
						noticeId={notice.id}
						action={action}
						actions={props.actions}
					/>
				))}
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

export { Notices, type NoticesProps };
