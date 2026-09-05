export interface ExecutableBunInvocation {
	command: "run" | "test";
	args: string[];
	error?: string;
}

const EXECUTABLE_BUN = /\bbun\s+(run|test)\b/g;
const ECHO_ONLY_PREFIX =
	/^(?:(?:if|elif|while|until|then|else|do)\s+)?(?:(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*|command\s+)?(?:echo|printf)\b/;

function startsShellComment(text: string, index: number, first = 0): boolean {
	return text[index] === "#" && (index === first || /[\s;&|(){}`]/.test(text[index - 1] ?? ""));
}

function unquotedShellText(command: string): string {
	let result = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let comment = false;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (comment) {
			if (character === "\n") {
				comment = false;
				result += "\n";
			} else {
				result += " ";
			}
			continue;
		}
		if (escaped) {
			escaped = false;
			result += character;
			continue;
		}
		if (quote) {
			if (character === "\\" && quote === '"') {
				escaped = true;
			} else if (character === quote) {
				quote = undefined;
			}
			result += character === "\n" ? "\n" : " ";
			continue;
		}
		if (character === "\\") {
			escaped = true;
			result += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			result += " ";
			continue;
		}
		if (startsShellComment(command, index)) {
			comment = true;
			result += " ";
			continue;
		}
		result += character;
	}
	return result;
}

function dollarSubstitutionAt(
	text: string,
	start: number,
): { body: string; end: number } | undefined {
	if (text[start] !== "$" || text[start + 1] !== "(") {
		return undefined;
	}
	let depth = 1;
	let quote: "'" | '"' | "`" | undefined;
	let escaped = false;
	let comment = false;
	for (let index = start + 2; index < text.length; index += 1) {
		const character = text[index];
		if (comment) {
			if (character === "\n") {
				comment = false;
			}
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) {
				quote = undefined;
			}
			continue;
		}
		if (startsShellComment(text, index, start + 2)) {
			comment = true;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "(") {
			depth += 1;
		}
		if (character !== ")") {
			continue;
		}
		depth -= 1;
		if (depth === 0) {
			return { body: text.slice(start + 2, index), end: index };
		}
	}
	return { body: text.slice(start + 2), end: text.length - 1 };
}

function backtickSubstitutionAt(
	text: string,
	start: number,
): { body: string; end: number } | undefined {
	if (text[start] !== "`") {
		return undefined;
	}
	let escaped = false;
	for (let index = start + 1; index < text.length; index += 1) {
		const character = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === "`") {
			return { body: text.slice(start + 1, index), end: index };
		}
	}
	return { body: text.slice(start + 1), end: text.length - 1 };
}

function doubleQuotedSubstitutionBodies(command: string): string[] {
	const bodies: string[] = [];
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let comment = false;
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (comment) {
			if (character === "\n") {
				comment = false;
			}
			continue;
		}
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote === "'") {
			if (character === "'") {
				quote = undefined;
			}
			continue;
		}
		if (quote === '"') {
			if (character === '"') {
				quote = undefined;
				continue;
			}
			const substitution =
				dollarSubstitutionAt(command, index) ?? backtickSubstitutionAt(command, index);
			if (substitution) {
				bodies.push(substitution.body);
				index = substitution.end;
			}
			continue;
		}
		if (character === "'") {
			quote = "'";
		} else if (character === '"') {
			quote = '"';
		} else if (startsShellComment(command, index)) {
			comment = true;
		}
	}
	return bodies;
}

function echoOnly(text: string, invocationIndex: number): boolean {
	let boundary = invocationIndex - 1;
	while (boundary >= 0 && !/[\n;&|(){}`]/.test(text[boundary] ?? "")) {
		boundary -= 1;
	}
	return ECHO_ONLY_PREFIX.test(text.slice(boundary + 1, invocationIndex).trim());
}

function commandEnd(text: string, start: number): number {
	let quote: "'" | '"' | undefined;
	let escaped = false;
	for (let index = start; index < text.length; index += 1) {
		const character = text[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (character === quote) {
				quote = undefined;
			}
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (startsShellComment(text, index, start) || /[\n;&|(){}`]/.test(character ?? "")) {
			return index;
		}
	}
	return text.length;
}

function shellWords(text: string): string[] {
	const words: string[] = [];
	let word = "";
	let started = false;
	let quote: "'" | '"' | undefined;
	let escaped = false;
	const finish = () => {
		if (started) {
			words.push(word);
		}
		word = "";
		started = false;
	};
	for (const character of text) {
		if (escaped) {
			word += character;
			started = true;
			escaped = false;
			continue;
		}
		if (character === "\\" && quote !== "'") {
			escaped = true;
			started = true;
			continue;
		}
		if (quote) {
			if (character === quote) {
				quote = undefined;
			} else {
				word += character;
			}
			started = true;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			started = true;
			continue;
		}
		if (/\s/.test(character)) {
			finish();
		} else {
			word += character;
			started = true;
		}
	}
	finish();
	return words;
}

function staticArgument(argument: string): boolean {
	return argument.length > 0 && !/[$`*?[\]{}()]/.test(argument);
}

function staticIgnoreValue(value: string | undefined): value is string {
	return value !== undefined && !value.startsWith("-") && staticArgument(value);
}

function runInvocation(args: string[]): ExecutableBunInvocation {
	let index = 0;
	while (args[index] === "--silent") {
		index += 1;
	}
	const script = args[index];
	if (script?.startsWith("-")) {
		return {
			command: "run",
			args,
			error: `\`bun run\` has unsupported or ambiguous leading option \`${script}\`; only \`--silent\` is supported before the script name`,
		};
	}
	if (!script || !staticArgument(script)) {
		return {
			command: "run",
			args,
			error: "`bun run` requires an explicit static script name after optional `--silent`",
		};
	}
	return { command: "run", args: args.slice(index) };
}

function testInvocation(args: string[]): ExecutableBunInvocation {
	let hasSelector = false;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index] ?? "";
		if (!hasSelector && argument === "--isolate") {
			continue;
		}
		if (!hasSelector && argument.startsWith("--max-concurrency=")) {
			const value = argument.slice("--max-concurrency=".length);
			if (/^[1-9]\d*$/.test(value)) {
				continue;
			}
		}
		if (!hasSelector && argument === "--path-ignore-patterns") {
			const value = args[++index];
			if (staticIgnoreValue(value)) {
				continue;
			}
			return {
				command: "test",
				args,
				error:
					"`bun test --path-ignore-patterns` requires one explicit static value that does not start with `-`",
			};
		}
		if (!hasSelector && argument.startsWith("--path-ignore-patterns=")) {
			const value = argument.slice("--path-ignore-patterns=".length);
			if (staticIgnoreValue(value)) {
				continue;
			}
			return {
				command: "test",
				args,
				error:
					"`bun test --path-ignore-patterns` requires one explicit static value that does not start with `-`",
			};
		}
		if (argument.startsWith("-")) {
			return {
				command: "test",
				args,
				error: `\`bun test\` has unsupported or ambiguous option \`${argument}\`; supported leading flags are \`--isolate\`, \`--max-concurrency=<positive integer>\`, and \`--path-ignore-patterns <static path>\``,
			};
		}
		if (!staticArgument(argument)) {
			return {
				command: "test",
				args,
				error: `\`bun test\` selector \`${argument}\` is not statically resolvable`,
			};
		}
		hasSelector = true;
	}
	if (!hasSelector) {
		return {
			command: "test",
			args,
			error:
				"`bun test` requires at least one explicit static selector; broad test discovery is not inventory-safe",
		};
	}
	return { command: "test", args };
}

export function executableBunInvocations(command: string): ExecutableBunInvocation[] {
	const sources = [command];
	const pending = doubleQuotedSubstitutionBodies(command);
	for (const body of pending) {
		sources.push(body);
		pending.push(...doubleQuotedSubstitutionBodies(body));
	}
	return sources.flatMap((source) => {
		const searchable = unquotedShellText(source);
		return [...searchable.matchAll(EXECUTABLE_BUN)]
			.filter((match) => !echoOnly(searchable, match.index))
			.map((match): ExecutableBunInvocation | undefined => {
				const kind = match[1];
				if (kind !== "run" && kind !== "test") {
					return undefined;
				}
				const start = (match.index ?? 0) + match[0].length;
				const args = shellWords(source.slice(start, commandEnd(source, start)));
				return kind === "run" ? runInvocation(args) : testInvocation(args);
			})
			.filter((invocation): invocation is ExecutableBunInvocation => invocation !== undefined);
	});
}
