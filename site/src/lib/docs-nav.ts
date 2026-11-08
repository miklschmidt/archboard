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

/** The CLI's top-level commands, by the reference page that describes them. */
export const cliGroups = [
	{
		slug: "setup",
		label: "init and repo",
		title: "Setup and checkouts",
		description:
			"Set a repository up for Archboard, and tell this machine where each repository's checkout is.",
		commands: ["init", "repo"],
	},
	{
		slug: "model",
		label: "model",
		title: "The model commands",
		description:
			"Read, write, compare, render and keep the canonical architecture model of a vault.",
		commands: ["model"],
	},
	{
		slug: "check",
		label: "check",
		title: "The check commands",
		description:
			"Hold the model to its vocabulary, its code and the pictures that embed it. Exit 1 means a finding remains.",
		commands: ["check"],
	},
	{
		slug: "server",
		label: "start, stop and status",
		title: "The server commands",
		description:
			"Start, stop and inspect the local Archboard server that the other commands talk to.",
		commands: ["start", "stop", "restart", "status"],
	},
	{
		slug: "browser",
		label: "browser",
		title: "The browser commands",
		description:
			"Show a reading to the person in the browser, and inspect the panes that are open.",
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
			{ path: "first-map", label: "A first map in one session" },
		],
	},
	{
		title: "Guides",
		pages: [
			{ path: "gate", label: "The check as a gate" },
			{ path: "pull-requests", label: "Architecture on pull requests" },
			{ path: "platform", label: "Application and infrastructure" },
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

/** Whether a page's label names commands, such as `init and repo`, which sets it in mono. */
export function namesCommands(path: string): boolean {
	return path.startsWith("reference/cli/");
}

/** The address of a docs page under the site's base. */
export function docsHref(path: string): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	return path === "" ? `${base}/docs/` : `${base}/docs/${path}/`;
}
