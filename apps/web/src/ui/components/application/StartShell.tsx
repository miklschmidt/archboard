// The page before any pane exists: the shell's frame with the chooser in the column, and in the
// middle what stands in the way of a reading. A pane needs a vault from its first message
// (ADR 0049), so nothing here has a session, a socket or an agent. A choice writes the address,
// and the address decides the start.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useMemo, useState, type JSX } from "react";

import { IconButton, shownRepository, Tooltip } from "@archboard/ui-kit/components";
import { BOARD_CACHE_MS } from "@archboard/timing";
import { RiFileCopyLine } from "@remixicon/react";
import { SettingsHosts } from "#ui/components/application/SettingsHosts.tsx";
import { ModelState } from "#ui/components/architecture-model/ModelState.tsx";
import { Shell } from "#ui/components/shell/Shell.tsx";
import { createStartActions } from "#ui/clients/application/start-actions.ts";
import { repositoriesQuery } from "#ui/clients/board-catalog/queries.ts";
import { useNotices } from "#ui/hooks/application/use-notices.ts";
import { useTheme } from "#ui/hooks/application/use-theme.ts";
import { useSlowWait } from "#ui/hooks/architecture-model/use-slow-wait.ts";
import type { ModelCatalog } from "#ui/hooks/architecture-model/use-model-catalog.ts";
import { initialPaneList } from "#ui/rules/application/pane-list.ts";
import { assembleShellView } from "#ui/rules/application/shell-view.ts";
import type { Start } from "#ui/rules/board-routing/start.ts";
import type { SettingsSurface } from "#ui/rules/shell/contracts.ts";

/** Inputs for the start's shell. */
interface StartShellProps {
	readonly start: Exclude<Start, { kind: "open" }>;
	readonly catalog: ModelCatalog;
}

/** The command that gives a checkout a vault and makes it known to this machine. */
const SET_UP = "archboard install-skill";

/** Nothing is on the panes before they exist. */
const NO_ACTIVITY = {};
const NO_RECORDS = {};

/**
 * The shell over a start that opened no pane yet.
 * @param props The start and the repositories.
 * @returns The frame, the chooser and the state.
 */
function StartShell(props: StartShellProps): JSX.Element {
	const { start, catalog } = props;
	const [theme, setTheme] = useTheme();
	const notices = useNotices();
	const [settings, openSettings] = useState<SettingsSurface | null>(null);
	const closeSettings = useCallback((): void => openSettings(null), []);
	const client = useQueryClient();
	const router = useRouter();
	useQuery({ ...repositoriesQuery(), refetchInterval: BOARD_CACHE_MS.startListing });
	const actions = useMemo(
		() => createStartActions({ router, client, catalog, notices, setTheme, openSettings }),
		[router, client, catalog, notices, setTheme],
	);
	const [list] = useState(initialPaneList);
	const stage = <StartStage start={start} catalog={catalog} />;
	const view = assembleShellView({
		theme,
		list,
		records: NO_RECORDS,
		panes: { [list.activePaneId]: stage },
		catalog,
		presentation: null,
		notices: notices.notices,
		agentActivity: NO_ACTIVITY,
		choosing: start.kind === "choose",
	});
	return (
		<Tooltip.Provider>
			<Shell view={view} actions={actions} />
			<SettingsHosts surface={settings} notices={notices} onClose={closeSettings} />
		</Tooltip.Provider>
	);
}

/**
 * What stands in the middle before a reading.
 * @param props The start and the repositories.
 * @returns A state, or the ground while the wait is short.
 */
function StartStage(props: StartShellProps): JSX.Element {
	const { start, catalog } = props;
	if (start.kind !== "choose") return <StartWait start={start} />;
	if (catalog.error !== null) return <StartFailed error={catalog.error} />;
	if (start.missing !== null) return <StartMissing name={start.missing} />;
	if (catalog.repositories.length === 0) return <StartEmpty />;
	return (
		<ModelState slot="start-choose">
			<ModelState.Title>No repository open</ModelState.Title>
			<ModelState.Line>Choose one from the list, or type to find it.</ModelState.Line>
		</ModelState>
	);
}

/**
 * Keep the ground while the wait is short, then name where the page is going.
 * @param props The start.
 * @param props.start What the page waits for.
 * @returns The ground, with a message once the wait lasts.
 */
function StartWait(props: {
	readonly start: Extract<Start, { kind: "wait" | "restore" }>;
}): JSX.Element {
	const { destination } = props.start;
	const slow = useSlowWait(destination ?? "repositories");
	return (
		<div data-slot="start-wait" className="bg-background flex flex-1 flex-col items-center">
			{slow && (
				<ModelState.Waiting>
					{destination === null
						? "Reading the repositories of this machine…"
						: `Opening ${shownRepository(destination).name}…`}
				</ModelState.Waiting>
			)}
		</div>
	);
}

/**
 * The repositories could not be read, and the column offers to read them again.
 * @param props Why.
 * @param props.error The failure.
 * @returns The state.
 */
function StartFailed(props: { readonly error: string }): JSX.Element {
	return (
		<ModelState slot="start-failed">
			<ModelState.Title>Repositories unavailable</ModelState.Title>
			<ModelState.Line>{props.error}</ModelState.Line>
		</ModelState>
	);
}

/**
 * The address asks for what no repository of this machine holds.
 * @param props What it asks for.
 * @param props.name The repository or model.
 * @returns The state, with the chooser beside it.
 */
function StartMissing(props: { readonly name: string }): JSX.Element {
	return (
		<ModelState slot="start-missing">
			<ModelState.Title>{shownRepository(props.name).name} is not here</ModelState.Title>
			<ModelState.Line>
				This machine has no readable checkout of it. Choose another repository from the list, or
				register its checkout with <code className="font-mono">archboard repo add</code>.
			</ModelState.Line>
		</ModelState>
	);
}

/**
 * This machine knows no repository with a vault.
 * @returns The state and the command that changes it.
 */
function StartEmpty(): JSX.Element {
	const copy = useCallback((): void => void navigator.clipboard.writeText(SET_UP), []);
	return (
		<ModelState slot="start-empty">
			<ModelState.Title>No repository yet</ModelState.Title>
			<ModelState.Line>Run this in a checkout, and it appears here.</ModelState.Line>
			<div className="border-border bg-sidebar rounded-control flex items-center justify-between border py-1 pr-1 pl-3">
				<code className="text-technical font-mono">{SET_UP}</code>
				<IconButton label="Copy the command" onClick={copy}>
					<RiFileCopyLine />
				</IconButton>
			</div>
		</ModelState>
	);
}

export { StartShell };
