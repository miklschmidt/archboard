// The shape of a Terraform or OpenTofu module (ADR 0044, ADR 0046,
// TASK-368.11): what it wraps, and which of its variables it only passes on.
//
// A module exposes its variables and outputs (module-exposure.ts). A variable
// is a pass-through variable (Ousterhout) when the module uses it once, as the
// whole value of one argument of a resource it manages: `bucket = var.bucket`,
// with no expression around it. A use inside the variable's own block, such as
// a validation, is no use. A module wraps one resource when it manages exactly
// one and calls no module; its data sources and locals are aside, because they
// only feed what it manages. A module that wraps one resource and passes every
// variable through, at least one, is shallow: its interface is the resource's,
// and the code proves it.
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

import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import type { RepoCheckout } from "@/runtime/code-check/lib/part-code";
import { siteOf } from "@/runtime/code-check/lib/relationships";
import type {
	Definition,
	FactsPass,
	ModuleExposure,
	Reference,
	SyntaxFacts,
} from "@/runtime/code-facts/index";
import { nodeSubject } from "@/runtime/semantic-board-store/index";
import type { CodeEvidence, CodeFinding } from "@/shared/code-check/index";
import type { SemanticNode } from "@/shared/semantic-board/index";
import { describeSubject } from "@/shared/semantic-policy/index";

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

/** What a Terraform module wraps, and the variables it passes through. */
interface ModuleShape {
	readonly repo: string;
	readonly directory: string;
	/** The one resource it manages, where it manages exactly one and calls no module. */
	readonly wraps: string | undefined;
	/** How many variables it declares. */
	readonly variables: number;
	readonly passed: readonly PassedVariable[];
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
	const argument = more.length === 0 ? use?.reference.argument : undefined;
	if (use === undefined || argument === undefined) return undefined;
	const { line } = use.reference;
	const resource = use.file.definitions.find(
		(each) => each.visibility === "resource" && spans(each, line),
	);
	if (resource === undefined) return undefined;
	return { name, resource: resource.symbol, argument, evidence: evidenceOf(repo, use) };
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
	const { directory } = exposure;
	return { repo, directory, wraps: wrapped(files), variables: variables.length, passed };
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
	const { directory, wraps, variables, passed } = shape;
	const site = siteOf(read, `nodes.${container.id}`, subject);
	const binds = `${describeSubject(subject)} binds the module ${JSON.stringify(directory)}, which`;
	const evidence = passed.map((each) => each.evidence);
	if (wraps !== undefined && passed.length === variables) {
		const message =
			`${binds} wraps one resource, ${wraps}, and passes each of its ${variables} variables to ` +
			`one of its arguments unchanged: ${listed(passed, false)}. Its interface is the ` +
			"resource's own, so it hides nothing (a shallow module): let callers declare the " +
			"resource, or let the module decide what its callers need not.";
		return [{ ...site, severity: "information", code: "MODULE_SHALLOW", message, evidence }];
	}
	const message =
		`${binds} passes ${passed.length} of its ${variables} variables to one argument of a ` +
		`resource unchanged: ${listed(passed, true)}. Each is a pass-through variable: its ` +
		"caller decides what the module could decide or hide.";
	return [{ ...site, severity: "information", code: "VARIABLE_PASSED_THROUGH", message, evidence }];
}

export { type ModuleShape, terraformFindings, terraformShape };
