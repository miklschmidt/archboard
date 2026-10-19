// What the check reads of a Terraform or OpenTofu plan JSON (ADR 0046): the
// output of `terraform show -json` or `tofu show -json`, which an agent names
// with `--plan`. The check never makes one: it runs neither program.
//
// It reads the `configuration` section alone, and of it only the addresses and
// the references between them: each module's resources, data sources, module
// calls, variables and outputs, and the `references` lists of their
// expressions. A plan can hold sensitive values in plain text (`variables`,
// `prior_state`, `planned_values`, `resource_changes`, and the
// `constant_value` of an expression), so nothing else of the document is kept.
// The configuration describes every module, a remote one too, so a plan tells
// the check what the modules it does not read declare. A reference proves what
// the rules of its resource's provider make of the argument it sits in, as in
// a configuration file (terraform-providers.ts).

import {
	classifyReference,
	type Classified,
} from "#runtime/operations/code-facts/terraform/terraform-providers.ts";

/** One reference a plan names, the declaration whose expressions name it, and what it proves. */
interface PlanLink extends Classified {
	/** The declaration, as its module addresses it. */
	readonly from: string;
	/** The reference as the plan writes it, such as `aws_sqs_queue.jobs.arn`. */
	readonly reference: string;
}

/** What a plan says one module declares, and the modules it calls. */
interface PlanModule {
	/** Each declaration's address in the module, with its kind. */
	readonly declarations: readonly { readonly address: string; readonly kind: string }[];
	readonly links: readonly PlanLink[];
	/** Each module call, by its name. */
	readonly calls: ReadonlyMap<string, PlanModule>;
}

/** A plan an agent named, inside a registered checkout, and what it says. */
interface TerraformPlan {
	/** The root of the checkout that holds it. */
	readonly checkoutRoot: string;
	/** The plan file, relative to the checkout. */
	readonly path: string;
	/** The root module it describes: the directory that holds it, `""` for the checkout's root. */
	readonly module: string;
	readonly configuration: PlanModule;
}

/** A JSON object, as the plan reader walks one. */
type JsonObject = Readonly<Record<string, unknown>>;

/**
 * Whether a value is a JSON object.
 * @param value The value.
 * @returns True for an object that is not an array.
 */
function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One reference an expression names, and the argument it sits in. */
interface Placed {
	readonly reference: string;
	readonly argument: readonly string[];
}

/**
 * Every reference an expression or a block of expressions names, never a
 * constant value, with the argument it sits in: the names of the keys on the
 * way to it, as the configuration file writes its attributes and nested blocks.
 * @param value An expression representation, a block of them, or a list of either.
 * @param argument The argument the value stands in.
 * @returns The references, as the plan writes them.
 */
function referencesIn(value: unknown, argument: readonly string[]): Placed[] {
	if (Array.isArray(value)) return value.flatMap((each) => referencesIn(each, argument));
	if (!isObject(value)) return [];
	return Object.entries(value).flatMap(([key, inner]) => {
		if (key === "constant_value") return [];
		if (key === "references" && Array.isArray(inner)) {
			return inner
				.filter((each): each is string => typeof each === "string")
				.map((reference) => ({ reference, argument }));
		}
		return referencesIn(inner, [...argument, key]);
	});
}

/** The argument each key of a declaration's representation stands for. */
const ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
	expressions: [],
	expression: [],
	count_expression: ["count"],
	for_each_expression: ["for_each"],
	provisioners: ["provisioner"],
};

/**
 * What tells two links of one declaration apart: the reference, and what it proves.
 * @param link The link.
 * @returns Its key.
 */
function linkKey(link: PlanLink): string {
	return `${link.reference}\0${link.kind}\0${link.joins ?? ""}`;
}

/**
 * The links of one declaration: every reference of the parts of it named.
 * @param from The declaration's address.
 * @param holder The object that holds its expressions.
 * @param keys The keys of the expressions.
 * @param type The declaration's resource or data source type, if it has one.
 * @returns The links.
 */
function linksOf(
	from: string,
	holder: JsonObject,
	keys: readonly string[],
	type?: string,
): PlanLink[] {
	const placed = keys.flatMap((key): Placed[] =>
		key === "depends_on" && Array.isArray(holder[key])
			? holder[key]
					.filter((each): each is string => typeof each === "string")
					.map((reference) => ({ reference, argument: ["depends_on"] }))
			: referencesIn(holder[key], ARGUMENTS[key] ?? [key]),
	);
	const links = placed.map(({ reference, argument }) => ({
		from,
		reference,
		...classifyReference(type, argument),
	}));
	return [...new Map(links.map((link) => [linkKey(link), link])).values()];
}

/** What a resource's mode makes its address start with. */
const MODE_PREFIX: Readonly<Record<string, string>> = {
	managed: "",
	data: "data.",
	ephemeral: "ephemeral.",
};

/** The keys of a resource that hold expressions. */
const RESOURCE_EXPRESSIONS = [
	"expressions",
	"count_expression",
	"for_each_expression",
	"provisioners",
	"depends_on",
];

/**
 * The resources and data sources of one module.
 * @param module The module's configuration.
 * @returns Their declarations and links.
 */
function resourcesOf(module: JsonObject): Pick<PlanModule, "declarations" | "links"> {
	const resources = Array.isArray(module["resources"]) ? module["resources"].filter(isObject) : [];
	const read = resources.flatMap((resource) => {
		const { mode, type, name } = resource;
		const prefix = typeof mode === "string" ? MODE_PREFIX[mode] : undefined;
		if (prefix === undefined || typeof type !== "string" || typeof name !== "string") return [];
		const address = `${prefix}${type}.${name}`;
		const kind = mode === "managed" ? "resource" : String(mode);
		return [{ address, kind, links: linksOf(address, resource, RESOURCE_EXPRESSIONS, type) }];
	});
	return {
		declarations: read.map(({ address, kind }) => ({ address, kind })),
		links: read.flatMap((each) => each.links),
	};
}

/**
 * The entries of an object a module keys by name.
 * @param module The module's configuration.
 * @param key The key, such as `outputs`.
 * @returns Each name and its object.
 */
function named(module: JsonObject, key: string): [string, JsonObject][] {
	const value = module[key];
	return isObject(value)
		? Object.entries(value).flatMap(([name, inner]) => (isObject(inner) ? [[name, inner]] : []))
		: [];
}

/**
 * One module's configuration, with the modules it calls.
 * @param module The module's configuration.
 * @param depth How many more modules deep the reading may go.
 * @returns What it declares and references.
 */
function moduleOf(module: JsonObject, depth: number): PlanModule {
	const resources = resourcesOf(module);
	const outputs = named(module, "outputs");
	const variables = named(module, "variables");
	const calls = depth > 0 ? named(module, "module_calls") : [];
	const callLinks = calls.flatMap(([name, call]) => [
		...linksOf(`module.${name}`, call, ["count_expression", "for_each_expression", "depends_on"]),
		...Object.entries(isObject(call["expressions"]) ? call["expressions"] : {}).flatMap(
			([argument, expression]) =>
				linksOf(`module.${name}.var.${argument}`, { [argument]: expression }, [argument]),
		),
	]);
	return {
		declarations: [
			...resources.declarations,
			...calls.map(([name]) => ({ address: `module.${name}`, kind: "module" })),
			...variables.map(([name]) => ({ address: `var.${name}`, kind: "variable" })),
			...outputs.map(([name]) => ({ address: `output.${name}`, kind: "output" })),
		],
		links: [
			...resources.links,
			...callLinks,
			...outputs.flatMap(([name, output]) =>
				linksOf(`output.${name}`, output, ["expression", "depends_on"]),
			),
		],
		calls: new Map(
			calls.flatMap(([name, call]) =>
				isObject(call["module"]) ? [[name, moduleOf(call["module"], depth - 1)] as const] : [],
			),
		),
	};
}

/** How deep a plan's module calls may nest before the reader stops. */
const MODULE_DEPTH = 32;

/**
 * What a plan JSON says its configuration declares and references.
 * @param text The plan file's text.
 * @returns Its root module.
 * @throws {Error} When the text is not a plan JSON with a configuration.
 */
function readTerraformPlan(text: string): PlanModule {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("it is not JSON");
	}
	const configuration = isObject(parsed) ? parsed["configuration"] : undefined;
	const root = isObject(configuration) ? configuration["root_module"] : undefined;
	if (!isObject(root)) throw new Error("it has no configuration.root_module");
	return moduleOf(root, MODULE_DEPTH);
}

export { type PlanLink, type PlanModule, type TerraformPlan, readTerraformPlan };
