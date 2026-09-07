// Board commands accept their options as staged tokens that are only parsed
// after server contact, so a usage mistake never masks a missing server.
import { z } from "zod";

type Stage = { positionals: string[]; flags: Record<string, string | boolean> };
type FlagSpecs = Readonly<Record<string, "flag" | "value">>;

/**
 * Splits one `--name[=value]` token into its flag name and the inline value
 * that followed an equals sign, if any.
 * @param token - A token that starts with two dashes.
 * @returns The flag name and its inline value when one was attached.
 */
function splitFlagToken(token: string): { name: string; inline: string | undefined } {
	const body = token.slice(2);
	const equals = body.indexOf("=");
	if (equals === -1) {
		return { name: body, inline: undefined };
	}
	return { name: body.slice(0, equals), inline: body.slice(equals + 1) };
}

/**
 * Records a usage issue on the zod context and signals the caller to stop.
 * @param context - The refinement context the issue is reported to.
 * @param message - The usage message shown to the caller.
 * @returns Always undefined, the sentinel `readFlag` uses for a refused token.
 */
function refuseFlag(context: z.RefinementCtx, message: string): undefined {
	context.addIssue({ code: "custom", message });
	return undefined;
}

/**
 * Stores a value-taking flag, reading the value inline or from the next token.
 * @param name - The flag name without dashes.
 * @param inline - The value attached with an equals sign, if any.
 * @param next - The token after the flag, consumed when no inline value exists.
 * @param flags - The flag record being filled.
 * @param context - The refinement context that receives usage issues.
 * @returns How many following tokens were consumed, or undefined when refused.
 */
function readValueFlag(
	name: string,
	inline: string | undefined,
	next: string | undefined,
	flags: Record<string, string | boolean>,
	context: z.RefinementCtx,
): number | undefined {
	const value = inline ?? next;
	if (value === undefined) {
		return refuseFlag(context, `Flag --${name} requires a value`);
	}
	flags[name] = value;
	return inline === undefined ? 1 : 0;
}

/**
 * Interprets one flag token against the command's flag specification.
 * @param name - The flag name without dashes.
 * @param inline - The value attached with an equals sign, if any.
 * @param next - The token after the flag, available to value-taking flags.
 * @param specs - Which flags exist and whether each takes a value.
 * @param flags - The flag record being filled.
 * @param context - The refinement context that receives usage issues.
 * @returns How many following tokens were consumed, or undefined when refused.
 */
function readFlag(
	name: string,
	inline: string | undefined,
	next: string | undefined,
	specs: FlagSpecs,
	flags: Record<string, string | boolean>,
	context: z.RefinementCtx,
): number | undefined {
	const spec = specs[name];
	if (!spec) {
		return refuseFlag(context, `Unknown flag --${name}`);
	}
	if (spec === "value") {
		return readValueFlag(name, inline, next, flags, context);
	}
	if (inline !== undefined) {
		return refuseFlag(context, `Flag --${name} does not take a value`);
	}
	flags[name] = true;
	return 0;
}

/**
 * Parses staged tokens into positionals and flags according to a flag
 * specification, reporting the first usage mistake as a zod issue.
 * @param values - The raw tokens routed to the stage.
 * @param specs - Which flags exist and whether each takes a value.
 * @param context - The refinement context that receives usage issues.
 * @returns The parsed stage, or `z.NEVER` after an issue was reported.
 */
function parseStage(
	values: string[],
	specs: FlagSpecs,
	context: z.RefinementCtx,
): Stage | typeof z.NEVER {
	const positionals: string[] = [];
	const flags: Record<string, string | boolean> = {};
	for (let index = 0; index < values.length; index += 1) {
		const token = values[index]!;
		if (!token.startsWith("--")) {
			positionals.push(token);
			continue;
		}
		const { name, inline } = splitFlagToken(token);
		const consumed = readFlag(name, inline, values[index + 1], specs, flags, context);
		if (consumed === undefined) {
			return z.NEVER;
		}
		index += consumed;
	}
	return { positionals, flags };
}

export { parseStage, type Stage };
