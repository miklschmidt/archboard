import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { z } from "zod";
import type { workspaceShape } from "@archboard/workspace/shapes";
import type { ModelDocument } from "@archboard/model-contract";

/** What these tests read of the pane report that `GET /api/panes` answers with. */
type PanesBody = {
	success: boolean;
	paneCount: number;
	panes: {
		paneId: string;
		clientId: string;
		architecture: ModelDocument<"paneContext">["architecture"] | null;
	}[];
};
type HealthBody = { websocket_clients: number };
type ElementsBody = { elements: unknown[] };
type ChangesBody = { cursor: number };
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const serverPath = join(repoRoot, "apps/server/src/server.ts");

/**
 * The repository a test server lists: what a pane's address names beside its
 * model (ADR 0050). Asked as the server's own page asks.
 * @param base The server's base URL.
 * @returns The repository's name.
 * @throws {Error} When the server lists no repository.
 */
async function servedRepository(base: string): Promise<string> {
	const response = await fetch(`${base}/api/repositories`, {
		headers: { Origin: base, "Sec-Fetch-Site": "same-origin" },
	});
	const body = (await response.json()) as z.infer<
		ReturnType<typeof workspaceShape<"repositoryListing">>
	>;
	const [served] = body.repositories;
	if (served === undefined) {
		throw new Error(`The server at ${base} lists no repository.`);
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
