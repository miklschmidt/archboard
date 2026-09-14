import type { Command, Option } from "commander";
import { z } from "zod";
import type {
	AnyCommandContract,
	TokenParameter,
	TokenRecord,
} from "@/cli/command-contract/contract";
import { CliUsageError } from "@/cli/command-contract/contract";
import { declareCommand } from "@/cli/command-contract/commander";

/** The value shapes a parsed token may take, mirroring one TokenRecord entry. */
const tokenValueSchema = z.union([z.string(), z.boolean(), z.array(z.string()), z.undefined()]);

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
 * Rewrites Commander's missing-positional complaint in this CLI's words.
 * @param message - Commander's message, without its "error:" prefix.
 * @returns The refusal, or undefined when the message is about something else.
 */
function missingArgumentRefusal(message: string): CliUsageError | undefined {
	const missing = message.match(/^missing required argument '([^']+)'/iu);
	return missing ? new CliUsageError(`Missing required argument <${missing[1]}>`) : undefined;
}

/**
 * Rewrites Commander's rejected-choice complaint in this CLI's words, naming
 * the flag as the person spelled it and the values it accepts.
 * @param message - Commander's message, without its "error:" prefix.
 * @returns The refusal, or undefined when the message is about something else.
 */
function choiceRefusal(message: string): CliUsageError | undefined {
	const rejected = message.match(
		/^option '([^']+)' argument '([^']*)' is invalid\. Allowed choices are (.+)\.$/iu,
	);
	if (!rejected) {
		return undefined;
	}
	const spelling = rejected[1]?.match(/--[a-z0-9-]+/iu)?.[0] ?? rejected[1];
	return new CliUsageError(`${spelling} must be one of ${rejected[3]}; got "${rejected[2]}"`);
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
	for (const rewrite of REWRITES) {
		const refusal = rewrite(message);
		if (refusal !== undefined) {
			return refusal;
		}
	}
	return new CliUsageError(message[0]?.toUpperCase() + message.slice(1));
}

/** Every Commander complaint this CLI rewrites, tried in order. */
const REWRITES = [
	unknownFlagRefusal,
	missingValueRefusal,
	missingArgumentRefusal,
	choiceRefusal,
] as const;

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
	const valueless = parsedParameters(contract).flatMap((parameter) =>
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
 * Refuses an option the contract says must be present and the person left
 * out. Presence, not value: an option that is present without its value is
 * refused by Commander as a missing argument, which is a different mistake.
 * @param contract - The command contract.
 * @param argv - The arguments after the command path.
 * @throws {CliUsageError} Naming the first required option that is absent.
 */
function assertRequiredOptions(contract: AnyCommandContract, argv: readonly string[]): void {
	for (const parameter of contract.parameters) {
		if (
			parameter.kind === "option" &&
			parameter.required === true &&
			parameter.route !== "staged" &&
			!optionPresent(parameter, argv)
		) {
			throw new CliUsageError(`${parameter.spellings[0]} is required`);
		}
	}
}

/**
 * The parameters the ordinary parser reads: every declared one but the staged
 * parameters, which their stage reads after the command's prerequisites.
 * @param contract - The command contract.
 * @returns The parameters, in declaration order.
 */
function parsedParameters(contract: AnyCommandContract): TokenParameter[] {
	return contract.parameters.filter((parameter) => parameter.route !== "staged");
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
		const { command, options } = declareCommand(contract, "parse");
		const declared = new Set(
			parsedParameters(contract).flatMap((parameter) =>
				parameter.kind === "option" ? parameter.spellings : [],
			),
		);
		const { values, restored } = shieldSingleDashTokens(argv, declared);
		try {
			await command.parseAsync(["bun", contract.path.join(" "), ...values]);
		} catch (error) {
			throw commanderUsageError(error);
		}
		assertRequiredOptions(contract, argv);

		const record: TokenRecord = {};
		const args = [...command.args];
		for (const parameter of parsedParameters(contract)) {
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
