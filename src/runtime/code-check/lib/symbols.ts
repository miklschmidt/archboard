// Where the files of a bound or anchored path hold a symbol, as code facts
// read them (ADR 0046): a file a grammar reads holds a symbol it defines, or
// for an anchor one it references too, and a file read as text holds its last
// name as a whole word. A symbol found only in code that did not parse is
// neither held nor missing.
//
// A binding whose path is a Terraform or OpenTofu root module names an
// address in that root's address space (ADR 0046): the root module's own
// declarations, and those of the modules its calls make. An address inside a
// module the check does not read, such as a remote one with no plan named for
// it, is neither held nor missing either.

import path from "node:path";
import type { ReadCheckout } from "@/runtime/code-check/lib/checkouts";
import {
	findSymbol,
	isTerraformFile,
	terraformConfiguration,
	terraformRootOf,
	type Accept,
	type Declared,
	type Definition,
	type FactsPass,
	type FileFacts,
	type Unparsed,
} from "@/runtime/code-facts/index";
import type { LocalCodeTarget } from "@archboard/code-binding/binding-resolver";

/** Where the files of a path hold a symbol. */
type Held =
	| {
			readonly status: "found";
			/** The file, relative to its checkout. */
			readonly file: string;
			readonly line?: number;
			readonly definition?: Definition;
	  }
	| { readonly status: "unparsed"; readonly file: string; readonly unparsed: Unparsed }
	/** An address inside a module the check does not read: the module call's address. */
	| { readonly status: "module-unread"; readonly module: string }
	| {
			readonly status: "absent";
			/** Every file was read as text, so only the symbol's last name was looked for. */
			readonly asText?: boolean;
	  };

/** What a search reports beside where it found the symbol: the files it read as text. */
interface Search {
	readonly facts: FactsPass;
	readonly checkout: ReadCheckout;
	/**
	 * Note a file read as text.
	 * @param file The file, relative to its checkout.
	 */
	readonly readAsText: (file: string) => void;
}

/**
 * Where one file holds a symbol.
 * @param facts The file's facts, if the pass could read it.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @returns Where it holds it.
 */
function heldIn(facts: FileFacts | undefined, symbol: string, accept: Accept): Held {
	if (facts === undefined) return { status: "absent" };
	const found = findSymbol(facts, symbol, accept);
	if (found.status === "absent") return found;
	return found.status === "unparsed"
		? { status: "unparsed", file: facts.path, unparsed: found.unparsed }
		: { ...found, file: facts.path };
}

/**
 * Where the files of a path hold a symbol: in the address space of the
 * Terraform root module a binding's path names, else in each file.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The files of the path, relative to the checkout.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @param root For a binding, the Terraform root module its path names, whose address the symbol is.
 * @returns Where they hold it.
 */
function heldInFiles(
	search: Search,
	files: readonly string[],
	symbol: string,
	accept: Accept,
	root?: string,
): Promise<Held> {
	return root !== undefined && accept === "definition"
		? heldByBinding(search, files, symbol, root)
		: heldInEach(search, files, symbol, accept);
}

/**
 * Where the files of a path hold a symbol, each as its language defines and
 * uses names: the first file that holds it, else the first that holds it only
 * in unparsed code, else nowhere.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The files of the path, relative to the checkout.
 * @param symbol The symbol.
 * @param accept A definition only, or a use too.
 * @returns Where they hold it.
 */
async function heldInEach(
	search: Search,
	files: readonly string[],
	symbol: string,
	accept: Accept,
): Promise<Held> {
	const read = await Promise.all(files.map((file) => search.facts.read(search.checkout, file)));
	for (const facts of read) if (facts?.adapter === "text") search.readAsText(facts.path);
	const held = read.map((facts) => heldIn(facts, symbol, accept));
	const asText = read.every((facts) => facts?.adapter === "text");
	return (
		held.find((each) => each.status === "found") ??
		held.find((each) => each.status === "unparsed") ?? { status: "absent", asText }
	);
}

/**
 * The root module a resolved bound path names, when it is Terraform's.
 * @param target The resolved path.
 * @param files The files of its checkout.
 * @returns The root module's directory, relative to the checkout, or undefined.
 */
function terraformRootOfTarget(
	target: LocalCodeTarget,
	files: ReadonlySet<string>,
): string | undefined {
	const where = path.relative(target.root, target.target).split(path.sep).join("/");
	return terraformRootOf(where, target.kind, files);
}

/**
 * Where an address space holds an address, as a binding's search says it.
 * @param declared What the address space holds there.
 * @returns Where the checkout holds it, or why it does not.
 */
function heldAtAddress(declared: Declared): Held {
	if (declared.status === "unread") return { status: "module-unread", module: declared.module };
	if (declared.status === "unparsed") {
		return { status: "unparsed", file: declared.path, unparsed: declared.unparsed };
	}
	const site = declared.status === "found" ? declared.site : undefined;
	return site === undefined
		? { status: "absent" }
		: {
				status: "found",
				file: site.path,
				line: site.definition.start,
				definition: site.definition,
			};
}

/**
 * Where a binding's files define its symbol. Where its path is a Terraform
 * root module, the symbol is an address of that root; one it does not declare
 * is looked for in the bound files that another adapter reads, as its language
 * defines a name, and is missing as an address when none of them defines it.
 * A file read as text holds no definition, so it never stands in for one.
 * @param search The pass, the checkout, and where files read as text are noted.
 * @param files The bound files, relative to the checkout.
 * @param symbol The binding's symbol.
 * @param root The Terraform root module the bound path names.
 * @returns Where they define it.
 */
async function heldByBinding(
	search: Search,
	files: readonly string[],
	symbol: string,
	root: string,
): Promise<Held> {
	const configuration = await terraformConfiguration(search.facts, search.checkout, root);
	const held = heldAtAddress(configuration.declared(symbol));
	if (held.status !== "absent") return held;
	const others = files.filter((file) => !isTerraformFile(file));
	const read = await Promise.all(others.map((file) => search.facts.read(search.checkout, file)));
	const parsed = read.flatMap((facts) =>
		facts === undefined || facts.adapter === "text" ? [] : [facts.path],
	);
	const elsewhere = await heldInEach(search, parsed, symbol, "definition");
	return elsewhere.status === "absent" ? held : elsewhere;
}

export { type Held, type Search, heldInFiles, terraformRootOfTarget };
