import { useCallback, useState, type JSX } from "react";
import { RiCodeSSlashLine, RiShapesLine, type RemixiconComponentType } from "@remixicon/react";

import type { CodeTargetNotice } from "@archboard/code-opener/opening";
import { OpenerSettings } from "@archboard/code-opener/opener-settings";
import { Dialog, Tabs } from "@archboard/ui-kit/components";
import type { NoticeStack } from "#ui/application/hooks/use-notices.ts";
import { PictureSettings } from "#ui/architecture-drawing/model-reader/reading/components/PictureSettings.tsx";
import { SETTINGS_TRIGGER_ID } from "#ui/shell/components/BrandBar.tsx";
import { codeTargetShellNotice, infoNotice } from "#ui/application/rules/notices.ts";
import type { SettingsSurface } from "#ui/shell/rules/contracts.ts";

/** The tabs of the dialog, one for each surface, in the order they stand. */
const TABS = [
	{
		value: "picture",
		Icon: RiShapesLine,
		label: "Picture",
		gloss: "How this browser lays out and lights pictures",
	},
	{
		value: "opener",
		Icon: RiCodeSSlashLine,
		label: "Code opener",
		gloss: "Which editor opens a module's code",
	},
] as const satisfies readonly {
	readonly value: SettingsSurface;
	readonly Icon: RemixiconComponentType;
	readonly label: string;
	readonly gloss: string;
}[];

/** A panel scrolls on its own, out to the dialog's edges, so a footer can stand at its foot. */
const PANEL = "-mx-5 -mb-5 min-h-0 overflow-y-auto px-5 pb-5";

/**
 * The header's Settings key: where the dialog returns focus.
 * @returns The key, or null before the header mounts.
 */
function settingsTrigger(): HTMLElement | null {
	return document.getElementById(SETTINGS_TRIGGER_ID);
}

/**
 * Where focus starts when the dialog opens on the code opener: its close control. The opener's
 * form takes the focus from there once its settings arrive, as it does on its own.
 * @returns The close control, or null to let the dialog choose.
 */
function openerStart(): HTMLElement | null {
	return document.querySelector<HTMLElement>(
		'[data-slot="settings-dialog"] > [data-slot="dialog-close"]',
	);
}

/** Inputs for the settings dialog. */
interface SettingsDialogProps {
	/** The tab the dialog opens on, or null while it is closed. */
	surface: SettingsSurface | null;
	notices: NoticeStack;
	onClose: () => void;
}

/**
 * The settings of this browser and this machine: how pictures are drawn, and which editor opens
 * code. Each tab is one surface.
 * @param props The surface to open on, the notices and the close.
 * @returns The open dialog, or nothing.
 */
function SettingsDialog(props: SettingsDialogProps): JSX.Element | null {
	if (props.surface === null) return null;
	return <OpenSettings {...props} surface={props.surface} />;
}

/**
 * The dialog, open. It keeps its tab while it is open, and opens again on the surface asked for.
 * @param props The surface to open on, the notices and the close.
 * @returns The dialog.
 */
function OpenSettings(props: SettingsDialogProps & { surface: SettingsSurface }): JSX.Element {
	const { notices, onClose } = props;
	const [tab, setTab] = useState<SettingsSurface>(props.surface);
	const [keepOpenerMounted, setKeepOpenerMounted] = useState(props.surface === "opener");
	const onSuccess = useCallback(
		(message: string): void =>
			notices.raise(infoNotice("opener-settings", "Opener settings", message)),
		[notices],
	);
	const onFailure = useCallback(
		(notice: CodeTargetNotice): void => notices.raise(codeTargetShellNotice(notice)),
		[notices],
	);
	const change = useCallback(
		(open: boolean): void => {
			if (!open) onClose();
		},
		[onClose],
	);
	const changeTab = useCallback((value: unknown): void => {
		const next = TABS.find((one) => one.value === value);
		if (next !== undefined) {
			setTab(next.value);
			if (next.value === "opener") setKeepOpenerMounted(true);
		}
	}, []);
	return (
		<Dialog open onOpenChange={change}>
			<Dialog.Content
				data-slot="settings-dialog"
				initialFocus={props.surface === "opener" ? openerStart : undefined}
				finalFocus={settingsTrigger}
				// Anchored at the top, so the tabs stay in place when a tab of another height opens. A
				// tab taller than the window scrolls under the tabs, and the opener's keys stay in view.
				className="top-[8vh] flex max-h-[84dvh] translate-y-0 flex-col sm:max-w-[720px]"
			>
				<Dialog.Header>
					<Dialog.Title>Settings</Dialog.Title>
					<Dialog.Description className="sr-only">
						How this browser lays out and lights pictures, and which editor opens a module's code on
						this machine.
					</Dialog.Description>
				</Dialog.Header>
				<Tabs value={tab} onValueChange={changeTab} className="min-h-0 gap-4">
					<Tabs.List variant="selector" aria-label="Settings">
						{TABS.map(({ value, Icon, label, gloss }) => (
							<Tabs.Trigger key={value} value={value} data-settings-tab={value}>
								<Icon aria-hidden="true" className="mt-px" />
								<span className="flex flex-col gap-1">
									<span className="text-title">{label}</span>
									<span className="text-body text-muted-foreground font-normal">{gloss}</span>
								</span>
							</Tabs.Trigger>
						))}
					</Tabs.List>
					{/* Each panel holds controls, so Tab goes from the tab straight to the first of them. */}
					<Tabs.Content value="picture" tabIndex={-1} className={PANEL}>
						<PictureSettings />
					</Tabs.Content>
					<Tabs.Content
						value="opener"
						keepMounted={keepOpenerMounted}
						tabIndex={-1}
						className={PANEL}
					>
						<OpenerSettings onSuccess={onSuccess} onFailure={onFailure} onClose={onClose} />
					</Tabs.Content>
				</Tabs>
			</Dialog.Content>
		</Dialog>
	);
}

export { SettingsDialog };
