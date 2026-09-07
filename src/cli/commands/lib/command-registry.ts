// Projects the command table into the contract registry, the CLI surface, and per-command
// help, and asserts the board/browser architecture rule over every registered command.
import type { AnyCommandContract } from "@/cli/command-contract/contract";
import {
	type CliRegistryEntry,
	type CommandRoute,
	type CommandRoutes,
	type RouteOwner,
	commandSummary,
	commandUsage,
} from "@/cli/commands/lib/command-route";

const boardNamespaces = new Set(["board", "arrange", "snapshot", "compare"]);
const sessionRelationships = [
	"/api/selection",
	"/api/panes",
	"/api/viewport",
	"/api/browser/",
	"/api/boards/open",
];

/**
 * Every way the CLI can be invoked, as `{ name, subcommands }`: the command table read as data
 * for contract and documentation checks.
 * @param routes - The command table.
 * @returns One entry per top-level command with its subcommand names.
 */
function cliSurfaceOf(routes: CommandRoutes): { name: string; subcommands: readonly string[] }[] {
	return Object.entries(routes).map(([name, route]) => ({
		name,
		subcommands: Object.keys(route.children ?? {}),
	}));
}

/**
 * Classifies a command by what it touches: the browser namespace, a persisted board, or neither.
 * @param command - The command contract.
 * @returns The classification the registry reports and the architecture rule checks.
 */
function commandClassification(command: AnyCommandContract): CliRegistryEntry["classification"] {
	if (command.path[0] === "browser") {
		return "browser";
	}
	if (command.prerequisites.includes("board") || boardNamespaces.has(command.path[0] ?? "")) {
		return "board";
	}
	return "neither";
}

/**
 * Whether the command declares the --pane option, the marker of a live-pane target.
 * @param command - The command contract.
 * @returns True when any option spelling is --pane.
 */
function usesPaneOption(command: AnyCommandContract): boolean {
	return command.parameters.some(
		(parameter) =>
			"spellings" in parameter && parameter.spellings.some((spelling) => spelling === "--pane"),
	);
}

/**
 * Whether the command calls a canvas route that reads or changes browser-session state.
 * @param command - The command contract.
 * @returns True when any declared relationship targets a session route.
 */
function usesSessionRelationship(command: AnyCommandContract): boolean {
	return command.relationships.some((relationship) =>
		sessionRelationships.some((prefix) => relationship.path.startsWith(prefix)),
	);
}

/**
 * Whether the command depends on a connected browser session in any declared way.
 * @param command - The command contract.
 * @returns True for a browser prerequisite, a browser effect, a --pane option or a session route.
 */
function usesBrowserSession(command: AnyCommandContract): boolean {
	return (
		command.prerequisites.includes("browser") ||
		command.effects.includes("browser") ||
		usesPaneOption(command) ||
		usesSessionRelationship(command)
	);
}

/**
 * Finds the first way a command breaks the architecture rule: browser-session work lives only
 * in the browser namespace, and the browser namespace never writes a board note.
 * @param entry - The registry entry to check.
 * @returns The violation message, or null when the command is placed correctly.
 */
function architectureViolation(entry: CliRegistryEntry): string | null {
	const { classification, contract: command, name } = entry;
	if (classification !== "browser") {
		return usesBrowserSession(command)
			? `${name} consumes browser-session state but is classified ${classification}.`
			: null;
	}
	if (command.path[0] !== "browser") {
		return `${name} is a browser operation outside the browser namespace.`;
	}
	if (command.effects.includes("write")) {
		return `${name} is a browser operation that writes a board note.`;
	}
	return null;
}

/**
 * Throws when a registered command breaks the architecture rule, so the table cannot be built
 * with a misplaced command.
 * @param entry - The registry entry to check.
 */
function assertCommandArchitecture(entry: CliRegistryEntry): void {
	const violation = architectureViolation(entry);
	if (violation !== null) {
		throw new Error(violation);
	}
}

/**
 * Names the parser a command's arguments go through, which the registry reports for audits.
 * @param owner - The command's contract owner.
 * @returns The staged token parser when any parameter routes staged tokens, else the Commander one.
 */
function parserOwner(owner: RouteOwner): string {
	return owner.contract.parameters.some((parameter) => parameter.route === "staged-tokens")
		? "CommandContract staged token parser"
		: "CommandContract concrete Commander parser";
}

/**
 * Flattens one route and its children into registry entries with space-joined names.
 * @param name - The route's full name so far.
 * @param route - The route to flatten.
 * @param parent - The parent route's name, or null at the top level.
 * @returns The entry for this route followed by every descendant's.
 */
function flattenRoute(
	name: string,
	route: CommandRoute,
	parent: string | null,
): CliRegistryEntry[] {
	const current: CliRegistryEntry = {
		name,
		parent,
		classification: commandClassification(route.owner.contract),
		handlerOwner: route.owner.handlerOwner,
		parserOwner: parserOwner(route.owner),
		...(route.bare ? { bare: route.bare } : {}),
		...(route.childDiscovery ? { childDiscovery: route.childDiscovery } : {}),
		contract: route.owner.contract,
	};
	return [
		current,
		...Object.entries(route.children ?? {}).flatMap(([segment, nested]) =>
			flattenRoute(`${name} ${segment}`, nested, name),
		),
	];
}

/**
 * Builds the contract registry from the command table, checking every entry's placement.
 * @param routes - The command table.
 * @returns Every command and subcommand as a registry entry.
 */
function registryOf(routes: CommandRoutes): CliRegistryEntry[] {
	const entries = Object.entries(routes).flatMap(([name, route]) =>
		flattenRoute(name, route, null),
	);
	for (const entry of entries) {
		assertCommandArchitecture(entry);
	}
	return entries;
}

/**
 * Looks up a direct subcommand of a route without treating a missing child table as an error.
 * @param root - The parent route.
 * @param name - The subcommand name.
 * @returns The child route, or undefined when the route has no such child.
 */
function childOf(root: CommandRoute, name: string): CommandRoute | undefined {
	return root.children ? root.children[name] : undefined;
}

/**
 * Resolves a help topic of one or two words to the route it names.
 * @param routes - The command table.
 * @param topic - The words after `help`.
 * @returns The route and whether it is a subcommand, or null when the topic names nothing.
 */
function helpRoute(
	routes: CommandRoutes,
	topic: readonly string[],
): { route: CommandRoute; nested: boolean } | null {
	const [name, childName, ...tail] = topic;
	if (!name || tail.length > 0) {
		return null;
	}
	const root = routes[name];
	if (root === undefined) {
		return null;
	}
	if (childName === undefined) {
		return { route: root, nested: false };
	}
	const nested = childOf(root, childName);
	return nested === undefined ? null : { route: nested, nested: true };
}

/**
 * Renders one help topic from the same route and contract registry used for dispatch. A
 * subcommand's help adds the contract description, prerequisites and effects.
 * @param routes - The command table.
 * @param topic - The words after `help`.
 * @returns The help text, or null when the topic names no command.
 */
function helpFor(routes: CommandRoutes, topic: readonly string[]): string | null {
	const found = helpRoute(routes, topic);
	if (found === null) {
		return null;
	}
	const { route, nested } = found;
	const base = `Usage: archboard ${commandUsage(route)}\n  ${commandSummary(route)}\n`;
	if (!nested) {
		return base;
	}
	const prerequisites = route.owner.contract.prerequisites.join(", ") || "none";
	const effects = route.owner.contract.effects.join(", ") || "none";
	return (
		`${base}  ${route.owner.contract.description}\n` +
		`  Prerequisites: ${prerequisites}. Effects: ${effects}.\n`
	);
}

export { cliSurfaceOf, registryOf, helpFor, childOf };
