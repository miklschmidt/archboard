// The agent settings dialog over the focused pane's workbench: the account,
// login, thread link, candidates, settings and coordinator records from the
// transport's snapshot, and the thread-link controller's busy, errors and
// callbacks. Only ChatGPT sign-in starts from the dialog: it carries no
// credential fields (recorded limitation).

import { useCallback, useMemo, useSyncExternalStore, type JSX } from "react";

import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import { AgentSettingsDialog } from "@/ui/agent-settings";
import {
	agentSettingsBusy,
	agentSettingsCallbacks,
	agentSettingsErrors,
} from "@/ui/workbench-thread-link";

/** Inputs for the host. */
interface AgentSettingsHostProps {
	owners: WorkbenchOwners;
	onClose: () => void;
	/** Where focus returns once the dialog closes. */
	finalFocus: () => HTMLElement | null;
}

/**
 * The agent settings dialog, open.
 * @param props The owners and how the dialog closes.
 * @returns The dialog, or nothing while the transport has no snapshot.
 */
function AgentSettingsHost(props: AgentSettingsHostProps): JSX.Element | null {
	const { owners, onClose } = props;
	const { transport, threadLink } = owners;
	const state = useSyncExternalStore(transport.subscribe, transport.state, transport.state);
	const action = useSyncExternalStore(
		threadLink.subscribe,
		threadLink.snapshot,
		threadLink.snapshot,
	);
	const busy = useMemo(() => agentSettingsBusy(action), [action]);
	const errors = useMemo(() => agentSettingsErrors(action), [action]);
	const callbacks = useMemo(() => agentSettingsCallbacks(threadLink), [threadLink]);
	const handleOpenChange = useCallback(
		(open: boolean): void => {
			if (!open) {
				onClose();
			}
		},
		[onClose],
	);
	const { snapshot } = state;
	if (snapshot === null) {
		return null;
	}
	return (
		<AgentSettingsDialog
			open
			account={snapshot.account}
			login={snapshot.login}
			threadLink={snapshot.threadLink}
			threadCandidates={snapshot.threadCandidates}
			settings={snapshot.settings}
			coordinator={snapshot.coordinator}
			busy={busy}
			errors={errors}
			onSignIn={callbacks.onSignIn}
			onCancelLogin={callbacks.onCancelLogin}
			onLinkThread={callbacks.onLinkThread}
			onUnlinkThread={callbacks.onUnlinkThread}
			onOpenChange={handleOpenChange}
			finalFocus={props.finalFocus}
		/>
	);
}

export { AgentSettingsHost, type AgentSettingsHostProps };
