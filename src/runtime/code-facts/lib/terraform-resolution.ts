// Where a Terraform or OpenTofu module call leads (ADR 0046). A module is a
// directory: every `.tf` and `.tofu` file directly in it. A `source` that is a
// local path, `./` or `../`, resolves to that directory when the checkout has
// configuration there. Every other source (the registry, Git, an archive, a
// bucket) is a remote module: it reaches code the check does not read, and the
// check never fetches it, nor reads the copy `terraform init` puts under
// `.terraform`.

import path from "node:path";
import type { ImportResolver } from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import { neverRead } from "@/runtime/code-facts/lib/never-read";
import { isTerraformFile } from "@/runtime/code-facts/lib/terraform-address";

/**
 * The directory of a file of a checkout, `""` for its root.
 * @param file The file.
 * @returns Its directory.
 */
function directoryOf(file: string): string {
	const directory = path.posix.dirname(file);
	return directory === "." ? "" : directory;
}

/**
 * Every directory of a checkout that holds Terraform or OpenTofu configuration
 * directly, the modules of the checkout, with their files.
 * @param checkout The checkout's files.
 * @returns Each directory, `""` for the checkout's root, and its configuration files in order.
 */
function terraformModules(checkout: Pick<CheckoutFiles, "files">): Map<string, string[]> {
	const modules = new Map<string, string[]>();
	const files = [...checkout.files].filter((file) => isTerraformFile(file) && !neverRead(file));
	for (const file of files.toSorted()) {
		const directory = directoryOf(file);
		const held = modules.get(directory);
		if (held === undefined) modules.set(directory, [file]);
		else held.push(file);
	}
	return modules;
}

/**
 * The resolver of one checkout's module calls.
 * @param checkout The checkout's files.
 * @returns The resolver: a module call with a local source resolves to the module's directory.
 */
function createTerraformResolver(checkout: CheckoutFiles): ImportResolver {
	const modules = terraformModules(checkout);
	return {
		/**
		 * Where one module call leads.
		 * @param from The calling file.
		 * @param found The module call.
		 * @returns It, resolved to a directory of the checkout where its source is local.
		 */
		resolve(from, found) {
			if (!/^\.\.?\//u.test(found.specifier)) return found;
			const joined = path.posix.normalize(path.posix.join(directoryOf(from), found.specifier));
			const directory = joined.replace(/\/+$/u, "").replace(/^\.$/u, "");
			const inside = directory !== ".." && !directory.startsWith("../");
			return inside && modules.has(directory) ? { ...found, resolved: directory } : found;
		},
	};
}

export { createTerraformResolver, directoryOf, terraformModules };
