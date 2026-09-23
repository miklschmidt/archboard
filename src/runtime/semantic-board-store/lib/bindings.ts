// What the vault can say about a node's binding to code (TASK-260).
//
// A node's binding is part of its meaning, not a presentation overlay: it is
// what "open the code" resolves. Nothing notices when the file it names stops
// existing, so a board keeps offering a link to a path that moved years ago
// and only says so when somebody clicks it.
//
// This belongs in the vault checker for the same reason the drill-down checks
// do (see `drill-down.ts`): the answer depends on a filesystem the board does
// not own. The binding was true when it was written and goes stale by itself,
// with no write to refuse — refusing one at the write boundary would only
// refuse the wrong agent at the wrong moment.
//
// A binding is judged by the variant it is on, because existence is a fact
// about a variant (ADR 0031). Only the current variant says its architecture is
// built, so only there does a path that is not in the checkout mean the
// binding went stale. Three things it deliberately does not say:
//
//   - nothing about a repository this machine has not registered. Where
//     `github.com/acme/payments` lives here is a machine-local fact
//     (repo-registry), so a fresh clone would otherwise warn about every bound
//     node on every board, and none of those warnings would be about the vault;
//   - nothing about a draft. A proposal describes code nobody has written yet,
//     so a binding on one names where that code will live: ahead of the code,
//     not behind it. The check starts applying the moment adoption makes the
//     variant current, which is when the variant starts claiming the code is
//     there;
//   - nothing about a historical variant. A binding that named a file which
//     existed then is a correct record; flagging it would push somebody toward
//     rebinding history to today's files, and that would make the record lie.

import fs from "node:fs";
import path from "node:path";
import { isPathWithin } from "@/runtime/code-target/index";
import { checkoutFor } from "@/runtime/engine/repo-registry";
import type { CodeBinding } from "@/shared/code-target/index";
import { currentVariant, type SemanticBoard } from "@/shared/semantic-board/index";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";

/** Where a repository identity lives on this machine, or nothing knowable. */
type CheckoutLookup = (repo: string) => string | undefined;

/**
 * One lookup per check run, so a vault of boards bound to one repository reads
 * the registry once rather than once per node.
 * @returns A memoized checkout lookup, including the misses.
 */
function createCheckoutLookup(): CheckoutLookup {
	const known = new Map<string, string | undefined>();
	return (repo: string) => {
		if (!known.has(repo)) known.set(repo, checkoutFor(repo));
		return known.get(repo);
	};
}

/**
 * Whether the binding's path is a file or directory inside its checkout.
 * @param root The checkout root on this machine.
 * @param bound The repository-relative path the binding names.
 * @returns True when something is there and it is inside the checkout.
 */
function insideCheckout(root: string, bound: string): boolean {
	const target = path.resolve(root, bound);
	return isPathWithin(root, target) && fs.existsSync(target);
}

/**
 * Everything wrong with one board's bindings, over the variant that says what
 * is built.
 * @param board The board as read.
 * @param file The file it was read from.
 * @param checkoutOf Where each repository lives on this machine.
 * @returns One diagnostic per node whose bound path is not in its repository.
 */
function semanticBindingDiagnostics(
	board: SemanticBoard,
	file: string,
	checkoutOf: CheckoutLookup,
): VaultDiagnostic[] {
	const variant = currentVariant(board);
	return (variant?.content.nodes ?? []).flatMap((node) => {
		const binding = node.binding;
		if (variant === undefined || binding === undefined) return [];
		const root = checkoutOf(binding.repo);
		if (root === undefined || insideCheckout(root, binding.path)) return [];
		return [
			missingPath(node.name, binding, root, {
				file,
				board: board.name,
				variant: variant.id,
				path: `variants.${variant.id}.content.nodes.${node.id}.binding`,
			}),
		];
	});
}

/** Where one binding is, in the words every vault diagnostic uses. */
type DiagnosticSite = Pick<VaultDiagnostic, "file" | "board" | "variant" | "path">;

/**
 * The warning for a node bound to a path that is not in its repository.
 * @param name What the node is called.
 * @param binding The binding it carries.
 * @param root The checkout the path was looked for in.
 * @param where The diagnostic site.
 * @returns The diagnostic.
 */
function missingPath(
	name: string,
	binding: CodeBinding,
	root: string,
	where: DiagnosticSite,
): VaultDiagnostic {
	return {
		...where,
		severity: "warning",
		code: "BINDING_PATH_MISSING",
		message:
			`Node ${JSON.stringify(name)} is bound to ${JSON.stringify(binding.path)} in ` +
			`${JSON.stringify(binding.repo)}, and there is no such file or directory in the checkout ` +
			`at ${JSON.stringify(root)}. A binding is what "open the code" resolves, so this node ` +
			"opens nothing. Bind it to where that code lives now; remove the binding if this part no " +
			"longer stands for code in that repository; or, if the code has not been written yet, " +
			"this part is a proposal and belongs on a draft rather than on the variant that says " +
			"what is built.",
	};
}

export { type CheckoutLookup, createCheckoutLookup, semanticBindingDiagnostics };
