// How Terraform and OpenTofu spell an address (ADR 0046), shared by the
// adapter, which reads it from an expression, the configuration reader, and
// the plan reader, which reads it from the strings of a plan JSON.
//
// The positional address grammar itself lives in `@archboard/model/vault-policy`
// so semantics checks (containment, duplicate bindings) and code-intel agree
// on every valid address and canonical nested-block spelling.

import {
	type NestedBlockSelector,
	type ParsedTerraformAddress,
	declarationAddress,
	decodeHclString,
	moduleOutputReferenceAddress,
	parseTerraformAddress,
	splitAddressSegments,
} from "@archboard/model/vault-policy";

/** The files of a Terraform or OpenTofu module. */
const TERRAFORM_FILE = /\.(?:tf|tofu)$/u;

/** Names that start no address: iteration, the module's path, the workspace, the object itself. */
const NOT_AN_ADDRESS = new Set(["count", "each", "path", "terraform", "self"]);

/**
 * How many names an address that starts with a name has, given how many the
 * reference has; two (`aws_sqs_queue.jobs`, `var.region`) for any other name.
 * A module call is `module.checkout`, or with the output it reads `module.checkout.url`.
 */
const LENGTH: ReadonlyMap<string, (written: number) => number> = new Map([
	["data", () => 3],
	["ephemeral", () => 3],
	["module", (written: number) => Math.max(2, Math.min(written, 3))],
]);

/**
 * Whether a file is Terraform or OpenTofu configuration.
 * @param file The file.
 * @returns True for a `.tf` or `.tofu` file.
 */
function isTerraformFile(file: string): boolean {
	return TERRAFORM_FILE.test(file);
}

/**
 * The address the first names of a reference name.
 * @param names The names of the reference in order, without its index keys:
 * `["aws_sqs_queue", "jobs", "arn"]`.
 * @returns The address, or undefined when the names start no address or stop
 * before one is complete.
 */
function addressOf(names: readonly string[]): string | undefined {
	const [root = ""] = names;
	if (NOT_AN_ADDRESS.has(root)) return undefined;
	const length = LENGTH.get(root)?.(names.length) ?? 2;
	return names.length >= length ? names.slice(0, length).join(".") : undefined;
}

/**
 * A reference as a plan JSON or HCL writes it, without its index keys.
 * @param written The reference, such as `module.app[0].url` or `aws_instance.web["a.b"]`.
 * @returns Its names.
 */
function namesOf(written: string): string[] {
	return written
		.replaceAll(/\[(?:"(?:[^"\\]|\\.)*"|[^\]])*\]/gu, "")
		.split(".")
		.filter((name) => name !== "");
}

export {
	type NestedBlockSelector,
	type ParsedTerraformAddress,
	addressOf,
	declarationAddress,
	decodeHclString,
	isTerraformFile,
	moduleOutputReferenceAddress,
	namesOf,
	parseTerraformAddress,
	splitAddressSegments,
};
