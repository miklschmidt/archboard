// The grammars of the languages a source excerpt is coloured in (TASK-590.15): the languages the
// code check reads, and the files its evidence names. Each is imported only when the first excerpt
// of its language is drawn, and no other grammar is in the build.

import type { LanguageRegistration } from "shiki/core";

/** A grammar, imported when it is first needed. */
type Grammar = () => Promise<{ default: LanguageRegistration[] }>;

/** The grammar of each language an excerpt is coloured in. */
const GRAMMARS = {
	/**
	 * Import a grammar.
	 * @returns The grammar of TypeScript.
	 */
	typescript: () => import("shiki/langs/typescript.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of TSX.
	 */
	tsx: () => import("shiki/langs/tsx.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of JavaScript.
	 */
	javascript: () => import("shiki/langs/javascript.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of JSX.
	 */
	jsx: () => import("shiki/langs/jsx.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of Python.
	 */
	python: () => import("shiki/langs/python.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of C#.
	 */
	csharp: () => import("shiki/langs/csharp.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of Swift.
	 */
	swift: () => import("shiki/langs/swift.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of C.
	 */
	c: () => import("shiki/langs/c.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of C++.
	 */
	cpp: () => import("shiki/langs/cpp.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of Objective-C.
	 */
	"objective-c": () => import("shiki/langs/objective-c.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of Rust.
	 */
	rust: () => import("shiki/langs/rust.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of Go.
	 */
	go: () => import("shiki/langs/go.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of Terraform and HCL.
	 */
	terraform: () => import("shiki/langs/terraform.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of YAML.
	 */
	yaml: () => import("shiki/langs/yaml.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of JSON.
	 */
	json: () => import("shiki/langs/json.mjs"),
	/**
	 * Import a grammar.
	 * @returns The grammar of a Dockerfile.
	 */
	dockerfile: () => import("shiki/langs/dockerfile.mjs"),
} satisfies Record<string, Grammar>;

/** A language an excerpt is coloured in. */
type CodeLanguage = keyof typeof GRAMMARS;

export { GRAMMARS, type CodeLanguage };
