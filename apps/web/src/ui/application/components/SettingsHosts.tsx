import { useCallback, type JSX } from "react";

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import { OpenerSettings } from "@archboard/code-opener/opener-settings";
import type { NoticeStack } from "#ui/application/hooks/use-notices.ts";
import { SETTINGS_TRIGGER_ID } from "#ui/shell/components/BrandBar.tsx";
import { codeTargetShellNotice, infoNotice } from "#ui/application/rules/notices.ts";
import type { SettingsSurface } from "#ui/shell/rules/contracts.ts";

/**
 * The settings menu trigger: where a settings dialog returns focus, since the
 * menu item that opened it is gone by the time the dialog closes.
 * @returns The trigger, or null before the header mounts.
 */
function settingsTrigger(): HTMLElement | null {
	return document.getElementById(SETTINGS_TRIGGER_ID);
}

/** Inputs for the settings dialog. */
interface SettingsHostsProps {
	surface: SettingsSurface | null;
	notices: NoticeStack;
	onClose: () => void;
}

/**
 * The settings dialog: where the server opens code.
 * @param props The open surface, the notices and the close.
 * @returns The open dialog, or nothing.
 */
function SettingsHosts(props: SettingsHostsProps): JSX.Element | null {
	const { surface, notices, onClose } = props;
	const onSuccess = useCallback(
		(message: string): void =>
			notices.raise(infoNotice("opener-settings", "Opener settings", message)),
		[notices],
	);
	const onFailure = useCallback(
		(notice: CodeTargetNotice): void => notices.raise(codeTargetShellNotice(notice)),
		[notices],
	);
	if (surface !== "opener") return null;
	return (
		<OpenerSettings
			onSuccess={onSuccess}
			onFailure={onFailure}
			onClose={onClose}
			finalFocus={settingsTrigger}
		/>
	);
}

export { SettingsHosts };
