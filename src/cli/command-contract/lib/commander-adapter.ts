import { Command, Option } from "commander";
import { z } from "zod";
import type {
	AnyCommandContract,
	TokenParameter,
	TokenRecord,
} from "@/cli/command-contract/contract";
import { CliUsageError } from "@/cli/command-contract/contract";

/** The value shapes a parsed token may take, mirroring one TokenRecord entry. */
const tokenValueSchema = z.union([z.string(), z.boolean(), z.array(z.string()), z.undefined()]);

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
 * @param spellings - The option's spellings, long and short.
 * @param value - Whether the option takes a value, and whether it is optional.
 * @returns The flags string Commander parses.
 */
function optionFlags(
	spellings: readonly string[],
	value: "none" | "required" | "optional",
): string {
	const suffix = value === "required" ? " <value>" : value === "optional" ? " [value]" : "";
	return spellings.join(", ") + suffix;
}

/**
 * Rewrites Commander's unknown-option complaint in this CLI's words.
 * @param message - Commander's message, without its "error:" prefix.
 * @returns The refusal, or undefined when the message is about something else.
 */
function unknownFlagRefusal(message: string): CliUsageError | undefined {
	const unknown = message.match(/^unknown option '([^']+)'/iu);
	return unknown ? new CliUsageError(`Unknown flag ${unknown[1]?.split("=", 1)[0]}`) : undefined;
}

/**
 * Rewrites Commander's missing-argument complaint in this CLI's words, naming
 * the flag as the person spelled it rather than as Commander describes it.
 * @param message - Commander's message, without its "error:" prefix.
 * @returns The refusal, or undefined when the message is about something else.
 */
function missingValueRefusal(message: string): CliUsageError | undefined {
	const missing = message.match(/^option '([^']+)' argument missing/iu);
	if (!missing) {
		return undefined;
	}
	const spelling = missing[1]?.match(/--[a-z0-9-]+/iu)?.[0] ?? missing[1];
	return new CliUsageError(`Flag ${spelling} requires a value`);
}

/**
 * Turns whatever Commander threw into a usage refusal this CLI would have
 * written itself, so its parser is never visible in the message.
 * @param error - The value Commander threw.
 * @returns The usage error to raise instead.
 */
function commanderUsageError(error: unknown): CliUsageError {
	const raw = error instanceof Error ? error.message : String(error);
	const message = raw.replace(/^error:\s*/iu, "");
	return (
		unknownFlagRefusal(message) ??
		missingValueRefusal(message) ??
		new CliUsageError(message[0]?.toUpperCase() + message.slice(1))
	);
}

/**
 * Hides single-dash tokens Commander would read as short options, so a value
 * such as `-3` reaches the handler as itself. `-` alone is left as it is.
 * @param argv - The arguments after the command path.
 * @param declared - Every option spelling the contract declares.
 * @returns The shielded arguments and the map that restores them.
 */
function shieldSingleDashTokens(
	argv: readonly string[],
	declared: ReadonlySet<string>,
): { values: string[]; restored: Map<string, string> } {
	const restored = new Map<string, string>();
	const values = argv.map((token, index) => {
		if (token === "-" || token.startsWith("--") || !token.startsWith("-") || declared.has(token)) {
			return token;
		}
		const placeholder = `archboard-single-dash-${index}`;
		restored.set(placeholder, token);
		return placeholder;
	});
	return { values, restored };
}

/**
 * Puts the shielded single-dash tokens back into a parsed value.
 * @param value - What Commander produced for one parameter.
 * @param restored - The placeholders and the tokens they stand for.
 * @returns The value with every placeholder replaced.
 */
function restoreToken(value: unknown, restored: ReadonlyMap<string, string>): TokenRecord[string] {
	const token = tokenValueSchema.parse(value);
	if (typeof token === "string") {
		return restored.get(token) ?? token;
	}
	if (Array.isArray(token)) {
		return token.map((item) => restored.get(item) ?? item);
	}
	return token;
}

/**
 * Refuses the spellings Commander would accept but the contract does not: a
 * bare `--`, and `--flag=value` on a flag that takes no value.
 * @param contract - The command contract.
 * @param argv - The arguments after the command path.
 * @throws {CliUsageError} When a token is one of those spellings.
 */
function assertNoValueOnFlags(contract: AnyCommandContract, argv: readonly string[]): void {
	if (argv.includes("--")) {
		throw new CliUsageError("Unknown flag --");
	}
	const valueless = contract.parameters.flatMap((parameter) =>
		parameter.kind === "option" && parameter.value === "none" ? parameter.spellings : [],
	);
	for (const token of argv) {
		const spelling = valueless.find((candidate) => token.startsWith(`${candidate}=`));
		if (spelling) {
			throw new CliUsageError(`Flag ${spelling} does not take a value`);
		}
	}
}

/**
 * Builds the Commander command for one contract: its positionals in order and
 * one option per declared flag, with output and help suppressed so this CLI
 * owns every message.
 * @param contract - The command contract.
 * @returns The command and the options by parameter key.
 */
function buildCommanderCommand(contract: AnyCommandContract): {
	command: Command;
	options: Map<string, Option>;
} {
	const command = new Command();
	command
		.name(contract.path.join(" "))
		.exitOverride()
		.configureOutput({
			/** Swallows Commander's stdout; this CLI writes every message itself. */
			writeOut: () => {},
			/** Swallows Commander's stderr; this CLI writes every message itself. */
			writeErr: () => {},
		})
		.helpOption(false)
		.addHelpCommand(false)
		.allowExcessArguments(true);
	if (contract.parameters.some((parameter) => parameter.route === "staged-tokens")) {
		command.allowUnknownOption(true).passThroughOptions();
	}

	const options = new Map<string, Option>();
	for (const parameter of contract.parameters) {
		if (parameter.kind === "positional") {
			command.argument(parameter.repeatable ? `[${parameter.name}...]` : `[${parameter.name}]`);
			continue;
		}
		const option = new Option(
			optionFlags(parameter.spellings, parameter.value),
			parameter.description,
		);
		if (parameter.occurrences === "append") {
			option.argParser(collect);
		}
		command.addOption(option);
		options.set(parameter.key, option);
	}
	return { command, options };
}

/**
 * Tells whether the person wrote one of an option's spellings, in either the
 * separated or the inline form. Presence is read from argv rather than from
 * Commander's value, so a flag left out is undefined rather than a default.
 * @param parameter - The option to look for.
 * @param argv - The arguments after the command path.
 * @returns True when the option appears.
 */
function optionPresent(
	parameter: Extract<TokenParameter, { kind: "option" }>,
	argv: readonly string[],
): boolean {
	return argv.some((token) =>
		parameter.spellings.some((spelling) => token === spelling || token.startsWith(`${spelling}=`)),
	);
}

/**
 * Reads one declared option's value out of the parsed command.
 * @param parameter - The option to read.
 * @param argv - The arguments after the command path.
 * @param command - The command Commander has parsed.
 * @param options - The Commander options by parameter key.
 * @param restored - The placeholders and the tokens they stand for.
 * @returns The value for this option's record entry.
 * @throws {Error} When the contract declared an option this adapter never added.
 */
function optionValue(
	parameter: Extract<TokenParameter, { kind: "option" }>,
	argv: readonly string[],
	command: Command,
	options: ReadonlyMap<string, Option>,
	restored: ReadonlyMap<string, string>,
): TokenRecord[string] {
	const present = optionPresent(parameter, argv);
	if (parameter.value === "none") {
		return present;
	}
	if (!present) {
		return undefined;
	}
	const option = options.get(parameter.key);
	if (!option) {
		throw new Error(`Missing Commander option for ${parameter.key}`);
	}
	return restoreToken(command.getOptionValue(option.attributeName()), restored);
}

/** Turns declared CLI arguments into the token record a contract's ingress schema parses. */
export class CommanderArgvParser {
	/**
	 * Parses one command's arguments against its declared parameters.
	 * @param contract - The command contract.
	 * @param argv - The arguments after the command path.
	 * @returns One record entry per declared parameter.
	 * @throws {CliUsageError} When the arguments do not fit the declared parameters.
	 */
	async parse(contract: AnyCommandContract, argv: readonly string[]): Promise<TokenRecord> {
		assertNoValueOnFlags(contract, argv);
		const { command, options } = buildCommanderCommand(contract);
		const declared = new Set(
			contract.parameters.flatMap((parameter) =>
				parameter.kind === "option" ? parameter.spellings : [],
			),
		);
		const { values, restored } = shieldSingleDashTokens(argv, declared);
		try {
			await command.parseAsync(["bun", contract.path.join(" "), ...values]);
		} catch (error) {
			throw commanderUsageError(error);
		}

		const record: TokenRecord = {};
		const args = [...command.args];
		for (const parameter of contract.parameters) {
			if (parameter.kind === "option") {
				record[parameter.key] = optionValue(parameter, argv, command, options, restored);
				continue;
			}
			const value = parameter.repeatable ? args.splice(0) : args.shift();
			record[parameter.key] = restoreToken(value, restored);
		}
		return record;
	}
}
