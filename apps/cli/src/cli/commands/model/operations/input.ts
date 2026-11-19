import {
	parseModelRequest,
	type ModelRequest,
	type RequestOperation,
} from "@archboard/model-contract";
import {
	CliUsageError,
	type CommandContext,
	type Reading,
} from "#cli/contract/protocol/contract.ts";

/**
 * How a stated JSON is read as the request of one model operation.
 * @param operation The operation the request is for.
 * @returns The reading for `context.parse`, which refuses a bad body with the problem it names.
 */
function requestOf<O extends RequestOperation>(operation: O): Reading<ModelRequest<O>> {
	return {
		/**
		 * Read one stated value.
		 * @param value The value.
		 * @returns The intent, or why it is not one.
		 */
		safeParse(value) {
			const parsed = parseModelRequest(operation, value);
			return parsed.success
				? { success: true, data: parsed.data }
				: { success: false, error: parsed.error };
		},
	};
}

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
export { requestOf, statedJson };
