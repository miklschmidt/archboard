// The shape of one entry in the CLI command table: which contract owns it, how it is
// summarised in help, and how its subcommands are found. The table itself lives in run.ts.
import type { AnyCommandContract } from "@/cli/command-contract/contract";

interface ContractCommand {
	contract: AnyCommandContract;
	handlerOwner: string;
}

type RouteOwner = ContractCommand;

interface CommandRoute {
	owner: RouteOwner;
	summary?: string;
	usage?: string;
	children?: Readonly<Record<string, CommandRoute>>;
	bare?:
		| { kind: "default"; child: string; withLeadingOptions: boolean }
		| { kind: "namespace-refusal"; message: string };
	childDiscovery?: {
		kind: "first-positional";
		options: Readonly<Record<string, "flag" | "value">>;
	};
}

type CommandRoutes = Readonly<Record<string, CommandRoute>>;

/** The one registry projected as all current canonical contract paths. */
interface CliRegistryEntry {
	name: string;
	parent: string | null;
	classification: "board" | "browser" | "neither";
	handlerOwner: string;
	parserOwner: string;
	bare?: CommandRoute["bare"];
	childDiscovery?: CommandRoute["childDiscovery"];
	contract: AnyCommandContract;
}

/**
 * The one-line summary help prints for a route: the table's own wording when it has one,
 * otherwise the contract's.
 * @param route - The command route.
 * @returns The summary line.
 */
const commandSummary = (route: CommandRoute): string =>
	route.summary ?? route.owner.contract.summary;

/**
 * The usage text help prints for a route: the table's own wording when it has one, otherwise
 * the contract's.
 * @param route - The command route.
 * @returns The usage text.
 */
const commandUsage = (route: CommandRoute): string => route.usage ?? route.owner.contract.usage;

/**
 * Pairs a contract with the source file that owns its handler, which the registry reports.
 * @param value - The command contract.
 * @param handlerOwner - Repository-relative path of the file defining the contract.
 * @returns The owner entry for the command table.
 */
const contract = (value: AnyCommandContract, handlerOwner: string): ContractCommand => ({
	contract: value,
	handlerOwner,
});

/**
 * A subcommand route with no table-level summary or usage of its own.
 * @param owner - The contract owner of the subcommand.
 * @returns The child route.
 */
const child = (owner: RouteOwner): CommandRoute => ({ owner });

export {
	type ContractCommand,
	type RouteOwner,
	type CommandRoute,
	type CommandRoutes,
	type CliRegistryEntry,
	commandSummary,
	commandUsage,
	contract,
	child,
};
