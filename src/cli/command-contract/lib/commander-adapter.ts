import { Command, Option } from "commander";
import type { AnyCommandContract, TokenRecord } from "../contract.js";
import { CliUsageError } from "../contract.js";

function collect(value: string, previous: string[] = []): string[] {
	return [...previous, value];
}

function optionFlags(spellings: readonly string[], value: "none" | "required" | "optional") {
	const suffix = value === "required" ? " <value>" : value === "optional" ? " [value]" : "";
	return spellings.join(", ") + suffix;
}

function commanderUsageError(error: unknown): CliUsageError {
	const value = error as Error & { code?: string };
	const message = value.message.replace(/^error:\s*/i, "");
	const unknown = message.match(/^unknown option '([^']+)'/i);
	if (unknown) return new CliUsageError(`Unknown flag ${unknown[1]?.split("=", 1)[0]}`);
	const missing = message.match(/^option '([^']+)' argument missing/i);
	if (missing) {
		const spelling = missing[1]?.match(/--[a-z0-9-]+/i)?.[0] ?? missing[1];
		return new CliUsageError(`Flag ${spelling} requires a value`);
	}
	return new CliUsageError(message[0]?.toUpperCase() + message.slice(1));
}

function shieldSingleDashTokens(argv: readonly string[], declared: ReadonlySet<string>) {
	const restored = new Map<string, string>();
	const values = argv.map((token, index) => {
		if (token === "-" || token.startsWith("--") || !token.startsWith("-") || declared.has(token))
			return token;
		const placeholder = `archboard-single-dash-${index}`;
		restored.set(placeholder, token);
		return placeholder;
	});
	return { values, restored };
}

function restoreToken(value: unknown, restored: ReadonlyMap<string, string>): unknown {
	if (typeof value === "string") return restored.get(value) ?? value;
	if (Array.isArray(value)) return value.map((item) => restoreToken(item, restored));
	return value;
}

export class CommanderArgvParser {
	async parse(contract: AnyCommandContract, argv: readonly string[]): Promise<TokenRecord> {
		if (argv.includes("--")) throw new CliUsageError("Unknown flag --");
		for (const token of argv) {
			const spelling = contract.parameters
				.flatMap((parameter) =>
					parameter.kind === "option" && parameter.value === "none" ? parameter.spellings : [],
				)
				.find((candidate) => token.startsWith(`${candidate}=`));
			if (spelling) throw new CliUsageError(`Flag ${spelling} does not take a value`);
		}
		const command = new Command();
		command
			.name(contract.path.join(" "))
			.exitOverride()
			.configureOutput({ writeOut: () => {}, writeErr: () => {} })
			.helpOption(false)
			.addHelpCommand(false)
			.allowExcessArguments(true);

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
			if (parameter.occurrences === "append") option.argParser(collect);
			command.addOption(option);
			options.set(parameter.key, option);
		}

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
				const option = options.get(parameter.key);
				if (!option) throw new Error(`Missing Commander option for ${parameter.key}`);
				const value = command.getOptionValue(option.attributeName());
				record[parameter.key] = restoreToken(value, restored) as TokenRecord[string];
				continue;
			}
			const value = parameter.repeatable ? args.splice(0) : args.shift();
			record[parameter.key] = restoreToken(value, restored) as TokenRecord[string];
		}
		return record;
	}
}
