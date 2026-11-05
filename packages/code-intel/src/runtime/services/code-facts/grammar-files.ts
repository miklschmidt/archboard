// The files of every grammar code facts parses with: each grammar's published
// `.wasm` file and the query an adapter reads captures by. They are module
// imports, so a checkout reads them from `node_modules` and beside this file,
// and the executable of a release embeds them (ADR 0075). Which grammar reads
// which file is the adapter table's (adapters.ts).

import cSharpWasm from "tree-sitter-c-sharp/tree-sitter-c_sharp.wasm" with { type: "file" };
import cWasm from "tree-sitter-c/tree-sitter-c.wasm" with { type: "file" };
import cppWasm from "tree-sitter-cpp/tree-sitter-cpp.wasm" with { type: "file" };
import goWasm from "tree-sitter-go/tree-sitter-go.wasm" with { type: "file" };
import nixWasm from "@lumis-sh/wasm-nix/tree-sitter-nix.wasm" with { type: "file" };
import objcWasm from "tree-sitter-objc/tree-sitter-objc.wasm" with { type: "file" };
import pythonWasm from "tree-sitter-python/tree-sitter-python.wasm" with { type: "file" };
import rustWasm from "tree-sitter-rust/tree-sitter-rust.wasm" with { type: "file" };
import swiftWasm from "@lumis-sh/wasm-swift/tree-sitter-swift.wasm" with { type: "file" };
import terraformWasm from "@tree-sitter-grammars/tree-sitter-hcl/tree-sitter-terraform.wasm" with { type: "file" };
import tsxWasm from "tree-sitter-typescript/tree-sitter-tsx.wasm" with { type: "file" };
import typescriptWasm from "tree-sitter-typescript/tree-sitter-typescript.wasm" with { type: "file" };
import cQuery from "#runtime/services/code-facts/c.scm" with { type: "text" };
import cSharpQuery from "#runtime/services/code-facts/csharp.scm" with { type: "text" };
import goQuery from "#runtime/services/code-facts/go.scm" with { type: "text" };
import nixQuery from "#runtime/services/code-facts/nix.scm" with { type: "text" };
import objcQuery from "#runtime/services/code-facts/objc.scm" with { type: "text" };
import pythonQuery from "#runtime/services/code-facts/python.scm" with { type: "text" };
import rustQuery from "#runtime/services/code-facts/rust.scm" with { type: "text" };
import swiftQuery from "#runtime/services/code-facts/swift.scm" with { type: "text" };
import terraformQuery from "#runtime/services/code-facts/terraform.scm" with { type: "text" };
import typescriptQuery from "#runtime/services/code-facts/typescript.scm" with { type: "text" };

/** A grammar's `.wasm` file, by path, and the text of its query. */
interface GrammarSource {
	readonly wasm: string;
	readonly query: string;
}

const GRAMMARS = Object.freeze({
	c: { wasm: cWasm, query: cQuery },
	/** C++ reads captures by the C query. */
	cpp: { wasm: cppWasm, query: cQuery },
	csharp: { wasm: cSharpWasm, query: cSharpQuery },
	go: { wasm: goWasm, query: goQuery },
	nix: { wasm: nixWasm, query: nixQuery },
	objc: { wasm: objcWasm, query: objcQuery },
	python: { wasm: pythonWasm, query: pythonQuery },
	rust: { wasm: rustWasm, query: rustQuery },
	swift: { wasm: swiftWasm, query: swiftQuery },
	/** The `terraform` dialect of the HCL grammar, which Terraform's and OpenTofu's templates follow (TASK-367.17). */
	terraform: { wasm: terraformWasm, query: terraformQuery },
	tsx: { wasm: tsxWasm, query: typescriptQuery },
	typescript: { wasm: typescriptWasm, query: typescriptQuery },
} satisfies Record<string, GrammarSource>);

export { GRAMMARS, type GrammarSource };
