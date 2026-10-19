// The env file adapter (ADR 0046, TASK-367.20): the names an env file sets,
// never their values. A `.env` or `<name>.env` file is read on its own as one
// `environment` reference per name, at its line, and a compose service's
// `env_file` reads it through the compose resolver for the same names. An env
// file is not compose's alone: dotenv libraries and Kustomize read it too, so
// it is an adapter of its own. It imports nothing.

import type {
	ImportResolver,
	ParsedFacts,
	Reference,
} from "#runtime/operations/code-facts/facts.ts";

/** One name an env file sets, with no value. */
const ASSIGNMENT = /^\s*(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_.-]*)\s*(?:=(?<value>.*))?$/u;

/**
 * The quote a value opens and does not close on its line, which the next
 * lines continue until it closes.
 * @param value The value after `=`.
 * @returns The quote, or undefined.
 */
function openQuote(value: string): string | undefined {
	const trimmed = value.trimStart();
	const quote = trimmed[0];
	if (quote !== '"' && quote !== "'") return undefined;
	return trimmed.indexOf(quote, 1) === -1 ? quote : undefined;
}

/**
 * The name one line of an env file sets, and the value it gives it.
 * @param raw The line.
 * @returns The name and the value, or undefined for a comment or a line that sets nothing.
 */
function assignmentOf(raw: string): { readonly name: string; readonly value: string } | undefined {
	const groups = ASSIGNMENT.exec(raw)?.groups;
	if (groups?.["name"] === undefined) return undefined;
	return { name: groups["name"], value: groups["value"] ?? "" };
}

/**
 * The names an env file sets, each at its line: `NAME=value`, `export NAME=value`
 * or a bare `NAME`. A value is never kept, nor are the lines of a quoted value
 * that runs over several lines.
 * @param text The env file's text.
 * @returns Each name and its line.
 */
function envNames(text: string): { readonly name: string; readonly line: number }[] {
	const names: { name: string; line: number }[] = [];
	let open: string | undefined;
	text.split(/\r?\n/u).forEach((raw, index) => {
		if (open !== undefined) {
			open = raw.includes(open) ? undefined : open;
			return;
		}
		const found = assignmentOf(raw);
		if (found === undefined) return;
		names.push({ name: found.name, line: index + 1 });
		open = openQuote(found.value);
	});
	return names;
}

/**
 * The facts of an env file: one `environment` reference per name it sets.
 * @param text The env file's text.
 * @returns Its facts.
 */
function envFileFacts(text: string): ParsedFacts {
	const references: Reference[] = envNames(text).map(({ name, line }) => ({
		symbol: name,
		line,
		via: "environment",
		typeOnly: false,
	}));
	return { definitions: [], references, imports: [], unparsed: [] };
}

/**
 * The resolver of env files, which import nothing.
 * @returns The resolver.
 */
function createEnvFileResolver(): ImportResolver {
	return {
		/**
		 * An env file's import, of which there is none.
		 * @param _from The file.
		 * @param found The import.
		 * @returns It as it is.
		 */
		resolve(_from, found) {
			return found;
		},
	};
}

export { createEnvFileResolver, envFileFacts, envNames };
