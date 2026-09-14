// Projects the command table into the contract registry, the CLI surface, and per-command
// help, and asserts the board/browser architecture rule over every registered command.
import type { AnyCommandContract } from "@/cli/command-contract/contract";
import type {
	CliRegistryEntry,
	CommandRoute,
	CommandRoutes,
	RouteOwner,
} from "@/cli/command-routing/lib/route";

// `semantic` joins these because a semantic board is a board: the commands in
// that namespace read and write one, even though it is a JSON aggregate rather
// than an Excalidraw note and so does not take the `board` prerequisite, which
// resolves a note (ADR 0023).
const boardNamespaces = new Set(["board", "arrange", "snapshot", "compare", "semantic"]);
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
	if (command.prerequisites.includes("board") || boardNamespaces.has(command.path[0])) {
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

export { cliSurfaceOf, registryOf, childOf };
