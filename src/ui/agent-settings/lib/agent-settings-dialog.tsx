// The agent settings dialog: account, explicit thread link, coordinator and
// the published session settings, each from its shared browser-model record.

import { AccountSection } from "@/ui/agent-settings/lib/account-section";
import type { AgentSettingsDialogProps } from "@/ui/agent-settings/lib/contracts";
import { CoordinatorSection, SessionSettings } from "@/ui/agent-settings/lib/coordinator-section";
import { ThreadLinkSection } from "@/ui/agent-settings/lib/thread-link-section";
import { CANCEL_BUTTON_CLASS } from "@/ui/board-dialogs";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/ui/components/dialog";
import { Separator } from "@/ui/components/separator";

/**
 * The agent settings dialog.
 * @param props The browser-model records, the state and the callbacks.
 * @returns The dialog.
 */
function AgentSettingsDialog(props: AgentSettingsDialogProps): React.JSX.Element {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent
				className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-lg"
				finalFocus={props.finalFocus}
			>
				<DialogHeader>
					<DialogTitle>Agent settings</DialogTitle>
					<DialogDescription>
						The Codex account this canvas signs in with, the thread this pane is bound to, and the
						voice coordinator's own session.
					</DialogDescription>
				</DialogHeader>
				<AccountSection
					account={props.account}
					login={props.login}
					busy={props.busy}
					error={props.errors.account}
					onSignIn={props.onSignIn}
					onCancelLogin={props.onCancelLogin}
				/>
				<Separator />
				<ThreadLinkSection
					threadLink={props.threadLink}
					threadCandidates={props.threadCandidates}
					busy={props.busy}
					error={props.errors.threadLink}
					onLinkThread={props.onLinkThread}
					onUnlinkThread={props.onUnlinkThread}
				/>
				<Separator />
				<CoordinatorSection coordinator={props.coordinator} error={props.errors.coordinator} />
				<Separator />
				<SessionSettings settings={props.settings} />
				<DialogFooter>
					<DialogClose className={CANCEL_BUTTON_CLASS}>Close</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { AgentSettingsDialog };
