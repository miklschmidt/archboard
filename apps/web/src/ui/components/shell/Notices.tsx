import { Toaster, toast } from "sonner";
import { SHELL_CLOCK_MS } from "@archboard/timing";
import {
	RiCloseLine,
	RiErrorWarningLine,
	RiExternalLinkLine,
	RiInformationLine,
} from "@remixicon/react";
import { useCallback, useEffect, useRef, type JSX } from "react";

import { GitHubHttpsUrlSchema, type CodeTargetNotice } from "@archboard/code-opener/opening";
import { Alert, Button, buttonVariants, IconButton } from "@archboard/ui-kit/components";
import type { ShellActions, ShellNotice, ShellNoticeAction } from "#ui/rules/shell/contracts.ts";

/** A 24px outline action with two-pixel corners. */
const TOASTER_STYLE = { fontFamily: "var(--font-sans)" };

const ACTION_CLASS = "rounded-chip font-medium";

const LINK_BUTTON_CLASS = buttonVariants({
	variant: "outline",
	size: "xs",
	className: ACTION_CLASS,
});

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
function ReportedAction(props: ReportedActionProps): JSX.Element {
	const { noticeId, actionId, actions } = props;
	const handleClick = useCallback(
		() => actions.selectNoticeAction(noticeId, actionId),
		[actions, noticeId, actionId],
	);
	return (
		<Button variant="outline" size="xs" className={ACTION_CLASS} onClick={handleClick}>
			{props.label}
		</Button>
	);
}

/** Inputs for a GitHub link action. */
interface GitHubActionProps {
	action: Extract<CodeTargetNotice["actions"][number], { kind: "github" }>;
}

/**
 * A link to GitHub, shown only when the URL is an https://github.com one.
 * @param props The action with its URL.
 * @returns The link, or nothing when the URL fails validation.
 */
function GitHubAction(props: GitHubActionProps): JSX.Element | null {
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
function NoticeAction(props: NoticeActionProps): JSX.Element | null {
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
 * One persistent notice with its actions and a dismiss control. The icon
 * names the tone: an information mark for a message, a warning mark for a
 * failure with its recovery.
 * @param props The notice and the shell actions.
 * @returns The alert.
 */
function Notice(props: NoticeProps): JSX.Element {
	const { notice, actions } = props;
	const handleDismiss = useCallback(() => actions.dismissNotice(notice.id), [actions, notice.id]);
	return (
		<Alert
			variant={notice.tone}
			className="bg-popover text-popover-foreground w-96 rounded-xl border p-4 shadow-lg"
		>
			{notice.tone === "destructive" ? <RiErrorWarningLine /> : <RiInformationLine />}
			<Alert.Title className="pr-6">{notice.title}</Alert.Title>
			<Alert.Description className="min-w-0 break-words" title={notice.description}>
				{notice.description}
			</Alert.Description>
			<Alert.Action className="static col-start-2 mt-2 flex flex-wrap items-center gap-2">
				{notice.actions.map((action) => (
					<NoticeAction
						key={actionKey(action)}
						noticeId={notice.id}
						action={action}
						actions={actions}
					/>
				))}
				<IconButton
					label={`Dismiss notice: ${notice.title}`}
					className="text-muted-foreground"
					onClick={handleDismiss}
				>
					<RiCloseLine />
				</IconButton>
			</Alert.Action>
		</Alert>
	);
}

/** Inputs for the notice stack. */
interface NoticesProps {
	notices: readonly ShellNotice[];
	actions: ShellActions;
}

/**
 * Shell notices presented as floating, dismissible toasts.
 * @param props The notices and the shell actions.
 * @returns The stack, or nothing when there is no notice.
 */
function Notices(props: NoticesProps): JSX.Element {
	const current = useRef(new Map<ShellNotice, string | number>());
	useEffect(() => {
		for (const [notice, id] of current.current) {
			if (props.notices.includes(notice)) continue;
			current.current.delete(notice);
			toast.dismiss(id);
		}
		for (const notice of props.notices) {
			if (current.current.has(notice)) continue;
			/** Remove shell state only while this exact notice remains current. */
			const dismiss = (): void => {
				if (current.current.has(notice)) props.actions.dismissNotice(notice.id);
			};
			const id = toast.custom(() => <Notice notice={notice} actions={props.actions} />, {
				duration: isPersistent(notice) ? Infinity : SHELL_CLOCK_MS.notice,
				onAutoClose: dismiss,
				onDismiss: dismiss,
			});
			current.current.set(notice, id);
		}
	}, [props.notices, props.actions]);
	useEffect(
		() => () => {
			for (const id of current.current.values()) toast.dismiss(id);
			current.current.clear();
		},
		[],
	);
	return <Toaster position="bottom-right" style={TOASTER_STYLE} />;
}

/**
 * Whether a notice needs an explicit dismissal.
 * @param notice The message and its recovery actions.
 * @returns Whether it stays visible.
 */
function isPersistent(notice: ShellNotice): boolean {
	return notice.actions.length > 0 || notice.tone === "destructive";
}

export { Notices };
