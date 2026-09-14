// One projection of a command contract into Commander, for both jobs Commander
// does here: parsing one command's arguments, and writing its help.
//
// Both read the same declared parameters, so a flag that parses is a flag help
// shows and a placeholder help prints is the arity the parser enforces. The two
// jobs differ only in what they include: parsing takes the hidden legacy tails
// and leaves the staged parameters to their stage, help shows the staged
// parameters and the shared options the command reads and leaves the tails out.

import { Argument, Command, Option } from "commander";
import type {
	AnyCommandContract,
	OptionParameter,
	PositionalParameter,
} from "@/cli/command-contract/contract";
import { sharedOptionsFor } from "@/cli/command-contract/shared-options";

/** Which job the projection is for. */
type Projection = "parse" | "help";

/**
 * Commander's collector for a repeatable option: appends rather than replaces.
 * @param value - The value this occurrence carried.
 * @param previous - The values collected so far.
 * @returns The values including this one.
 */
function collect(value: string, previous: string[] = []): string[] {
	return [...previous, value];
}

/**
 * Spells an option for Commander: every spelling, then the value placeholder
 * its arity calls for.
 * @param parameter - The option.
 * @returns The flags string Commander parses.
 */
function optionFlags(parameter: OptionParameter): string {
	const placeholder = parameter.placeholder ?? "value";
	const suffix =
		parameter.value === "required"
			? ` <${placeholder}>`
			: parameter.value === "optional"
				? ` [${placeholder}]`
				: "";
	return parameter.spellings.join(", ") + suffix;
}

/**
 * What help says an option is for, with the facts the description alone does
 * not carry: that it must be present, or when it must.
 * @param parameter - The option.
 * @returns The description help prints.
 */
function optionDescription(parameter: OptionParameter): string {
	if (parameter.required === true) {
		return `${parameter.description} (required)`;
	}
	if (parameter.requiredWhen !== undefined) {
		return `${parameter.description} (required ${parameter.requiredWhen})`;
	}
	return parameter.description;
}

/**
 * One declared option, as Commander holds it.
 * @param parameter - The option.
 * @param projection - Which job it is for.
 * @returns The option.
 */
function optionFor(parameter: OptionParameter, projection: Projection): Option {
	const option = new Option(optionFlags(parameter), optionDescription(parameter));
	if (parameter.occurrences === "append") {
		option.argParser(collect);
	}
	if (parameter.choices !== undefined) {
		option.choices(parameter.choices);
	}
	if (parameter.default !== undefined) {
		option.default(parameter.default);
	}
	return advertised(parameter, projection) ? option : option.hideHelp();
}

/**
 * Whether one option is shown by the job it is declared for.
 * @param parameter - The option.
 * @param projection - Which job.
 * @returns True when help should list it.
 */
function advertised(parameter: OptionParameter, projection: Projection): boolean {
	return parameter.hidden !== true && !(projection === "parse" && parameter.route === "staged");
}

/**
 * One declared positional, as Commander holds it.
 * @param parameter - The positional.
 * @returns The argument.
 */
function argumentFor(parameter: PositionalParameter): Argument {
	const name = `${parameter.placeholder ?? parameter.name}${parameter.repeatable ? "..." : ""}`;
	const spelled = parameter.required === true ? `<${name}>` : `[${name}]`;
	return new Argument(spelled, parameter.hidden === true ? "" : parameter.description);
}

/**
 * Whether a parameter takes part in one job.
 *
 * A staged parameter is parsed by its stage after the command's prerequisites,
 * never by the ordinary parser; a hidden tail is parsed and never shown.
 * @param parameter - The parameter.
 * @param projection - Which job.
 * @returns True when the job includes it.
 */
function included(
	parameter: OptionParameter | PositionalParameter,
	projection: Projection,
): boolean {
	if (projection === "parse") {
		return parameter.route !== "staged";
	}
	return parameter.hidden !== true;
}

/** A contract's command, and its options by parameter key. */
interface DeclaredCommand {
	readonly command: Command;
	readonly options: ReadonlyMap<string, Option>;
}

/**
 * Declares a contract's positionals and options on one Commander command.
 *
 * For parsing, output and help are suppressed so this CLI owns every message
 * and every unknown token is refused by the contract rather than by Commander.
 * For help, the shared options the command reads are declared after its own,
 * in full, so the command's help stands alone.
 * @param contract - The command contract.
 * @param projection - Which job the command is for.
 * @param name - What to call the command; its own path when absent.
 * @returns The command and its options by key.
 */
function declareCommand(
	contract: AnyCommandContract,
	projection: Projection,
	name: string = contract.path.join(" "),
): DeclaredCommand {
	const command = new Command(name).allowExcessArguments(true);
	if (projection === "parse") {
		silence(command, contract);
	}
	const options = declareParameters(command, contract, projection);
	for (const option of sharedFor(contract, projection)) {
		command.addOption(optionFor(option, projection));
	}
	return { command, options };
}

/**
 * Declares the contract's own parameters on the command, in declaration order.
 * @param command - The command being declared.
 * @param contract - The command contract.
 * @param projection - Which job the command is for.
 * @returns The declared options, by parameter key.
 */
function declareParameters(
	command: Command,
	contract: AnyCommandContract,
	projection: Projection,
): Map<string, Option> {
	const options = new Map<string, Option>();
	for (const parameter of contract.parameters.filter((one) => included(one, projection))) {
		if (parameter.kind === "positional") {
			command.addArgument(argumentFor(parameter));
			continue;
		}
		const option = optionFor(parameter, projection);
		command.addOption(option);
		options.set(parameter.key, option);
	}
	return options;
}

/**
 * The shared options one job declares: help shows the ones the command reads,
 * parsing declares none because routing has already taken them out of argv.
 * @param contract - The command contract.
 * @param projection - Which job.
 * @returns The shared options to declare.
 */
function sharedFor(contract: AnyCommandContract, projection: Projection): OptionParameter[] {
	if (projection !== "help") {
		return [];
	}
	return sharedOptionsFor(contract.shared).map((option) => {
		const exclusions = contract.parameters.flatMap((parameter) =>
			parameter.kind === "option" && parameter.excludesShared?.some((key) => key === option.key)
				? [parameter.spellings[0]]
				: [],
		);
		return exclusions.length === 0
			? option
			: {
					...option,
					description: `${option.description}; does not apply with ${exclusions.join(", ")}`,
				};
	});
}

/**
 * Makes a parsing command say nothing of its own: output and help are
 * suppressed so this CLI writes every message, and a staged command passes
 * every token through to its stage.
 * @param command - The parsing command.
 * @param contract - The command contract.
 */
function silence(command: Command, contract: AnyCommandContract): void {
	command
		.exitOverride()
		.configureOutput({
			/** Swallows Commander's stdout; this CLI writes every message itself. */
			writeOut: () => {},
			/** Swallows Commander's stderr; this CLI writes every message itself. */
			writeErr: () => {},
		})
		.helpOption(false)
		.helpCommand(false);
	if (contract.parameters.some((parameter) => parameter.route === "staged-tokens")) {
		command.allowUnknownOption(true).passThroughOptions();
	}
}

/**
 * The usage line one contract's help prints, without the program name.
 * @param contract - The command contract.
 * @returns The usage, such as `semantic edit [options] <name>`.
 */
function usageOf(contract: AnyCommandContract): string {
	const { command } = declareCommand(contract, "help");
	return command.createHelp().commandUsage(command);
}

export { declareCommand, usageOf, type DeclaredCommand, type Projection };
