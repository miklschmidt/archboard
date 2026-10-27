// What the help of the check commands says, kept out of the command contracts
// in vault.ts because it is long: each check's findings, one list item each.

/** The description of `check code`. */
const CHECK_CODE_HELP = [
	"Compares the boards with the code that their bindings and anchors name. It reads the current variant of every board, or the drafts that --state or --every-draft name. It reads the checkout that holds the vault for its own repository, and the chosen checkout of every other repository, and only files that Git does not ignore.",
	"",
	"Warnings:",
	"- ANCHOR_PATH_MISSING, ANCHOR_SYMBOL_MISSING: an anchor whose file is not in its checkout, or does not hold its symbol.",
	"- BINDING_PATH_MISSING, BINDING_SYMBOL_MISSING: a bound path that is not in its checkout, or a bound symbol that the bound file or directory does not define.",
	"- ANCHOR_MISMATCH: an anchor whose symbol is outside the bound code of both ends, or that the file uses only as evidence that the relationship's kind does not accept.",
	"- RELATIONSHIP_UNDRAWN: a bound part whose code other bound parts call or construct, with no relationship between them. Evidence that only matches by name makes it information.",
	"- ENTRY_POINT_UNEXPOSED: in a container bound to a module, an entry point that owns nothing the module exposes, while a caller drawn to it reaches it from outside the module.",
	"- CALLER_UNDRAWN: a hidden part whose exposed code a file outside the module runs, and no part binds that file.",
	"- DOCUMENT_PATH_MISSING: a document reference whose file is not at the branch or commit that the reference names (ADR 0054).",
	"- INHERITED_PART_DROPPED: a draft that lacks a bound part of the variant it was branched from, while the code still holds that part's path and symbol. Its dropped field names the earlier variant, the ref, the commit and where the code holds it.",
	"",
	"Information, which never changes the exit status:",
	"- RELATIONSHIP_BACKWARDS: a relationship with no anchor whose evidence runs only the other way.",
	"- RELATIONSHIP_UNSUPPORTED: a relationship with no anchor whose evidence does not join its ends. Its missing field names the side with no evidence, code or infrastructure. The evidence list of each relationship kind in the vault configuration says what it accepts.",
	"- EXPOSED_UNUSED: the names that a module exposes and no file outside it uses.",
	"- VARIABLE_PASSED_THROUGH: a Terraform or OpenTofu module that passes a variable unchanged to one argument of a resource.",
	"- MODULE_SHALLOW: a Terraform or OpenTofu module that wraps one resource and passes every variable through.",
	"",
	"What it reads:",
	"- The languages and formats it knows by their syntax, such as TypeScript, Python, C#, Swift, docker-compose files and Terraform, and every other file as text.",
	"- The language server that `repo language-server` configures for a checkout and a language. It runs that repository's code, as an editor does.",
	"- Across a network hop: an environment value that bound code reads, joined with the compose service, Kubernetes workload or Terraform resource that runs that code and sets the value to another part's address. This is configured-path evidence. A compose service runs the directory it builds, and each of them runs the code drawn inside the part bound to it. Where the infrastructure leaves a choice, the evidence is a candidate.",
	"- A Terraform or OpenTofu root module and the local modules it calls. A part bound to a root module names an address there as its symbol, such as `module.queue.aws_sqs_queue.this`. The check never reads state, a variable file or `.terraform`, and never runs terraform or tofu. A reference that joins two such parts is configured-path evidence. --plan names a plan for the addresses inside remote modules.",
	"- A module's interface: a directory, or the index.ts or __init__.py that stands for it. A Terraform or OpenTofu module exposes its variables and outputs.",
	"- A binding that names a branch or commit that its checkout does not have checked out: it is read at that ref from Git, without a checkout.",
	"",
	"What it skips, each named in skipped with the reason:",
	"- symbol-unparsed: a symbol found only in code that did not parse.",
	"- language-server-missing: a checkout and language with no configured language server, named once.",
	"- language-server-unready: a project that its server cannot answer about, such as a Swift directory with no Package.swift, a C# checkout with no solution or project file, or a C, C++ or Objective-C file with no compile_commands.json.",
	"- language-server-failed: a checkout where its server did not answer.",
	"- exposure-unknown: a module whose root files it cannot read.",
	"- module-not-read: an address inside a remote module, unless --plan names a plan for that root.",
	"- ref-without-language-server: code read at a ref. A language server reads the files on disk, so a use that no import resolves there stays as the code facts read it.",
	"- refs-differ: a relationship whose ends are read at different refs.",
	"- ref-not-checked-out: a ref that the checkout cannot resolve. It names the ref.",
	"- draft-ref-missing, draft-refs-ambiguous: a draft whose ref the checkout does not have, or whose bindings name several refs.",
	"",
	"Drafts:",
	"- --state reads one exact canonical state by identity or unique name. It also warns about a bound path that the draft names and its checkout does not hold.",
	"- --every-draft reads each independent canonical proposal by identity.",
	"- A draft is read at the ref that its bindings name and no earlier variant names, else at the one ref that they name. It is read from Git, without a checkout, or from the checkout's files when the bindings name no ref. A part that pins a ref that the draft's ref does not hold is read at its own ref.",
	"",
	"Exit 1 means the code check has a warning. No board is changed.",
].join("\n");

/** The description of `check all`, which `check` runs. */
const CHECK_ALL_HELP = [
	"Runs the semantics check, the code check and the embeds check, in that order, and answers with one part for each (ADR 0057). --state, --every-draft and --plan say what the code check reads, as `check code` describes. --fix draws outdated embeds again, as `check embeds` describes, and the other checks still run and report.",
	"",
	"In a Git checkout without a vault, such as a documentation repository that embeds the boards of another repository's vault, only the embeds check runs. The answer's skipped names the semantics and code checks and why, the answer names no vault, and the exit status comes from the embeds check alone.",
	"",
	"Exit 1 means the semantics check has a diagnostic or a warning, or the code check or the embeds check has a warning. Information never changes the exit status. No board is changed.",
].join("\n");

/** What the embeds check reads and reports. */
const CHECK_EMBEDS_HELP = [
	"Find Git-tracked SVG and PNG artifacts that carry reproducible canonical recipes.",
	"Resolve each recipe's repository to the addressed or chosen local checkout, or the existing fetched-vault cache.",
	"Render its exact model identity and reading selectors through the existing renderer. Compare input and picture digests.",
	"A changed source picture is EMBED_OUTDATED. A renderer-only picture change is information. An unchanged picture needs no redraw.",
	"Use --fix to replace changed local artifacts. A PNG keeps its original scale and region and uses the existing local rasterizer.",
	"Cached sources remain read-only. Legacy recipes require explicit migration and a new canonical export. The original bytes remain unchanged.",
	"The result lists every inspected artifact, source vault, finding, and completed repair. An interrupted repair reports every file already rewritten.",
	"A recipe never substitutes another model by name. The check writes no architecture content.",
	"Exit 1 means a warning remains. Information never changes the exit status.",
].join("\n");
/** The description of explicit artifact repair. */
const FIX_HELP =
	"Redraw changed local SVG and PNG artifacts from their exact canonical recipes. Refresh metadata when the picture stays current. Preserve cached sources and original legacy artifacts. Report every completed repair.";
export { CHECK_ALL_HELP, CHECK_CODE_HELP, CHECK_EMBEDS_HELP, FIX_HELP };
