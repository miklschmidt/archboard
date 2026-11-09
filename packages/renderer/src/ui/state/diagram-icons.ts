// The icons a picture drawn in this page names, fetched from the Archboard server
// by name before drawing (TASK-247), or read from a model snapshot that carries them.
//
// A vault policy gives each node kind one Remix Icon, out of a set of three
// thousand. The page fetches the few a policy names, once each, and the
// renderer host reads them synchronously while drawing. An icon the server
// does not have is remembered as missing, and the renderer draws its fallback.

import { z } from "zod";

import type { SemanticPolicy } from "@archboard/model/policy";
import { iconsNamedBy } from "#shared/render/rules/policy-icons.ts";

/**
 * Where the server serves one icon's path data. It is relative, so a fetch resolves it against
 * the base of the document, and a build served under a sub-path reads its own icons.
 */
const ICON_URL = "assets/diagram-icons";

const IconSchema = z.object({ paths: z.array(z.string()) });

const loaded = new Map<string, readonly string[] | undefined>();
const loading = new Map<string, Promise<void>>();

/** The icons a snapshot carries, which the page reads in place of the server once it has them. */
let carried: Readonly<Record<string, readonly string[]>> | null = null;

/**
 * Fetch one icon, once.
 * @param name The icon's export name.
 * @returns Settles when it is loaded or known to be missing.
 */
function loadIcon(name: string): Promise<void> {
	const pending = loading.get(name);
	if (pending !== undefined) return pending;
	const load = readIcon(name).then((paths) => {
		loaded.set(name, paths);
		return undefined;
	});
	loading.set(name, load);
	return load;
}

/**
 * One icon's path data, from the snapshot the page reads or else from the Archboard server.
 * @param name The icon's export name.
 * @returns Its paths, or nothing when the source has no such icon.
 */
async function readIcon(name: string): Promise<readonly string[] | undefined> {
	if (carried === null) return fetchIcon(name);
	return Object.hasOwn(carried, name) ? carried[name] : undefined;
}

/**
 * One icon's path data from the Archboard server.
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
 * Read icons from a set of paths from now on, and fetch none. A snapshot carries every icon its
 * policy names, so an icon the set lacks is missing. The renderer calls it as it starts.
 * @param icons The paths of each icon, by name.
 */
function readIconsFrom(icons: Readonly<Record<string, readonly string[]>>): void {
	carried = icons;
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

export { loadDiagramIcons, loadedIconPaths, readIconsFrom };
