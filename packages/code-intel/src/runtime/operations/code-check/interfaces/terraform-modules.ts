// The shape of a Terraform or OpenTofu module (ADR 0044, ADR 0046,
// TASK-368.11): what it wraps, and which of its variables it only passes on.
//
// A module exposes its variables and outputs (module-exposure.ts). A variable
// is a pass-through variable (Ousterhout) when the module uses it once, as the
// whole value of one argument of a resource it manages: `bucket = var.bucket`,
// with no expression around it. A meta-argument, such as `count`, is no
// argument of the resource. A use inside the variable's own block, such as a
// validation, is no use. A module wraps one resource when it manages exactly
// one and calls no module. A module that wraps one resource is shallow when
// it passes at least one variable through, the resource reads no other
// address, and every other variable only sets the resource's `count`, as
// `count = var.create ? 1 : 0` does: a caller can say that on the call
// itself. Its interface is then the resource's, and the code proves it. An
// argument that a local or a data source sets is one the module decides for
// its callers. A `for_each` is no such toggle: `each.value` carries the
// variable's data into arguments where no reference shows it. A literal
// argument shows no reference either, so a module that fixes an argument to a
// constant still reads as shallow.
//
// Both findings are information on the container bound to the module, beside
// `EXPOSED_UNUSED`:
//
// - `MODULE_SHALLOW`: the module is shallow. It names each variable it passes
//   through, so it is the only finding about them.
// - `VARIABLE_PASSED_THROUGH`: a module that is not shallow passes these
//   variables through.
//
// Each piece of evidence is the variable's one use: the argument it sets.

import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import type { RepoCheckout } from "#runtime/operations/code-check/part-code.ts";
import { siteOf } from "#runtime/operations/code-check/evidence/relationships.ts";
import { isMetaArgument } from "#runtime/operations/code-facts/terraform/terraform-providers.ts";
import {
	type Definition,
	type Reference,
	type SyntaxFacts,
} from "#runtime/operations/code-facts/facts.ts";
import { type FactsPass } from "#runtime/services/code-facts/reader.ts";
import { type ModuleExposure } from "#runtime/operations/code-facts/modules/module-exposure.ts";
import { nodeSubject } from "@archboard/board/vault-policy";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import type { SemanticNode } from "@archboard/board/content";
import { describeSubject } from "@archboard/board/policy";

/** One variable a module passes on unchanged, at its one use. */
interface PassedVariable {
	/** The variable, `var.bucket`. */
	readonly name: string;
	/** The resource whose argument it sets, `aws_s3_bucket.this`. */
	readonly resource: string;
	/** The argument's path, `bucket` or `versioning.enabled`. */
	readonly argument: string;
	readonly evidence: CodeEvidence;
}

/** The variables a Terraform module passes through, and whether it is shallow. */
interface ModuleShape {
	readonly directory: string;
	/** How many variables it declares. */
	readonly variables: number;
	readonly passed: readonly PassedVariable[];
	/** Where it is shallow: the one resource it wraps, and the variables that only set its `count`. */
	readonly shallow?: { readonly wraps: string; readonly counts: readonly string[] };
}

/** One use of a variable in the module's own configuration. */
interface VariableUse {
	readonly file: SyntaxFacts;
	readonly reference: SyntaxFacts["references"][number];
}

/**
 * Whether a definition spans a line.
 * @param definition The definition.
 * @param line The line.
 * @returns True when it does.
 */
function spans(definition: Definition, line: number): boolean {
	return definition.start <= line && line <= definition.end;
}

/**
 * Whether a reference is a use of a variable: it names one, outside every
 * variable's own block.
 * @param file The file that holds it.
 * @param reference The reference.
 * @returns True when it is.
 */
function isVariableUse(file: SyntaxFacts, reference: Reference): boolean {
	const own = file.definitions.some(
		(each) => each.visibility === "variable" && spans(each, reference.line),
	);
	return reference.via === "code" && reference.symbol.startsWith("var.") && !own;
}

/**
 * Each use of a variable in the module's files, by variable.
 * @param files The module's files.
 * @returns The uses.
 */
function variableUses(files: readonly SyntaxFacts[]): Map<string, VariableUse[]> {
	const uses = new Map<string, VariableUse[]>();
	for (const file of files) {
		for (const reference of file.references.filter((each) => isVariableUse(file, each))) {
			uses.set(reference.symbol, [...(uses.get(reference.symbol) ?? []), { file, reference }]);
		}
	}
	return uses;
}

/**
 * The one use of a variable as evidence.
 * @param repo The module's repository.
 * @param use The use.
 * @returns The evidence.
 */
function evidenceOf(repo: string, use: VariableUse): CodeEvidence {
	const { file, reference } = use;
	const { line, symbol, kind = "configured-path" } = reference;
	return { kind, resolution: "resolved", repo, path: file.path, line, symbol };
}

/**
 * The variable one use passes on, when it is the variable's only use and the
 * whole value of an argument of a resource the module manages.
 * @param repo The module's repository.
 * @param name The variable.
 * @param uses Its uses.
 * @returns The variable passed through, or undefined.
 */
function passedThrough(
	repo: string,
	name: string,
	uses: readonly VariableUse[],
): PassedVariable | undefined {
	const [use, ...more] = uses;
	if (use === undefined || more.length > 0) return undefined;
	const argument = passedTo(use.reference);
	const resource = resourceAt(use.file, use.reference.line);
	if (argument === undefined || resource === undefined) return undefined;
	return { name, resource: resource.symbol, argument, evidence: evidenceOf(repo, use) };
}

/**
 * The argument a reference is the whole value of, when that is an argument
 * of the resource and no meta-argument.
 * @param reference The reference.
 * @returns The argument's path, or undefined.
 */
function passedTo(reference: Reference): string | undefined {
	const { argument, whole } = reference;
	const passes = whole === true && argument !== undefined && !isMetaArgument(argument.split("."));
	return passes ? argument : undefined;
}

/**
 * The resource a module manages whose block holds a line.
 * @param file The file.
 * @param line The line.
 * @returns The resource, or undefined.
 */
function resourceAt(file: SyntaxFacts, line: number): Definition | undefined {
	return file.definitions.find((each) => each.visibility === "resource" && spans(each, line));
}

/**
 * Whether a variable only says whether or how often to create the resource a
 * module wraps: every use is in its `count`.
 * @param wraps The resource the module wraps.
 * @param uses The variable's uses.
 * @returns True when it does.
 */
function onlyCounts(wraps: string, uses: readonly VariableUse[]): boolean {
	return (
		uses.length > 0 &&
		uses.every(
			({ file, reference }) =>
				reference.argument === "count" && resourceAt(file, reference.line)?.symbol === wraps,
		)
	);
}

/**
 * Whether the resource a module wraps reads no address but the variables the
 * module passes through, outside its meta-arguments.
 * @param files The module's files.
 * @param wraps The resource.
 * @param passed The variables passed through.
 * @returns True when it reads nothing else.
 */
function readsOnly(
	files: readonly SyntaxFacts[],
	wraps: string,
	passed: readonly PassedVariable[],
): boolean {
	const names = new Set(passed.map((each) => each.name));
	const reads = files.flatMap((file) =>
		file.references.filter((reference) => resourceAt(file, reference.line)?.symbol === wraps),
	);
	return reads.every(
		({ via, symbol, argument = "" }) =>
			via !== "code" || names.has(symbol) || isMetaArgument(argument.split(".")),
	);
}

/**
 * Where a module is shallow: it wraps one resource that reads only the
 * variables it passes through, at least one, and every other variable only
 * sets that resource's `count`.
 * @param files The module's files.
 * @param variables The variables it declares.
 * @param uses Each variable's uses.
 * @param passed The variables it passes through.
 * @returns The resource and the variables that only count it, or undefined.
 */
function shallowShape(
	files: readonly SyntaxFacts[],
	variables: readonly string[],
	uses: ReadonlyMap<string, readonly VariableUse[]>,
	passed: readonly PassedVariable[],
): ModuleShape["shallow"] {
	const wraps = wrapped(files);
	if (wraps === undefined || passed.length === 0) return undefined;
	const counts = variables.filter((name) => onlyCounts(wraps, uses.get(name) ?? []));
	const every = passed.length + counts.length === variables.length;
	return every && readsOnly(files, wraps, passed) ? { wraps, counts } : undefined;
}

/**
 * The declarations of one kind in a module's files.
 * @param files The files.
 * @param visibility The kind: `resource`, `module` or `variable`.
 * @returns The declarations.
 */
function declaredIn(files: readonly SyntaxFacts[], visibility: string): Definition[] {
	return files.flatMap((file) => file.definitions.filter((each) => each.visibility === visibility));
}

/**
 * The one resource a module manages, when it manages exactly one and calls no module.
 * @param files The module's files.
 * @returns The resource's address, or undefined.
 */
function wrapped(files: readonly SyntaxFacts[]): string | undefined {
	const resources = declaredIn(files, "resource");
	const one = resources.length === 1 && declaredIn(files, "module").length === 0;
	return one ? resources[0]?.symbol : undefined;
}

/**
 * The facts of a module's files an adapter read.
 * @param facts The pass.
 * @param checkout The module's checkout.
 * @param rootFiles The module's files.
 * @returns The facts.
 */
async function filesOf(
	facts: FactsPass,
	checkout: RepoCheckout,
	rootFiles: readonly string[],
): Promise<SyntaxFacts[]> {
	const files: SyntaxFacts[] = [];
	for (const path of rootFiles) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, so the pass yields between parses
		const read = await facts.read(checkout, path);
		if (read !== undefined && read.adapter !== "text") files.push(read);
	}
	return files;
}

/**
 * The shape of a Terraform module, read from the facts of its files.
 * @param facts The pass.
 * @param checkout The module's checkout.
 * @param exposure What the module exposes.
 * @returns Its shape.
 */
async function terraformShape(
	facts: FactsPass,
	checkout: RepoCheckout,
	exposure: ModuleExposure,
): Promise<ModuleShape> {
	const files = await filesOf(facts, checkout, exposure.rootFiles);
	const variables = [...new Set(declaredIn(files, "variable").map((each) => each.symbol))];
	const uses = variableUses(files);
	const { repo } = checkout;
	const passed = variables.flatMap((name) => passedThrough(repo, name, uses.get(name) ?? []) ?? []);
	const shallow = shallowShape(files, variables, uses, passed);
	const { directory } = exposure;
	const counted = { variables: variables.length, passed };
	return { directory, ...counted, ...(shallow === undefined ? {} : { shallow }) };
}

/**
 * Each variable passed through, as a finding lists it.
 * @param passed The variables.
 * @param resource Whether to name the resource each sets.
 * @returns The list.
 */
function listed(passed: readonly PassedVariable[], resource: boolean): string {
	return passed
		.map((each) => `${each.name} (${resource ? `${each.resource}.` : ""}${each.argument})`)
		.join(", ");
}

/**
 * What the finding on a shallow module says.
 * @param binds Its start: the container, and the module it binds.
 * @param shape The module's shape.
 * @param shallow Where the module is shallow.
 * @returns The message.
 */
function shallowMessage(
	binds: string,
	shape: ModuleShape,
	shallow: NonNullable<ModuleShape["shallow"]>,
): string {
	const { variables, passed } = shape;
	const { wraps, counts } = shallow;
	const sets = counts.length === 1 ? "only sets" : "each only sets";
	const only = counts.length === 0 ? "" : `; ${counts.join(", ")} ${sets} its count`;
	return (
		`${binds} wraps one resource, ${wraps}, and passes ${passed.length} of its ${variables} ` +
		`variables to one of its arguments each, unchanged: ${listed(passed, false)}${only}. ` +
		"Its interface is the resource's own, so it hides nothing (a shallow module): let " +
		"callers declare the resource, or let the module decide what its callers need not."
	);
}

/**
 * The finding on a container bound to a Terraform module that is shallow, or
 * that passes variables through.
 * @param read The board.
 * @param container The container.
 * @param shape The module's shape, when it is a Terraform module.
 * @returns The finding, or none.
 */
function terraformFindings(
	read: BoardToCheck,
	container: SemanticNode,
	shape: ModuleShape | undefined,
): CodeFinding[] {
	if (shape === undefined || shape.passed.length === 0) return [];
	const subject = nodeSubject(container);
	const { directory, variables, passed, shallow } = shape;
	const site = siteOf(read, `nodes.${container.id}`, subject);
	const binds = `${describeSubject(subject)} binds the module ${JSON.stringify(directory || ".")}, which`;
	const evidence = passed.map((each) => each.evidence);
	if (shallow !== undefined) {
		const message = shallowMessage(binds, shape, shallow);
		return [{ ...site, severity: "information", code: "MODULE_SHALLOW", message, evidence }];
	}
	const message =
		`${binds} passes ${passed.length} of its ${variables} variables to one argument of a ` +
		`resource unchanged: ${listed(passed, true)}. Each is a pass-through variable: its ` +
		"caller decides what the module could decide or hide.";
	return [{ ...site, severity: "information", code: "VARIABLE_PASSED_THROUGH", message, evidence }];
}

export { type ModuleShape, terraformFindings, terraformShape };
