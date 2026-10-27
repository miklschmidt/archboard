import { CliUsageError, type CommandContext } from "#cli/protocol/contract/contract.ts";
/**
 * Read one explicit JSON input from a file or standard input.
 * @param input The optional input file.
 * @param input.input The input file path.
 * @param context The invocation capabilities.
 * @returns The untrusted input for its authoritative schema.
 */
async function statedJson(
	input: { readonly input?: string | undefined },
	context: CommandContext,
): Promise<unknown> {
	const text =
		input.input === undefined
			? (await context.readStdin()).trim()
			: context.readTextFile(context.resolvePath(input.input));
	if (text === "") {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new CliUsageError(
			`The stated change is not JSON: ${error instanceof Error ? error.message : "unreadable"}`,
		);
	}
}
export { statedJson };
