// Picks which contract a top-level command's remaining arguments address: a named
// subcommand, one discovered after leading options, the route's default child, or the
// namespace itself.
import { CliUsageError } from "@/cli/command-contract/contract";
import { type CommandRoute, type RouteOwner } from "@/cli/commands/lib/command-route";
import { childOf } from "@/cli/commands/lib/command-registry";

interface DispatchedCommand {
	root: CommandRoute;
	selected: RouteOwner;
	argv: string[];
}

interface ChildSelection {
	route: CommandRoute;
	index: number;
}

/**
 * How many argv slots a leading option occupies during first-positional discovery.
 * @param options - The discovery table of known options and whether each takes a value.
 * @param token - The `--name` or `--name=value` token.
 * @returns Two for a value option without an inline value, one otherwise, or null when the
 * option is unknown and discovery must stop.
 */
function discoveryOptionWidth(
	options: Readonly<Record<string, "flag" | "value">>,
	token: string,
): number | null {
	const [spelling, inlineValue] = token.slice(2).split("=", 2);
	const option = options[spelling!];
	if (option === undefined) {
		return null;
	}
	return option === "value" && inlineValue === undefined ? 2 : 1;
}

/**
 * Finds the subcommand named by the first positional token after any known leading options,
 * for namespaces whose flags may precede the subcommand (`snapshot --force restore x`).
 * @param root - The namespace route.
 * @param rest - The arguments after the command name.
 * @returns The child and the index of its token, or undefined when none is discovered.
 */
function discoveredChild(root: CommandRoute, rest: readonly string[]): ChildSelection | undefined {
	const discovery = root.childDiscovery;
	if (discovery === undefined) {
		return undefined;
	}
	let index = 0;
	while (index < rest.length) {
		const token = rest[index]!;
		if (!token.startsWith("--")) {
			const route = childOf(root, token);
			return route === undefined ? undefined : { route, index };
		}
		const width = discoveryOptionWidth(discovery.options, token);
		if (width === null) {
			return undefined;
		}
		index += width;
	}
	return undefined;
}

/**
 * Selects a subcommand by its leading token, falling back to first-positional discovery.
 * @param root - The namespace route.
 * @param rest - The arguments after the command name.
 * @returns The selected child and its token index, or undefined when no child is named.
 */
function selectedChild(root: CommandRoute, rest: readonly string[]): ChildSelection | undefined {
	const first = rest[0];
	const direct = first ? childOf(root, first) : undefined;
	if (direct !== undefined) {
		return { route: direct, index: 0 };
	}
	return discoveredChild(root, rest);
}

/**
 * Whether a namespace's default child applies: nothing follows the name, or only options do
 * and the route allows leading options.
 * @param bare - The route's default-child rule.
 * @param rest - The arguments after the command name.
 * @returns True when the default child should run.
 */
function defaultChildApplies(
	bare: { withLeadingOptions: boolean },
	rest: readonly string[],
): boolean {
	return rest.length === 0 || (bare.withLeadingOptions && rest[0]?.startsWith("--") === true);
}

/**
 * Resolves what runs when no subcommand was named: a refusal for a bare namespace, its
 * default child, or the namespace contract itself.
 * @param root - The namespace route.
 * @param rest - The arguments after the command name.
 * @returns The route to run.
 */
function bareSelection(root: CommandRoute, rest: readonly string[]): CommandRoute {
	const bare = root.bare;
	if (bare === undefined) {
		return root;
	}
	if (bare.kind === "namespace-refusal") {
		if (root.childDiscovery === undefined) {
			throw new CliUsageError(bare.message);
		}
		return root;
	}
	if (defaultChildApplies(bare, rest)) {
		return childOf(root, bare.child) ?? root;
	}
	return root;
}

/**
 * Resolves the contract a top-level command's arguments address and strips the subcommand
 * token so the contract's own parser never sees it.
 * @param root - The top-level route.
 * @param rest - The arguments after the command name.
 * @returns The root, the selected owner and the arguments for its parser.
 */
function dispatchedCommand(root: CommandRoute, rest: readonly string[]): DispatchedCommand {
	const selection = selectedChild(root, rest);
	const selectedRoute = selection?.route ?? bareSelection(root, rest);
	const argv = rest.filter((_, index) => index !== selection?.index);
	return { root, selected: selectedRoute.owner, argv };
}

export { type DispatchedCommand, dispatchedCommand };
