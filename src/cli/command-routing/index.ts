// How the CLI gets from an argv to one command contract: the shape of the
// command table, the projection of that table into a registry and help, and
// the session that dispatches one invocation and sets its exit code. The table
// itself is the command family's, and lives in src/cli/commands/run.ts.

export {
	type ContractCommand,
	type RouteOwner,
	type CommandRoute,
	type CommandRoutes,
	type CliRegistryEntry,
	contract,
	child,
} from "@/cli/command-routing/lib/route";

export { cliSurfaceOf, registryOf } from "@/cli/command-routing/lib/registry";

export { commanderTree, helpText, usageLine } from "@/cli/command-routing/lib/help";

export { runCliWith, type CliBootstrap } from "@/cli/command-routing/lib/session";
