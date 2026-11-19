// The shallow-module gate of `archboard check` (TASK-646.04, ADR 0082): what the
// code check is asked for it, and how its answer fails the command.
//
// The answer's severities never depend on the caller, because the server
// remembers every finished pass for the panes. So the CLI owns the gate:
// `--fail-shallow-modules`, or a model policy that sets
// `codeCheck.failShallowModules`, makes an information `MODULE_SHALLOW` or
// `INTERFACE_WIDE` on a module that the branch touched a warning, and the
// existing exit rule fails on it. Both are warnings unless a vault rule lowers
// them, so the gate is debt mode: old modules stay information, and touched
// ones fail (TASK-651). A gated module whose range the check could not read is
// a refusal, never a pass. A vault rule that turns either code off beside the
// flag is a refusal that names both (TASK-650).

import type { CodeCheckResult } from "#cli/commands/vault/protocol/code-check-result.ts";

/** One finding of the code check. */
type CodeFinding = CodeCheckResult["findings"][number];

/** The touched modules of one reading. */
type Touched = NonNullable<CodeCheckResult["touched"]>[number];

/** What the gate reads of the command's options. */
interface GateOptions {
	readonly failShallowModules?: boolean | undefined;
	readonly base?: string | undefined;
}

/** The options of the gate, which `check`, `check all` and `check code` read. */
const gateParameters = [
	{
		kind: "option",
		key: "failShallowModules",
		spellings: ["--fail-shallow-modules"],
		value: "none",
		description:
			"Fail on MODULE_SHALLOW and INTERFACE_WIDE that a vault rule set to information, in a module that the branch touched since its base, uncommitted changes included",
	},
	{
		kind: "option",
		key: "base",
		spellings: ["--base"],
		value: "required",
		placeholder: "ref",
		description:
			"The branch, tag or commit that the branch is read from for the touched modules. Without it, the default base: where origin/HEAD points, else main",
	},
] as const;

/**
 * Ask the code check for what the gate reads: the base, and the touched modules under the flag.
 * @param asked The query of the request, which this adds to.
 * @param options The command's options.
 */
function askGate(asked: URLSearchParams, options: GateOptions): void {
	if (options.base !== undefined) asked.append("base", options.base);
	if (options.failShallowModules === true) asked.append("touched", "true");
}

/**
 * Whether two entries of the answer name one reading.
 * @param entry A model or a touched entry.
 * @param entry.model Its model.
 * @param entry.state Its state.
 * @param finding The finding.
 * @returns True when they do.
 */
function sameReading(
	entry: { readonly model: string; readonly state: string | null },
	finding: CodeFinding,
): boolean {
	return entry.model === finding.model && entry.state === (finding.state ?? null);
}

/** The codes the gate fails on, where a vault rule set them to information. */
const GATED_CODES: ReadonlySet<string> = new Set(["MODULE_SHALLOW", "INTERFACE_WIDE"]);

/**
 * Whether the gate judges a finding: an information shallow module or wide interface of a model
 * that the flag or its policy gates.
 * @param code The code check's answer.
 * @param finding The finding.
 * @param flag Whether `--fail-shallow-modules` was given.
 * @returns True when it does.
 */
function gated(code: CodeCheckResult, finding: CodeFinding, flag: boolean): boolean {
	if (!GATED_CODES.has(finding.code) || finding.severity !== "information") return false;
	return (
		flag ||
		code.models?.some((each) => sameReading(each, finding) && each.failShallowModules === true) ===
			true
	);
}

/**
 * Whether the check read the branch for a finding's module: the reading's touched modules are
 * known, and its module is not among those whose range was unread.
 * @param touched The reading's touched modules, if the check read them.
 * @param id The module's id.
 * @returns True when it did.
 */
function readFor(touched: Touched | undefined, id: string): touched is Touched {
	return touched !== undefined && !touched.unread.includes(id);
}

/**
 * A finding the gate judges: a warning on a module the branch touched, as it was on another.
 * @param code The code check's answer.
 * @param finding The finding.
 * @returns The finding, or undefined when the check could not read the branch for its module.
 */
function gatedFinding(code: CodeCheckResult, finding: CodeFinding): CodeFinding | undefined {
	const id = finding.subject?.id ?? "";
	const touched = code.touched?.find((each) => sameReading(each, finding));
	if (!readFor(touched, id)) return undefined;
	return touched.modules.includes(id) ? { ...finding, severity: "warning" } : finding;
}

/**
 * Refuse the flag where a vault rule turns off a code that the flag fails on.
 * @param code The code check's answer.
 */
function refuseRuledGate(code: CodeCheckResult): void {
	for (const model of code.models ?? []) {
		const off = Object.entries(model.rules ?? {}).find(
			([rule, level]) => GATED_CODES.has(rule) && level === "off",
		);
		if (off === undefined) continue;
		throw Object.assign(
			new Error(
				`--fail-shallow-modules fails the check on ${off[0]} in a touched module, and the vault policy of ${JSON.stringify(model.model)} sets codeCheck.rules.${off[0]} to off. Leave out the flag, or set the rule to information.`,
			),
			{ code: "SHALLOW_RULE_CONFLICT" },
		);
	}
}

/**
 * Apply the shallow-module gate: an information `MODULE_SHALLOW` or `INTERFACE_WIDE` on a module
 * that the branch touched becomes a warning, so the existing exit rule fails on it.
 * @param code The code check's answer.
 * @param flag Whether `--fail-shallow-modules` was given.
 * @returns The answer with the gate applied.
 */
function gateShallowModules(code: CodeCheckResult, flag: boolean): CodeCheckResult {
	if (flag) refuseRuledGate(code);
	const unread: string[] = [];
	const findings = code.findings.map((finding) => {
		const gate = gated(code, finding, flag) ? gatedFinding(code, finding) : finding;
		if (gate === undefined) unread.push(finding.subject?.name ?? "");
		return gate ?? finding;
	});
	if (unread.length === 0) return { ...code, findings };
	const named = unread.map((name) => JSON.stringify(name)).join(", ");
	throw Object.assign(
		new Error(
			`The check could not read whether the branch touched the gated modules ${named}: no base was found, the base does not resolve in their checkout, or it shares no history with HEAD there, as in a shallow clone. Name a base that resolves there with --base, or fetch the history the base needs.`,
		),
		{ code: "BASE_UNRESOLVED" },
	);
}

export { askGate, gateParameters, gateShallowModules };
