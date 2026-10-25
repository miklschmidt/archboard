// What the help of the check commands says, kept out of the command contracts
// in vault.ts because it is long: each check's findings, one list item each.

/** The description of `check code`. */
const CHECK_CODE_HELP = [
	"Compares the boards with the code that their bindings and anchors name. It reads the current variant of every board, or the drafts that --variant or --every-draft name. It reads the checkout that holds the vault for its own repository, and the chosen checkout of every other repository, and only files that Git does not ignore.",
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
	"- Behind: how many commits changed a board's bound files since the board last changed.",
	"",
	"What it reads:",
	"- The languages and formats it knows by their syntax, such as TypeScript, Python, C#, Swift, Rust, docker-compose files and Terraform, and every other file as text.",
	"- The language server that `repo language-server` configures for a checkout and a language. It runs that repository's code, as an editor does.",
	"- Across a network hop: an environment value that bound code reads, joined with the compose service, Kubernetes workload or Terraform resource that runs that code and sets the value to another part's address. This is configured-path evidence. A compose service runs the directory it builds, and each of them runs the code drawn inside the part bound to it. Where the infrastructure leaves a choice, the evidence is a candidate.",
	"- A Terraform or OpenTofu root module and the local modules it calls. A part bound to a root module names an address there as its symbol, such as `module.queue.aws_sqs_queue.this`. The check never reads state, a variable file or `.terraform`, and never runs terraform or tofu. A reference that joins two such parts is configured-path evidence. --plan names a plan for the addresses inside remote modules.",
	"- A module's interface: a directory, or the index.ts or __init__.py that stands for it. A Terraform or OpenTofu module exposes its variables and outputs.",
	"- A binding that names a branch or commit that its checkout does not have checked out: it is read at that ref from Git, without a checkout.",
	"",
	"What it skips, each named in skipped with the reason:",
	"- symbol-unparsed: a symbol found only in code that did not parse.",
	"- language-server-missing: a checkout and language with no configured language server, named once.",
	"- language-server-unready: a project that its server cannot answer about, such as a Swift directory with no Package.swift, a C# checkout with no solution or project file, a C, C++ or Objective-C file with no compile_commands.json, or a Rust file that no Cargo.toml holds.",
	"- language-server-failed: a checkout where its server did not answer.",
	"- exposure-unknown: a module whose root files it cannot read.",
	"- module-not-read: an address inside a remote module, unless --plan names a plan for that root.",
	"- ref-without-language-server: code read at a ref. A language server reads the files on disk, so a use that no import resolves there stays as the code facts read it.",
	"- refs-differ: a relationship whose ends are read at different refs.",
	"- ref-not-checked-out: a ref that the checkout cannot resolve. It names the ref.",
	"- draft-ref-missing, draft-refs-ambiguous: a draft whose ref the checkout does not have, or whose bindings name several refs.",
	"",
	"Drafts:",
	"- --variant reads the named draft on every board that has one, and the current variant elsewhere. It also warns about a bound path that the draft names and its checkout does not hold.",
	"- --every-draft reads every draft of every board instead, each as a named draft.",
	"- A draft is read at the ref that its bindings name and no earlier variant names, else at the one ref that they name. It is read from Git, without a checkout, or from the checkout's files when the bindings name no ref. A part that pins a ref that the draft's ref does not hold is read at its own ref.",
	"",
	"Exit 1 means the code check has a warning. No board is changed.",
].join("\n");

/** The description of `check all`, which `check` runs. */
const CHECK_ALL_HELP = [
	"Runs the semantics check, the code check and the embeds check, in that order, and answers with one part for each (ADR 0057). --variant, --every-draft and --plan say what the code check reads, as `check code` describes. --fix draws outdated embeds again, as `check embeds` describes, and the other checks still run and report.",
	"",
	"In a Git checkout without a vault, such as a documentation repository that embeds the boards of another repository's vault, only the embeds check runs. The answer's skipped names the semantics and code checks and why, the answer names no vault, and the exit status comes from the embeds check alone.",
	"",
	"Exit 1 means the semantics check has a diagnostic or a warning, or the code check or the embeds check has a warning. Information never changes the exit status. No board is changed.",
].join("\n");

/** What the embeds check reads and reports. */
const EMBEDS_CHECK = [
	"The embeds check finds each embed: a file that Git tracks in the checkout that holds the vault, or in a Git checkout without a vault, such as a documentation repository, and that is an SVG document or a PNG with a render recipe. A file that Git ignores, a file without a recipe and an SVG inside an HTML, Markdown or MDX page are no embed.",
	"",
	"For each embed, it finds the vault that the recipe names by its repository identity: this checkout's own, or the chosen registered checkout of another repository, read as it is. A repository with no registered checkout is fetched (see Fetched vaults). It finds the board by id, so a renamed board is still found. It draws the recipe again through the server and compares the two. A PNG compares by its SVG's digest, without a browser.",
	"",
	"Findings:",
	"- EMBED_OUTDATED, warning: the fingerprint and the picture changed. The board changed what the picture shows.",
	"- EMBED_RENDERER_CHANGED, information: only the picture changed. The renderer draws it differently.",
	"- A changed fingerprint alone is no finding: the embed is current.",
	"- EMBED_SOURCE_MISSING, warning: the board, the variant or the view is gone, or the recipe now draws nothing. It names the commit that removed a board when the vault's history has it, and the board that holds its name now.",
	"- EMBED_RECIPE_UNREADABLE, warning: a recipe that cannot be read.",
	"- EMBED_VAULT_UNAVAILABLE, information: a vault in no repository, a registered checkout without a vault, an identity that names no remote, a fetched or cached commit without a vault, or a vault that the server refuses. The embed is not checked.",
	"- EMBED_VAULT_FETCH_FAILED, warning: a fetch failed, and no copy is cached. It names the repository.",
	"- EMBED_VAULT_CACHED, information: the fetch failed, and the newest cached commit was read.",
	"- EMBED_VAULT_MOVED: a tracked embed whose board this vault holds, while its recipe names another repository, as after a move. It is a warning in this checkout.",
	"- EMBED_TRACKED_UNREACHABLE, information: a tracked embed in a repository that no checkout on this machine holds.",
	"- EMBED_TRACKED_MISSING, information: a tracked embed that is gone, that Git does not track in the checkout it is read in, or that holds the recipe of another board.",
	"",
	"Tracked embeds (semantic render --track):",
	"- The check also reads each tracked embed that the vault's boards list. One of this repository is read among the checkout's embeds. One of another repository is read in the working tree of that repository's chosen registered checkout, by the same rules. The answer's tracked lists them all.",
	"- A finding about a file of another repository names it with embedRepo, and is information whatever its code. A warning would fail the vault's pull request until that repository draws the file again, and it can do that only after the merge.",
	"",
	"Fetched vaults:",
	"- A repository with no registered checkout has the .archboard/vault directory of its default branch fetched, shallow and sparse, from https://<identity>. The fetch uses your own Git credentials and url.insteadOf rules, and never prompts.",
	"- The copy is cached by commit in the state directory, and read again while the branch has not moved.",
	"- The answer's vaults lists each vault read with its source: checkout, fetched with its commit, or cache.",
	"- A cached copy can be behind the default branch, so every finding against it is information, and --fix writes no embed from it. notFixed names why.",
	"- A shallow fetch has no history, so a gone board of a fetched vault names no removing commit.",
].join("\n");

/** The description of `check embeds`: the check, and what --fix does. */
const CHECK_EMBEDS_HELP = [
	EMBEDS_CHECK,
	"",
	[
		"With --fix:",
		"- Each outdated embed of this checkout is drawn again, and its whole file is rewritten. A PNG is drawn through Chromium at its recipe's scale and region. Without Chromium, the PNG stays reported, with why it was not fixed.",
		"- An embed whose picture is current gets only its new recipe. So does a tracked embed whose recipe names the repository that its board moved from.",
		"- A recipe that asks for the current variant and the overview or Everything is pointed at the board that now holds its deleted board's name.",
		"- The answer's fixed lists each file it rewrote, and each re-pointing with the old and the new board.",
		"- A tracked embed of another repository is drawn again only in the chosen registered checkout of that repository. No other file outside this checkout is written. The findings name each tracked embed it could not reach.",
		"",
		"Exit 1 means a warning remains. Information never changes the exit status. No board is changed.",
	].join("\n"),
].join("\n");

/** The description of the --fix option, which `check`, `check all` and `check embeds` read. */
const FIX_HELP =
	"Draw each outdated embed of this checkout again from its own recipe, and rewrite its file, and each outdated tracked embed of another repository in the chosen registered checkout of that repository. Write only the new recipe of an embed whose picture is current or whose recipe names the repository its board moved from. Point a recipe that asks for the current variant and the overview or Everything at the board that now holds its deleted board's name. A PNG needs Chromium. The answer lists every file it rewrote";

export { CHECK_ALL_HELP, CHECK_CODE_HELP, CHECK_EMBEDS_HELP, FIX_HELP };
