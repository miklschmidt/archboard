// What the code check did not read, with the reason (ADR 0046): the skips of
// its answer, `archboard check code` and `GET /api/vault/code-check`
// (code-check.ts).

import { vaultDiagnosticSchema } from "@archboard/model/policy";
import { z } from "zod";

/** A pinned binding's ref, and what its checkout has out instead. */
const OtherRefSchema = z.object({ named: z.string(), checkedOut: z.string() }).strict();

/**
 * Something the code pass did not read, with the reason (ADR 0046). A skipped
 * subject gets no finding and changes no exit status, and it is listed so it
 * never looks like a subject with nothing to report.
 *
 * - `no-current-variant`: a document with nothing built and no draft of the
 *   named variant (ADR 0031). `model-unreadable`: its file is not a document.
 * - `repository-unregistered`: a part, relationship or step whose binding or
 *   anchor names a repository this machine has not registered. It stays
 *   silent, and is listed. Also a draft, with no subject, whose dropped parts
 *   are bound into such a repository (TASK-488), and a document reference into
 *   one, with no subject and the reference's path as `detail` (TASK-498).
 * - `ref-not-checked-out`: a binding pinned to a branch or a commit that its
 *   checkout cannot resolve, so there is no code to read (TASK-493). Its `ref`
 *   names the ref and what the checkout has out. A ref it can resolve but has
 *   not out is read from Git without a checkout; a relationship or step with
 *   an unresolvable part at an end is skipped with its anchor. A document
 *   reference pinned so is skipped with no subject and its path as `detail`.
 * - `ref-without-language-server`: a ref read from Git, in which a use that no
 *   import resolves was not asked of a language server, because servers read
 *   the files on disk (TASK-493). Said once for the repository and ref, with
 *   its `repo` and `ref` and no subject; the use stays as code facts read it.
 * - `refs-differ`: a relationship whose ends are bound in one repository and
 *   read at different code, two refs or a ref and the checkout's files, so no
 *   one code holds both ends. Its `detail` names the ref of each.
 * - `path-ignored`: a bound or anchored path that Git ignores.
 * - `path-never-read`: Terraform state, a variable file or the `.terraform`
 *   directory, which can hold secrets in plain text.
 * - `checkout-unavailable`: a registered checkout that is gone, is no longer
 *   a Git checkout, or no longer identifies as its repository.
 * - `symbol-unparsed`: a bound or anchored symbol the check found only inside
 *   a part of a file that did not parse (ADR 0046). Its `detail` names the
 *   file and the lines.
 * - `logic-unparsed`: a module whose code holds a part that did not parse,
 *   where the logic the check counted would make it shallow on Ousterhout's
 *   measure, so it withholds that `MODULE_SHALLOW`: the code that did not
 *   parse could make it deep (TASK-651). Its subject is the part bound to the
 *   module, and its `detail` names each file and the lines that did not parse.
 * - `expression-not-followed`: a bound or anchored symbol that may lie below a
 *   Nix expression the static reading of a flake cannot follow, such as an
 *   `import` or a list of systems that an input gives (TASK-367.21), or in a
 *   Helm template, whose names only Helm gives when it renders it
 *   (TASK-367.19). Also a relationship with no anchor that no evidence its
 *   kind accepts supports, whose kind accepts a build dependency, whose start
 *   holds a Nix expression the reading cannot follow, such as a package that
 *   `callPackage` builds from another file, and whose end holds an output of
 *   the same flake: what the start is built from is unknown (TASK-367.22).
 *   Its `detail` names the file and the lines of the expression or the
 *   template, after the part that holds the expression for a relationship.
 * - `text-only`: the check read files of a checkout that no grammar reads as
 *   text, so it judged their anchors and bound symbols by name and nothing
 *   that needs references. Its `detail` names the kinds of file.
 * - `ends-overlap`: a relationship with no anchor whose ends hold one another
 *   or bind the same code. Evidence never joins such parts, so the check
 *   cannot tell whether the code supports it (TASK-367.07).
 * - `exposure-unknown`: a container bound to a module whose root files no
 *   language the check reads has, or whose `package.json` `exports` names no
 *   file of the checkout, so its interface is not held to what the module
 *   exposes (TASK-368.10). Its `detail` names the module.
 * - `binding-not-a-module`: a part bound to a file that stands for no folder,
 *   as an entry file such as `index.ts` does, or to a symbol, that no module
 *   the check measures on its document holds (TASK-646). A part that such a
 *   module holds is judged through it and is not skipped. Its `detail` names
 *   the binding.
 * - `module-not-read`: a binding's address inside a Terraform or OpenTofu
 *   module the check does not read: a remote module, which the check never
 *   fetches, with no plan JSON named for its root module (TASK-367.17). Its
 *   `detail` names the module call.
 * - `language-server-missing`: a language that has no server in a checkout.
 *   TypeScript has a default server, and a configured one wins; a release has no
 *   TypeScript of its own, so a checkout without a native `tsc` of version 7 or later
 *   says this too. Python, C, C++, Objective-C, C#, Swift, Rust and Go have no default server: an agent
 *   that works in the repository configures one for its checkout (`archboard
 *   repo language-server`), so the check runs no code of a checkout that
 *   nobody agreed to run. Also a configured command that is not installed.
 *   Said once for the checkout and the language, with its `repo` and no
 *   subject; its uses stay as code facts read them, candidates or no evidence
 *   (TASK-367.13, TASK-433). Its `detail` names the language, why, and the
 *   command that configures one.
 * - `language-server-unready`: a project the language server cannot answer
 *   about yet, such as a Swift package that no build has indexed, which the
 *   check never builds (TASK-367.16), a C# checkout with no solution or
 *   project file for csharp-ls to load, or a C, C++ or Objective-C file with
 *   no `compile_commands.json` in its checkout, or one that lists no command,
 *   without which clangd only guesses its flags (TASK-367.15), or a Rust file
 *   that no `Cargo.toml` holds (TASK-540), or a Go file that no `go.mod` holds
 *   (TASK-575). Said once for
 *   the project, with its checkout's `repo`; its uses stay as code facts read
 *   them. Its `detail` names the language, the project and why.
 * - `language-server-failed`: a language server that did not start, did not
 *   answer in time or ended in one checkout. Said once for the checkout and
 *   the language; its uses there stay as code facts read them. Its `detail`
 *   names the language, the program and what it did.
 * - `draft-ref-missing`: a draft whose dropped parts are held to the ref its
 *   bindings name in a repository, and whose checkout has no such branch, tag
 *   or commit (TASK-488). Its `detail` is the ref.
 * - `draft-refs-ambiguous`: a draft whose bindings name several refs of one
 *   repository, none of them new on the draft, so the check cannot tell which
 *   code it describes. Its `detail` names the refs.
 *
 * A reason that holds for a whole checkout names its `repo` and no subject,
 * which is how the check says a thing once.
 *
 * A skip that names a subject carries the canonical `model` and `state` of its
 * reading, as a finding does (TASK-646.07). One that names no subject keeps
 * the document's name in `model` and its `variant`.
 */
const CodeCheckSkipSchema = z
	.object({
		reason: z.enum([
			"no-current-variant",
			"model-unreadable",
			"unbound",
			"repository-unregistered",
			"ref-not-checked-out",
			"ref-without-language-server",
			"refs-differ",
			"path-ignored",
			"path-never-read",
			"checkout-unavailable",
			"symbol-unparsed",
			"logic-unparsed",
			"expression-not-followed",
			"text-only",
			"ends-overlap",
			"language-server-missing",
			"language-server-unready",
			"language-server-failed",
			"exposure-unknown",
			"binding-not-a-module",
			"module-not-read",
			"draft-ref-missing",
			"draft-refs-ambiguous",
		]),
		model: z.string().optional(),
		state: z.string().nullable().optional(),
		variant: z.string().optional(),
		subject: vaultDiagnosticSchema().shape.subject.unwrap().optional(),
		repo: z.string().optional(),
		ref: OtherRefSchema.optional(),
		detail: z.string().optional(),
	})
	.strict();

type CodeCheckSkip = z.infer<typeof CodeCheckSkipSchema>;

export { CodeCheckSkipSchema, type CodeCheckSkip, OtherRefSchema };
