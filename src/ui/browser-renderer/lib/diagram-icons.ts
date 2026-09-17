// The icons a picture drawn in this page names, fetched from the canvas server
// by name before drawing (TASK-247).
//
// A vault policy gives each node kind one Remix Icon, out of a set of three
// thousand. The page fetches the few a policy names, once each, and the
// renderer host reads them synchronously while drawing. An icon the server
// does not have is remembered as missing, and the renderer draws its fallback.

import { z } from "zod";

import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";

/** Where the canvas serves one icon's path data. */
const ICON_URL = "/assets/diagram-icons";

/** The icon drawn for a kind the policy does not describe. */
const FALLBACK_ICON = "RiQuestionLine";

const IconSchema = z.object({ paths: z.array(z.string()) });

const loaded = new Map<string, readonly string[] | undefined>();
const loading = new Map<string, Promise<void>>();

/**
 * Every icon a picture drawn under a policy can name.
 * @param policy The vault policy.
 * @returns The icon names.
 */
function iconsNamedBy(policy: SemanticPolicy): Set<string> {
	const kinds = [
		...Object.values(policy.nodeKinds),
		...Object.values(DEFAULT_SEMANTIC_POLICY.nodeKinds),
	];
	return new Set([FALLBACK_ICON, ...kinds.map((kind) => kind.icon)]);
}

/**
 * Fetch one icon, once.
 * @param name The icon's export name.
 * @returns Settles when it is loaded or known to be missing.
 */
function loadIcon(name: string): Promise<void> {
	const pending = loading.get(name);
	if (pending !== undefined) return pending;
	const load = fetchIcon(name).then((paths) => {
		loaded.set(name, paths);
		return undefined;
	});
	loading.set(name, load);
	return load;
}

/**
 * One icon's path data from the canvas server.
 * @param name The icon's export name.
 * @returns Its paths, or nothing when the server has no such icon or did not answer.
 */
async function fetchIcon(name: string): Promise<readonly string[] | undefined> {
	try {
		const response = await fetch(`${ICON_URL}/${encodeURIComponent(name)}.json`);
		return response.ok ? IconSchema.parse(await response.json()).paths : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Load every icon a policy names.
 * @param policy The vault policy.
 * @returns Settles when all of them are loaded or known to be missing.
 */
async function loadDiagramIcons(policy: SemanticPolicy): Promise<void> {
	await Promise.all([...iconsNamedBy(policy)].map((name) => loadIcon(name)));
}

/**
 * One loaded icon's path data.
 * @param name The icon's export name.
 * @returns Its paths, or nothing when it is missing or was never loaded.
 */
function loadedIconPaths(name: string): readonly string[] | undefined {
	return loaded.get(name);
}

export { loadDiagramIcons, loadedIconPaths };
