// The order of the docs: the sidebar, the previous and next links, and the search's page names.
// A page's path is relative to /docs/.

export interface DocsPage {
	/** The path under /docs/, with no slashes at either end. The introduction is "". */
	readonly path: string;
	/** The name the sidebar shows. */
	readonly label: string;
}

export interface DocsGroup {
	readonly title: string;
	readonly pages: readonly DocsPage[];
}

/**
 * The CLI's top-level commands, by the reference page that describes them. A label marks each
 * command in backticks, which the sidebar and the pager set in mono.
 */
export const cliGroups = [
	{
		slug: "setup",
		label: "`init`, `repo`, and `telemetry`",
		title: "Setup, checkouts, and telemetry",
		description:
			"Initialize Archboard in a repository, register local checkouts, and configure usage telemetry.",
		commands: ["init", "repo", "telemetry"],
	},
	{
		slug: "model",
		label: "`model`",
		title: "The `model` commands",
		description: "Read, edit, compare, render, and archive a vault's canonical architecture model.",
		commands: ["model"],
	},
	{
		slug: "upgrade",
		label: "`upgrade`",
		title: "The `upgrade` commands",
		description: "Inspect relationship inventories and migrate vaults to the current format.",
		commands: ["upgrade"],
	},
	{
		slug: "check",
		label: "`check`",
		title: "The `check` commands",
		description:
			"Validate the model against its vault vocabulary, source code, and tracked embeds. Exits non-zero when errors or warnings remain.",
		commands: ["check"],
	},
	{
		slug: "server",
		label: "`start`, `stop`, and `status`",
		title: "Server commands",
		description: "Start, stop, restart, and check the status of the local Archboard server.",
		commands: ["start", "stop", "restart", "status"],
	},
	{
		slug: "browser",
		label: "`browser`",
		title: "The `browser` commands",
		description: "Open readings in the browser UI and inspect open panes.",
		commands: ["browser"],
	},
] as const;

export const docsNav: readonly DocsGroup[] = [
	{
		title: "Start",
		pages: [
			{ path: "", label: "Introduction" },
			{ path: "install", label: "Install and set up" },
			{ path: "concepts", label: "Concepts" },
			{ path: "first-map", label: "Map your first repository" },
		],
	},
	{
		title: "Guides",
		pages: [
			{ path: "gate", label: "Run checks as a gate" },
			{ path: "pull-requests", label: "Architecture on pull requests" },
			{ path: "platform", label: "Application and infrastructure" },
			{ path: "home-repo", label: "In a Home Repo" },
		],
	},
	{
		title: "Reference",
		pages: [
			{ path: "reference/cli", label: "CLI overview" },
			...cliGroups.map((group) => ({ path: `reference/cli/${group.slug}`, label: group.label })),
			{ path: "reference/findings", label: "Check findings" },
			{ path: "reference/actions", label: "GitHub Actions" },
			{ path: "reference/schemas", label: "Schemas" },
		],
	},
];

/** Every page in reading order. */
export const docsPages: readonly DocsPage[] = docsNav.flatMap((group) => group.pages);

/**
 * The page before and after one page, in reading order.
 * @param path The page's path under /docs/.
 * @returns The neighbours, when there are any.
 */
export function neighbours(path: string): {
	previous?: DocsPage | undefined;
	next?: DocsPage | undefined;
} {
	const index = docsPages.findIndex((page) => page.path === path);
	if (index < 0) return {};
	return { previous: docsPages[index - 1], next: docsPages[index + 1] };
}

/** Whether a page is a page of CLI commands, which the sidebar nests under the CLI overview. */
export function isCliGroup(path: string): boolean {
	return path.startsWith("reference/cli/");
}

/** The address of a docs page under the site's base. */
export function docsHref(path: string): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	return path === "" ? `${base}/docs/` : `${base}/docs/${path}/`;
}
