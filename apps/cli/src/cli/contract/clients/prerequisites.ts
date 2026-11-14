import { connectedBrowsers, ensureServerRunning } from "@archboard/server-lifecycle/server";
import { ARCHBOARD_URL } from "@archboard/server-lifecycle/config";
import { registeredRepositoryOfVault } from "@archboard/workspace/checkouts";
import { browserUrl } from "@archboard/workspace/source-checkout";
import { PANE_MS } from "@archboard/workbench/browser-contract";
import open from "open";
import { z } from "zod";
import type { RuntimePrerequisite } from "#cli/contract/protocol/contract.ts";
import { getPanes } from "#cli/server-access/clients/panes.ts";

/**
 * Makes sure what a command needs is actually there: the Archboard server, which
 * is started when it is not running, and an open browser pane, which is refused
 * when none is connected. `browser show` and `browser open` call `openCanvas`
 * instead, which opens one.
 * @param prerequisite - What the command needs.
 * @param description - What the command is doing, for the refusal message.
 * @throws {Error} With code BROWSER_REQUIRED when no pane is rendering the canvas.
 */
export async function requirePrerequisite(
	prerequisite: RuntimePrerequisite,
	description: string,
): Promise<void> {
	if (prerequisite === "server") {
		await ensureServerRunning();
		return;
	}
	if ((await connectedBrowsers()) === 0) {
		throw browserRequired(
			`${description} requires the canvas to be open in a browser. Open ${browserUrl(ARCHBOARD_URL)} and retry.`,
		);
	}
}

/**
 * Makes sure a browser pane is on screen. When none is, it opens the canvas in the
 * default browser, on the repository of the vault when the registry knows it, and
 * waits for the first pane. That pane can read another checkout of the repository,
 * so the caller addresses it by its id.
 * @param vault - The vault the command addresses, or null when it addresses none.
 * @param description - What the command is doing, for the refusal message.
 * @returns The id of the pane in the browser it opened, or null when a pane was already on screen.
 * @throws {Error} With code BROWSER_REQUIRED when it cannot open a browser or no pane connects in time.
 */
export async function openCanvas(
	vault: string | null,
	description: string,
): Promise<string | null> {
	if ((await firstPane()) !== null) {
		return null;
	}
	const url = canvasUrl(vault);
	const needs = `${description} requires the canvas to be open in a browser`;
	const retry = `Open ${url} and retry.`;
	if (process.platform === "linux" && !process.env["DISPLAY"] && !process.env["WAYLAND_DISPLAY"]) {
		throw browserRequired(`${needs}, and this machine has no display to open one on. ${retry}`);
	}
	await open(url).catch((error: unknown) => {
		const reason = error instanceof Error ? error.message : String(error);
		throw browserRequired(`${needs}, and the default browser did not start: ${reason}. ${retry}`);
	});
	const pane = await paneArrives(Date.now() + PANE_MS.browserConnect);
	if (pane === null) {
		throw browserRequired(
			`${description} opened ${url} in the default browser, and no pane connected within ${PANE_MS.browserConnect / 1000} seconds. ${retry}`,
		);
	}
	return pane;
}

/**
 * Waits for the first pane to connect.
 * @param deadline - When to stop waiting, in epoch milliseconds.
 * @returns Its id, or null when the deadline passes first.
 */
async function paneArrives(deadline: number): Promise<string | null> {
	while (Date.now() < deadline) {
		// oxlint-disable-next-line no-await-in-loop -- the poll interval between looks at the server
		await new Promise((resolve) => setTimeout(resolve, PANE_MS.browserConnectPoll));
		// oxlint-disable-next-line no-await-in-loop -- each look depends on the wait before it
		const pane = await firstPane();
		if (pane !== null) return pane;
	}
	return null;
}

const PaneIdsSchema = z.looseObject({ panes: z.array(z.looseObject({ paneId: z.string() })) });

/**
 * The first pane on screen. A browser socket connects before its pane registers, and a
 * page on the repository chooser has no pane, so the socket count does not say this.
 * @returns Its id, or null when the server reports no pane.
 */
async function firstPane(): Promise<string | null> {
	const { panes } = PaneIdsSchema.parse(await getPanes(null));
	return panes[0]?.paneId ?? null;
}

/**
 * The canvas address that opens on the repository of a vault (ADR 0069), or the
 * plain address when the registry does not know the vault.
 * @param vault - The vault, or null.
 * @returns The address.
 */
function canvasUrl(vault: string | null): string {
	const base = browserUrl(ARCHBOARD_URL);
	const repository = vault === null ? undefined : registeredRepositoryOfVault(vault);
	if (repository === undefined) {
		return base;
	}
	// The page writes `/`, `@` and `:` of a name as they are, so the address reads like its own.
	const search = new URLSearchParams({ repoA: repository.name })
		.toString()
		.replaceAll("%2F", "/")
		.replaceAll("%40", "@")
		.replaceAll("%3A", ":");
	return `${new URL(base).origin}/?${search}`;
}

/**
 * The refusal of a command that needs a browser pane.
 * @param message - What happened and what the caller can do.
 * @returns The error, with code BROWSER_REQUIRED.
 */
function browserRequired(message: string): Error {
	const error = new Error(message);
	(error as Error & { code?: string }).code = "BROWSER_REQUIRED";
	return error;
}
