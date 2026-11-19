// A code pass that met a checkout without the Python server, as the page reads it, and the press
// of Fix with Codex in the Measures of the focused pane (TASK-646.09).

import type { ArchitectureModelRead } from "@archboard/model/contract";
import type { RememberedFindings } from "@archboard/code-intel/code-check";
import type { RepositoryEntry } from "@archboard/workspace/repositories";
import { pollUntil, type AgentBrowserSession } from "./agent-browser.ts";

/** The server the setup brief names for Python, which Fix with Codex asks for. */
const PYTHON_SERVER = "pyright-langserver";

/**
 * Have the page read a remembered pass over the model of a vault that found no Python server in
 * the checkout of another repository, then press Fix with Codex in the Measures of the focused
 * pane, which shows that model.
 * @param browser The page.
 * @param read Where the page reads: the vault of the pane's model, and the vault of the checkout
 * without the server.
 * @param read.vault The vault of the model the pane shows.
 * @param read.missing The vault of the checkout without the server.
 */
async function fixMissingServer(
	browser: AgentBrowserSession,
	read: { readonly vault: string; readonly missing: string },
): Promise<void> {
	const model = await browser.eval<ArchitectureModelRead>(
		`fetch('/api/architecture/model?' + new URLSearchParams({ vault: ${JSON.stringify(read.vault)} })).then((answer) => answer.json())`,
	);
	const listing = await browser.eval<{ readonly repositories: readonly RepositoryEntry[] }>(
		"fetch('/api/repositories').then((answer) => answer.json())",
	);
	const repo = listing.repositories.find((each) => each.vault === read.missing)?.name;
	if (!model.success || repo === undefined) throw new Error("no model or no repository to read");
	const remembered: RememberedFindings = {
		readings: [],
		models: [
			{
				model: model.manifest.id,
				state: model.selectedState?.id ?? null,
				revision: model.revision,
				checkedAt: "2026-11-19T12:00:00.000Z",
				findings: [],
				skipped: [{ reason: "language-server-missing", repo, detail: "python: none configured" }],
			},
		],
	};
	await browser.run([
		"network",
		"route",
		"**/api/vault/code-findings*",
		"--body",
		JSON.stringify({ success: true, ...remembered }),
	]);
	await browser.run(["click", '[data-column-dialog="measures"]']);
	await browser.run(["click", '[data-measures-tab="interface"]']);
	const fix = `[data-slot="model-measures-server"][data-repo="${repo}"] button`;
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${fix}') !== null`),
		Boolean,
		"Fix with Codex beside the missing server",
	);
	await browser.run(["click", fix]);
}

export { PYTHON_SERVER, fixMissingServer };
