import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { buildPanesReport } from "@archboard/server-lifecycle/panes";
import type { z } from "zod";
import type { RepositoryListingSchema } from "@archboard/workspace/repositories";
import type { SemanticPaneContextSchema } from "@archboard/board/pane-context";

type PanesReport = ReturnType<typeof buildPanesReport>;
type PanesBody = Omit<PanesReport, "panes"> & {
	success: boolean;
	panes: (PanesReport["panes"][number] & {
		architecture: z.infer<typeof SemanticPaneContextSchema>["architecture"] | null;
	})[];
};
type HealthBody = { websocket_clients: number };
type ElementsBody = { elements: unknown[] };
type ChangesBody = { cursor: number };
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const serverPath = join(repoRoot, "apps/server/src/server.ts");

/**
 * The repository a server lists its own vault under: what a pane's address
 * names beside its board (ADR 0050). Asked as the server's own page asks.
 * @param base The server's base URL.
 * @returns The repository's name.
 * @throws {Error} When the server lists no repository for its vault.
 */
async function servedRepository(base: string): Promise<string> {
	const response = await fetch(`${base}/api/repositories`, {
		headers: { Origin: base, "Sec-Fetch-Site": "same-origin" },
	});
	const body = (await response.json()) as z.infer<typeof RepositoryListingSchema>;
	const served =
		body.served === null
			? undefined
			: body.repositories.find((entry) => entry.vault === body.served);
	if (served === undefined) {
		throw new Error(`The server at ${base} lists no repository for the vault it serves.`);
	}
	return served.name;
}

export {
	serverPath,
	servedRepository,
	type PanesBody,
	type HealthBody,
	type ElementsBody,
	type ChangesBody,
};
