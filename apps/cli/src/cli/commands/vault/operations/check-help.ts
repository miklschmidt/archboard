// What the help of the check commands says, kept out of the command contracts
// in vault.ts because it is long: each check's findings, one list item each.

/** The description of `check code`. */
const CHECK_CODE_HELP = [
	"Compares canonical modules and relationships with their bound source and evidence anchors. It reads current architecture, the state named by --state, or proposals selected by --every-draft. Source comes from the vault's checkout or another repository's chosen checkout. Git-ignored files are excluded.",
	"",
	"Warnings:",
	"- ANCHOR_PATH_MISSING, ANCHOR_SYMBOL_MISSING: an anchor whose file is not in its checkout, or does not hold its symbol.",
	"- BINDING_PATH_MISSING, BINDING_SYMBOL_MISSING: a bound path that is not in its checkout, or a bound symbol that the bound file or directory does not define.",
	"- ANCHOR_MISMATCH: an anchor whose symbol is outside the bound code of both ends, or that the file uses only as evidence that the relationship's kind does not accept.",
	"- RELATIONSHIP_UNDRAWN: a bound part whose code other bound parts call or construct, with no relationship between them. Evidence that only matches by name makes it information, and so does a relationship between the two sides where they meet: the children of their nearest holder.",
	"- ENTRY_POINT_UNEXPOSED: in a container bound to a module, an entry point that owns nothing the module exposes, while a caller drawn to it reaches it from outside the module.",
	"- CALLER_UNDRAWN: a hidden part whose exposed code a file outside the module runs, and no part binds that file.",
	"- DOCUMENT_PATH_MISSING: a document reference whose file is not at the branch or commit that the reference names (ADR 0054).",
	"- INHERITED_PART_DROPPED: a proposal removes a bound part from its predecessor, while that source path or symbol still exists. The dropped field identifies the predecessor and source evidence.",
	"",
	"Information, which never changes the exit status:",
	"- RELATIONSHIP_BACKWARDS: a relationship with no anchor whose evidence runs only the other way.",
	"- RELATIONSHIP_UNSUPPORTED: a relationship with no anchor whose evidence does not join its ends. Its missing field names the side with no evidence, code or infrastructure. The evidence list of each relationship kind in the vault configuration says what it accepts.",
	"- EXPOSED_UNUSED: the names that a module exposes and no file outside it uses.",
	"- VARIABLE_PASSED_THROUGH: a Terraform or OpenTofu module that passes a variable unchanged to one argument of a resource.",
	"- MODULE_SHALLOW: a Terraform or OpenTofu module that wraps one resource and passes every variable through.",
	"",
	"What it reads:",
	"- The languages and formats it knows by their syntax, such as TypeScript, Python, C#, Swift, Rust, Go, docker-compose files and Terraform, and every other file as text.",
	"- The language server that `repo language-server` configures for a checkout and a language. It runs that repository's code, as an editor does.",
	"- Across a network hop: an environment value that bound code reads, joined with the compose service, Kubernetes workload or Terraform resource that runs that code and sets the value to another part's address. This is configured-path evidence. A compose service runs the directory it builds, and each of them runs the code drawn inside the part bound to it. Where the infrastructure leaves a choice, the evidence is a candidate.",
	"- A Terraform or OpenTofu root module and the local modules it calls. A part bound to a root module names an address there as its symbol, such as `module.queue.aws_sqs_queue.this`. The check never reads state, a variable file or `.terraform`, and never runs terraform or tofu. A reference that joins two such parts is configured-path evidence. --plan names a plan for the addresses inside remote modules.",
	"- A module's interface: a directory, or the index.ts or __init__.py that stands for it. A Terraform or OpenTofu module exposes its variables and outputs.",
	"- A binding that names a branch or commit that its checkout does not have checked out: it is read at that ref from Git, without a checkout.",
	"",
	"What it skips, each named in skipped with the reason:",
	"- symbol-unparsed: a symbol found only in code that did not parse.",
	"- language-server-missing: a checkout and language with no configured language server, named once.",
	"- language-server-unready: a project that its server cannot answer about, such as a Swift directory with no Package.swift, a C# checkout with no solution or project file, a C, C++ or Objective-C file with no compile_commands.json, a Rust file that no Cargo.toml holds, or a Go file that no go.mod holds.",
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
	"- Source bindings with explicit refs read Git objects without changing the checkout. Unpinned bindings read the selected checkout's files. Unavailable source stays explicit.",
	"",
	"Exit 1 means the code check has a warning. No architecture input changes.",
].join("\n");

/** The description of `check semantics`. */
const CHECK_SEMANTICS_HELP = [
	"Reports invalid configuration, incoherent model content, and removed vocabulary references. It changes no authored input.",
	"",
	"Warnings on current architecture, which refuse no write. A shape is a signal, so read the source before you act on one:",
	"- CONTAINER_PASS_THROUGH: in a model that binds code, a module with parts and no binding, which no relationship or flow names, and whose parts no relationship or flow joins.",
	"- CONTAINER_UNBOUND: in a model that binds code, a module with bound parts and no binding, so the code of its folder that no part binds belongs to no module. suggestedBinding names the one directory that holds every part and no other module's code, when one does.",
	"- CONTAINER_PARTS_OUTSIDE: a bound module with a part bound outside its binding. suggestedBinding names the directory that holds them all, when one does. Without one, the parts are spread: move a part that does another module's job, or tell the user that the code layout splits one job over several folders.",
	"- ROOT_UNCONNECTED: in a model with several roots, a root with no relationship to another root. A relationship of a part inside it counts.",
	"- BINDING_SHARED: a module bound to the same repository, path and symbol as an earlier module. Read the code: if it does one job, keep the module that sits where the code sits and merge the other into it.",
	"- RELATIONSHIP_REPEATED: a relationship with the same source, target and anchor as an earlier one. Keep the one whose kind and label say what the anchored code does, and remove the other.",
	"- CONTAINER_LINE_TO_OWN_PART: a relationship between a module and a part that it holds, at any depth. The nesting already shows it, so a reading that opens the module draws no line for it, and the panel still lists it. Start or end it at the part that makes or answers the call.",
	"",
	"Errors on current architecture. A reader can still read it:",
	"- FLOW_SUMMARY_MISSING: a flow with no summary. A write that touches the flow refuses. Read its code, then set the summary through `model edit` with an edit-flow change.",
	"- RELATIONSHIP_ON_CONTAINER: a relationship with an end on a module with parts, and neither end holds the other. A module cannot point at anything, so end it on the part that owns the code. If no part owns it, add one for what the module does at this seam.",
	"",
	"Exit 1 means that a diagnostic or warning remains.",
].join("\n");

/** The description of `check all`, which `check` runs. */
const CHECK_ALL_HELP = [
	"Runs the semantics check, the code check and the embeds check, in that order, and answers with one part for each (ADR 0057). --state, --every-draft and --plan say what the code check reads, as `check code` describes. --fix draws outdated embeds again, as `check embeds` describes, and the other checks still run and report.",
	"",
	"In a Git checkout without a vault, only the embeds check runs. The result identifies skipped semantic and code checks, names no vault, and uses the embed result for its exit status.",
	"",
	"Exit 1 means a semantic diagnostic or a warning remains in any check. Information never changes the exit status. No architecture input changes.",
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
	"",
	"Warnings:",
	"- EMBED_OUTDATED: the model says something new since the picture was drawn. Draw it again with --fix, then commit it.",
	"- EMBED_SOURCE_MISSING: the model, the state or the view that the recipe names is gone, or what it names draws nothing now. Draw the picture from a reading that exists, or remove it.",
	"- EMBED_VAULT_FETCH_FAILED: no checkout on this machine holds the vault that the recipe names, fetching it failed and no copy is cached, so the picture was not checked. Register a checkout of that repository with `repo add`.",
	"- EMBED_RECIPE_UNREADABLE: the file carries a recipe that cannot be read, so nothing can draw it again. Draw the picture again from the model, or remove it.",
	"",
	"Information, which never changes the exit status:",
	"- EMBED_RENDERER_CHANGED: only the picture differs, because the renderer draws the same model differently. The model says nothing new.",
	"- EMBED_VAULT_UNAVAILABLE: the vault that the recipe names cannot be read, so the picture was not checked: it is in no repository, its checkout holds none, its identity names no remote, the commit fetched or cached holds none, or the server refuses it.",
	"- EMBED_VAULT_CACHED: fetching the vault failed, and the check read the newest cached copy, which can be behind the default branch. Every finding against it is information, and --fix draws nothing from it.",
	"",
	"A finding about a file of another repository is information, whatever its code: that repository draws the file again only after the vault's change merges.",
].join("\n");
/** The description of explicit artifact repair. */
const FIX_HELP =
	"Redraw changed local SVG and PNG artifacts from their exact canonical recipes. Refresh metadata when the picture stays current. Preserve cached sources and original legacy artifacts. Report every completed repair.";
export { CHECK_ALL_HELP, CHECK_CODE_HELP, CHECK_EMBEDS_HELP, CHECK_SEMANTICS_HELP, FIX_HELP };
