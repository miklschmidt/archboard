// The address space of one Terraform or OpenTofu root module (ADR 0046): what
// it declares at each address, and what each declaration reaches.
//
// A binding names a root module by its path, a directory that holds
// configuration or a file in one, and a declaration by its address relative to
// that root: `aws_lambda_function.api` in the root module itself, and
// `module.checkout.aws_lambda_function.api` inside the module that the call
// `checkout` makes. A module is a directory, so the root's address space is
// read across every directory its local module calls reach, each call giving
// its own instance of the module its own addresses. A remote module is not
// read. A plan JSON an agent names for the root module (TASK-367.17) fills in
// the modules the check does not read; the configuration on disk decides
// every module it reads, so an old plan never brings back what the code no
// longer declares.
//
// What a declaration reaches: a resource, a data source, an ephemeral resource
// or a module call, followed from its references through every variable,
// module argument, output and local value on the way, which only pass a value
// on. A module's variable takes what the calling module's argument gives it,
// and a module call's output what the output's expression names. A reference
// into a module the check does not read reaches the module call itself, and
// that call reaches what its arguments name, as no code of the module is read
// to take their values further. What such an argument is for is unknown, so
// it proves provisioning, unless it is an environment value (TASK-367.18).

import type {
	Definition,
	ResolvedImport,
	SyntaxFacts,
	Unparsed,
} from "#runtime/operations/code-facts/facts.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";
import {
	addressOf,
	declarationAddress,
	isTerraformFile,
	namesOf,
} from "#runtime/operations/code-facts/terraform/terraform-address.ts";
import type {
	PlanModule,
	TerraformPlan,
} from "#runtime/operations/code-facts/terraform/terraform-plan.ts";
import {
	type JoinEnd,
	unreadModuleArgumentKind,
} from "#runtime/operations/code-facts/terraform/terraform-providers.ts";
import { reachedFrom } from "#runtime/operations/code-facts/terraform/terraform-reach.ts";
import {
	directoryOf,
	terraformModules,
} from "#runtime/operations/code-facts/terraform/terraform-resolution.ts";
import { lastName } from "#runtime/operations/code-facts/text-reading.ts";
import type { EvidenceKindSchema } from "@archboard/board/policy";
import type { z } from "zod";

type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

/** One declaration of the root module's address space. */
interface Declaration {
	/** Its address, relative to the root module. */
	readonly address: string;
	/** `resource`, `data`, `ephemeral`, `module`, `variable`, `argument`, `output` or `local`. */
	readonly kind: string;
	/** Where the checkout declares it; absent for a declaration only a plan names. */
	readonly path?: string;
	readonly definition?: Definition;
}

/** One reference from a declaration to an address. */
interface Link {
	readonly from: string;
	readonly to: string;
	/** Where it is written: a file of the checkout, or the plan that names it. */
	readonly path: string;
	readonly line: number;
	/** The reference as the file or the plan writes it. */
	readonly symbol: string;
	/** What the reference proves, by its provider's rules (terraform-providers.ts). */
	readonly kind: EvidenceKind;
	/** The end of the joining declaration it is written in that it names, if any. */
	readonly joins?: JoinEnd;
}

/** Where the checkout declares an address, or the module call that holds it. */
interface Site {
	readonly path: string;
	readonly definition: Definition;
}

/** What the address space holds at an address. */
type Declared =
	| { readonly status: "found"; readonly declaration: Declaration; readonly site?: Site }
	/** It is inside a module the check does not read: the module call's address. */
	| { readonly status: "unread"; readonly module: string }
	| { readonly status: "unparsed"; readonly path: string; readonly unparsed: Unparsed }
	| { readonly status: "absent" };

/** The address space of one root module. */
interface TerraformConfiguration {
	/** The root module's directory, relative to the checkout. */
	readonly root: string;
	/**
	 * What the configuration declares at a binding's symbol.
	 * @param symbol The address, with or without an instance key.
	 */
	declared(symbol: string): Declared;
	/** Every resource, data source, ephemeral resource and module call. */
	readonly endpoints: readonly Declaration[];
	/**
	 * What a declaration reaches, each with the reference of the declaration
	 * that starts the way there, once for each thing those references prove.
	 * @param address The declaration's address.
	 */
	reached(address: string): readonly { readonly to: Declaration; readonly link: Link }[];
	/**
	 * Where the checkout holds a declaration: its own block, else the call of
	 * the module the checkout does not read that holds it.
	 * @param address The address.
	 */
	siteOf(address: string): Site | undefined;
	/**
	 * The addresses of the declaration a file declares at a line: one for each
	 * module instance that reads the file.
	 * @param path The file, relative to the checkout.
	 * @param line The first line of the declaration.
	 */
	addressesAt(path: string, line: number): readonly string[];
}

/** The kinds of declaration that only pass a value on. */
const PASSING = new Set(["variable", "argument", "output", "local"]);

/** How many module calls deep the reading goes before it stops, as a module that calls itself would. */
const MODULE_DEPTH = 32;

/** A reference read from a file or a plan, before the module calls it passes are known. */
interface Written {
	readonly from: string;
	/** The module instance it is written in: `""`, or `module.a.` and so on. */
	readonly scope: string;
	readonly names: readonly string[];
	readonly path: string;
	readonly line: number;
	readonly symbol: string;
	readonly kind: EvidenceKind;
	readonly joins?: JoinEnd;
	/** The path of the argument it sits in, for a reference a file writes. */
	readonly argument?: string;
}

/** What the reading of one root module collects. */
interface Reading {
	readonly pass: FactsPass;
	readonly checkout: CheckoutFiles;
	/** The modules of the checkout, by directory, with their configuration files. */
	readonly modules: ReadonlyMap<string, readonly string[]>;
	readonly declarations: Map<string, Declaration>;
	readonly written: Written[];
	/** The module instances read, by their scope: the files the check read there. */
	readonly scopes: Map<string, readonly string[]>;
	/** Module calls whose module the check does not read, by their address. */
	readonly unread: Set<string>;
	readonly unparsed: Map<string, { readonly path: string; readonly unparsed: Unparsed }[]>;
	/**
	 * Every address each file declares at each line, by `path\0line`, a
	 * variable that a module call's argument already declares at its address too.
	 */
	readonly sites: Map<string, string[]>;
}

/**
 * The narrowest declaration of a file that holds a line.
 * @param facts The file's facts.
 * @param line The line.
 * @returns The definition, or undefined outside every declaration.
 */
function holderAt(facts: SyntaxFacts, line: number): Definition | undefined {
	return facts.definitions
		.filter((definition) => definition.start <= line && line <= definition.end)
		.toSorted((left, right) => left.end - left.start - (right.end - right.start))[0];
}

/**
 * Add a declaration, unless the address space has one at its address already.
 * @param reading What the reading collects.
 * @param declaration The declaration.
 */
function declare(reading: Reading, declaration: Declaration): void {
	if (!reading.declarations.has(declaration.address)) {
		reading.declarations.set(declaration.address, declaration);
	}
}

/**
 * The references one file of a module instance writes, each from the
 * narrowest declaration that holds it.
 * @param facts The file's facts.
 * @param scope The module instance.
 * @returns The references; one outside every declaration, and the name of an
 * environment value, which names no address, are none.
 */
function writtenIn(facts: SyntaxFacts, scope: string): Written[] {
	return facts.references.flatMap((reference) => {
		const holder = holderAt(facts, reference.line);
		if (holder === undefined || reference.via !== "code") return [];
		const { symbol, line, joins, argument } = reference;
		const names = symbol.split(".");
		const kind = reference.kind ?? "configured-path";
		const from = `${scope}${holder.symbol}`;
		const where = { path: facts.path, line, symbol, ...(argument !== undefined && { argument }) };
		return [{ from, scope, names, ...where, kind, ...(joins && { joins }) }];
	});
}

/**
 * Read one file of a module instance into the address space.
 * @param reading What the reading collects.
 * @param facts The file's facts.
 * @param scope The module instance.
 */
function readFile(reading: Reading, facts: SyntaxFacts, scope: string): void {
	for (const definition of facts.definitions) {
		const address = `${scope}${definition.symbol}`;
		declare(reading, { address, kind: definition.visibility, path: facts.path, definition });
		const at = `${facts.path}\0${definition.start}`;
		reading.sites.set(at, [...(reading.sites.get(at) ?? []), address]);
	}
	reading.written.push(...writtenIn(facts, scope));
	const parts = facts.unparsed.map((unparsed) => ({ path: facts.path, unparsed }));
	reading.unparsed.set(scope, [...(reading.unparsed.get(scope) ?? []), ...parts]);
}

/**
 * The directory a module call of an instance leads to, when the reading reads it.
 * @param reading What the reading collects.
 * @param call The module call.
 * @param chain The directories of the instance and the instances above it.
 * @returns The module's directory, or undefined for a module the reading does not read.
 */
function childOf(
	reading: Reading,
	call: ResolvedImport,
	chain: readonly string[],
): string | undefined {
	const child = call.resolved;
	if (child === undefined || !reading.modules.has(child)) return undefined;
	return chain.length > MODULE_DEPTH || chain.includes(child) ? undefined : child;
}

/**
 * Read one module instance, and every module instance its calls make. A
 * module call whose source the reading does not read is noted as unread.
 * @param reading What the reading collects.
 * @param directory The module's directory.
 * @param scope The instance's scope.
 * @param chain The directories of the instances above it, so a module that calls itself ends.
 */
async function readScope(
	reading: Reading,
	directory: string,
	scope: string,
	chain: readonly string[],
): Promise<void> {
	const files = reading.modules.get(directory) ?? [];
	reading.scopes.set(scope, files);
	const read = await Promise.all(files.map((file) => reading.pass.read(reading.checkout, file)));
	const parsed = read.filter((facts): facts is SyntaxFacts => facts?.adapter === "terraform");
	for (const facts of parsed) readFile(reading, facts, scope);
	const calls = new Map(
		parsed.flatMap((facts) => facts.imports).map((call) => [call.names[0]?.local, call]),
	);
	const modules = parsed
		.flatMap((facts) => facts.definitions)
		.filter((each) => each.visibility === "module");
	for (const { symbol } of modules) {
		const call = calls.get(symbol);
		const child = call === undefined ? undefined : childOf(reading, call, [...chain, directory]);
		if (child === undefined) reading.unread.add(`${scope}${symbol}`);
		// oxlint-disable-next-line no-await-in-loop -- one module instance at a time keeps the first declaration of an address the one the reading meets first
		else await readScope(reading, child, `${scope}${symbol}.`, [...chain, directory]);
	}
}

/**
 * Whether a plan fills in a module instance: one the check did not read,
 * whose module call it noted as unread, or inside one the plan filled in.
 * @param reading What the reading collects.
 * @param scope The instance's scope.
 * @param filled Whether the plan filled in the instance that calls this one.
 * @returns True when it does.
 */
function planFills(reading: Reading, scope: string, filled: boolean): boolean {
	if (reading.scopes.has(scope)) return false;
	return filled || scope === "" || reading.unread.has(scope.slice(0, -1));
}

/**
 * Fill in, from a plan, the module instances the check did not read.
 * @param reading What the reading collects.
 * @param plan The plan.
 * @param module What the plan says one module instance declares.
 * @param scope The instance's scope.
 * @param filled Whether the plan filled in the instance that calls this one.
 */
function readPlanScope(
	reading: Reading,
	plan: TerraformPlan,
	module: PlanModule,
	scope: string,
	filled: boolean,
): void {
	const fills = planFills(reading, scope, filled);
	if (fills) {
		reading.unread.delete(scope.slice(0, -1));
		reading.scopes.set(scope, []);
		for (const { address, kind } of module.declarations) {
			declare(reading, { address: `${scope}${address}`, kind });
		}
		reading.written.push(
			...module.links.flatMap((link) => {
				const names = namesOf(link.reference);
				// The address alone, as the adapter writes a reference: never an index key of the plan's.
				const symbol = addressOf(names);
				if (symbol === undefined) return [];
				const { kind, joins } = link;
				const from = `${scope}${link.from}`;
				return [
					{ from, scope, names, path: plan.path, line: 1, symbol, kind, ...(joins && { joins }) },
				];
			}),
		);
	}
	for (const [name, child] of module.calls) {
		readPlanScope(reading, plan, child, `${scope}module.${name}.`, fills);
	}
}

/**
 * The address a written reference reaches in the root's address space: an
 * output of a module the check reads, or else the module call itself.
 * @param reading What the reading collects.
 * @param written The reference.
 * @returns The address, or undefined when it names no address.
 */
function reachedAddress(reading: Reading, written: Written): string | undefined {
	const address = addressOf(written.names);
	if (address === undefined) return undefined;
	const [root, name, output] = address.split(".");
	if (root !== "module" || name === undefined) return `${written.scope}${address}`;
	const call = `${written.scope}module.${name}`;
	return output !== undefined && reading.scopes.has(`${call}.`) ? `${call}.output.${output}` : call;
}

/**
 * The links a reference makes, by the declaration each is from: the one it is
 * written in, and for an argument of a module call whose module the check
 * does not read, the call too. No code of that module is read to take the
 * value further, so the call itself reaches what the argument names, with the
 * kind such an argument proves (terraform-providers.ts).
 * @param reading What the reading collects.
 * @param written The reference.
 * @param link Its link from the declaration it is written in.
 * @returns Each declaration with its link.
 */
function linksFrom(reading: Reading, written: Written, link: Link): [string, Link][] {
	const own: [string, Link] = [written.from, link];
	if (reading.declarations.get(written.from)?.kind !== "argument") return [own];
	const call = written.from.split(".").slice(0, -2).join(".");
	if (!reading.unread.has(call)) return [own];
	const kind = unreadModuleArgumentKind(written.argument?.split(".") ?? []);
	return [own, [call, { ...link, kind }]];
}

/**
 * The links of the address space, each reference resolved to its address.
 * @param reading What the reading collects.
 * @returns The links of each declaration, in the order the reading met them.
 */
function linksOf(reading: Reading): Map<string, Link[]> {
	const links = new Map<string, Link[]>();
	for (const written of reading.written) {
		const to = reachedAddress(reading, written);
		if (to === undefined || to === written.from) continue;
		for (const [from, link] of linksFrom(reading, written, { ...written, to })) {
			links.set(from, [...(links.get(from) ?? []), link]);
		}
	}
	return links;
}

/**
 * The module call the check does not read whose module holds an address, if any.
 * @param reading What the reading collects.
 * @param address The address.
 * @returns The module call's address.
 */
function unreadModuleOf(reading: Reading, address: string): string | undefined {
	const names = address.split(".");
	for (let index = 0; index + 1 < names.length; index += 1) {
		if (names[index] !== "module") continue;
		const call = names.slice(0, index + 2).join(".");
		if (reading.unread.has(call)) return call;
		if (!reading.scopes.has(`${call}.`)) return undefined;
	}
	return undefined;
}

/**
 * The innermost module instance the reading read that an address lies in.
 * @param reading What the reading collects.
 * @param address The address.
 * @returns Its scope.
 */
function scopeOf(reading: Reading, address: string): string {
	const names = address.split(".");
	let scope = "";
	for (let index = 0; index + 1 < names.length && names[index] === "module"; index += 2) {
		const inner = `${names.slice(0, index + 2).join(".")}.`;
		if (!reading.scopes.has(inner)) break;
		scope = inner;
	}
	return scope;
}

/**
 * Where the checkout holds an address: its own block, else the block of the
 * nearest module call that holds it.
 * @param declarations The address space.
 * @param address The address.
 * @returns The site, or undefined when no declaration of the checkout holds it.
 */
function siteIn(declarations: ReadonlyMap<string, Declaration>, address: string): Site | undefined {
	const names = address.split(".");
	for (let count = names.length; count > 0; count -= 1) {
		const held = declarations.get(names.slice(0, count).join("."));
		if (held?.path !== undefined && held.definition !== undefined) {
			return { path: held.path, definition: held.definition };
		}
	}
	return undefined;
}

/**
 * What the address space holds at a symbol.
 * @param reading What the reading collected.
 * @param symbol The address, with or without an instance key.
 * @returns The declaration and its site, or why there is none.
 */
function declaredIn(reading: Reading, symbol: string): Declared {
	const address = declarationAddress(symbol);
	const declaration = reading.declarations.get(address);
	if (declaration !== undefined) {
		const site = siteIn(reading.declarations, address);
		return { status: "found", declaration, ...(site === undefined ? {} : { site }) };
	}
	const module = unreadModuleOf(reading, address);
	if (module !== undefined) return { status: "unread", module };
	const name = lastName(address);
	const parts = reading.unparsed.get(scopeOf(reading, address)) ?? [];
	const part = parts.find((each) => each.unparsed.names.includes(name));
	return part === undefined ? { status: "absent" } : { status: "unparsed", ...part };
}

/**
 * The address space as its readers ask it.
 * @param reading What the reading collected.
 * @param root The root module's directory.
 * @returns The configuration.
 */
function configurationOf(reading: Reading, root: string): TerraformConfiguration {
	const links = linksOf(reading);
	const { declarations } = reading;
	return {
		root,
		endpoints: [...declarations.values()].filter((each) => !PASSING.has(each.kind)),
		/**
		 * Where the checkout holds an address.
		 * @param address The address.
		 * @returns The site.
		 */
		siteOf(address) {
			return siteIn(declarations, address);
		},
		/**
		 * The addresses declared at a line of a file.
		 * @param path The file.
		 * @param line The line.
		 * @returns The addresses.
		 */
		addressesAt(path, line) {
			return reading.sites.get(`${path}\0${line}`) ?? [];
		},
		/**
		 * What the configuration declares at a symbol.
		 * @param symbol The address.
		 * @returns What it holds there.
		 */
		declared(symbol) {
			return declaredIn(reading, symbol);
		},
		/**
		 * What a declaration reaches.
		 * @param address Its address.
		 * @returns Each declaration reached, with the link that starts the way.
		 */
		reached(address) {
			return reachedFrom(declarations, links, address, PASSING);
		},
	};
}

/** The configurations each pass has read, by checkout and root module. */
const READ = new WeakMap<FactsPass, Map<string, Promise<TerraformConfiguration>>>();

/**
 * Read the address space of one root module.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param root The root module's directory.
 * @returns The configuration.
 */
async function readConfiguration(
	pass: FactsPass,
	checkout: CheckoutFiles,
	root: string,
): Promise<TerraformConfiguration> {
	const reading: Reading = {
		pass,
		checkout,
		modules: terraformModules(checkout),
		declarations: new Map(),
		written: [],
		scopes: new Map(),
		unread: new Set(),
		unparsed: new Map(),
		sites: new Map(),
	};
	if (reading.modules.has(root)) await readScope(reading, root, "", []);
	for (const plan of pass.plans) {
		if (plan.checkoutRoot === checkout.root && plan.module === root) {
			readPlanScope(reading, plan, plan.configuration, "", false);
		}
	}
	return configurationOf(reading, root);
}

/**
 * The address space of one root module, read once in a pass.
 * @param pass The pass, with the plans an agent named.
 * @param checkout The checkout and the files the pass may read.
 * @param root The root module's directory, relative to the checkout.
 * @returns The configuration.
 */
function terraformConfiguration(
	pass: FactsPass,
	checkout: CheckoutFiles,
	root: string,
): Promise<TerraformConfiguration> {
	const read = READ.get(pass) ?? new Map<string, Promise<TerraformConfiguration>>();
	READ.set(pass, read);
	const key = `${checkout.root}\0${root}`;
	let configuration = read.get(key);
	if (configuration === undefined) {
		configuration = readConfiguration(pass, checkout, root);
		read.set(key, configuration);
	}
	return configuration;
}

/**
 * The root module a bound path names, when it is Terraform's: a directory
 * that holds configuration directly, or the directory of a configuration file.
 * @param where The bound path, relative to the checkout.
 * @param kind Whether it is a file or a directory.
 * @param files The files of the checkout.
 * @returns The root module's directory, or undefined for any other path.
 */
function terraformRootOf(
	where: string,
	kind: "file" | "directory",
	files: ReadonlySet<string>,
): string | undefined {
	if (kind === "file") return isTerraformFile(where) ? directoryOf(where) : undefined;
	return terraformModules({ files }).has(where) ? where : undefined;
}

export {
	type Declaration,
	type Declared,
	type Link,
	type TerraformConfiguration,
	terraformConfiguration,
	terraformRootOf,
};
