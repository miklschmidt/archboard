import { z } from "zod";

/**
 * The refusal of a rule on `INTERFACE_WIDE`, the flat cap that TASK-659
 * retired, so a vault that still sets it is told so by name. The record
 * reports an unknown key as `unrecognized_keys`, whose `keys` name them.
 * @param issue The record's issue.
 * @returns The message, or undefined to keep zod's own.
 */
function retiredRule(issue: object): string | undefined {
	const keys = "keys" in issue ? issue.keys : undefined;
	return Array.isArray(keys) && keys.includes("INTERFACE_WIDE")
		? "INTERFACE_WIDE is retired: MODULE_SHALLOW judges the logic behind each name at any width (ADR 0082). Remove this entry"
		: undefined;
}
/**
 * The module-depth findings of the code check (ADR 0082) whose level a vault
 * sets, and the levels it may set. A rule only lowers: an incomplete read
 * lowers a finding to information, and no rule may make it a warning again.
 */
const DepthRuleSchema = z.partialRecord(
	z.enum([
		"EXPOSED_VALUE",
		"EXPOSED_VALUE_COMPUTED",
		"CODE_PASS_THROUGH",
		"REEXPORT_PASS_THROUGH",
		"EXPOSED_UNUSED",
		"INTERFACE_UNDECLARED",
		"MODULE_SHALLOW",
	]),
	z.enum(["information", "off"]),
	{ error: retiredRule },
);
/**
 * The vault's code-check policy (TASK-646.04, TASK-650, TASK-651, TASK-659).
 * `failShallowModules` is the only promotion: it fails the check on an
 * information `MODULE_SHALLOW` of a touched module, so a rule that turns it
 * off beside it contradicts it, and the refusal names the rule. A rule on
 * `INTERFACE_WIDE`, the flat cap that TASK-659 retired, is refused by name.
 */
const CodeCheckPolicySchema = z
	.object({
		failShallowModules: z.boolean().optional().meta({
			description:
				"Plain `archboard check` fails on MODULE_SHALLOW in a module that the branch touched, working tree included, where a rule set it to information, as `--fail-shallow-modules` does (TASK-646.04, TASK-651). It is a warning on every module without a rule.",
		}),
		rules: DepthRuleSchema.optional().meta({
			description:
				"The level of each module-depth finding, by code: `information` keeps it and never fails the check, `off` removes it from the answer. A code without a rule keeps its built-in level, so MODULE_SHALLOW is a warning on every module. Keys: EXPOSED_VALUE, EXPOSED_VALUE_COMPUTED, CODE_PASS_THROUGH, REEXPORT_PASS_THROUGH, EXPOSED_UNUSED, INTERFACE_UNDECLARED and MODULE_SHALLOW. With `failShallowModules: true`, an information MODULE_SHALLOW fails the check on a module that the branch touched (debt mode), and `off` on it is invalid.",
		}),
	})
	.strict()
	.superRefine((policy, context) => {
		if (policy.failShallowModules !== true || policy.rules?.MODULE_SHALLOW !== "off") return;
		context.addIssue({
			code: "custom",
			path: ["rules", "MODULE_SHALLOW"],
			message:
				"failShallowModules fails the check on MODULE_SHALLOW in a touched module, and this rule turns it off: set it to information, or remove one of them",
		});
	});

export { CodeCheckPolicySchema };
