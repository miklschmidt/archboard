// The parts a draft dropped while their code still exists (TASK-488).
//
// A proposal holds the whole architecture at its point (TASK-487). A draft
// that lacks a bound part the variant before it holds, while the code the
// draft describes still holds that part's path and, when the binding names
// one, its symbol, most likely dropped it by mistake: the code says the part
// is still there. Each such part is the warning `INHERITED_PART_DROPPED`,
// with where the code holds it. A part whose bound code is gone there is a
// part the change removed, and gets nothing.
//
// The code a draft describes, for each repository, is the ref its bindings
// name (`binding.branch`, or `binding.commit`): the one that no variant
// before it names, which in a stack of pull requests is the draft's own
// branch, else the one ref they all name. That ref is read from Git without
// checking it out. A draft that names no ref of a repository is held to the
// files of its checkout, as the rest of the check is. A ref the checkout
// lacks, or several refs with none new on the draft, is a skip that names the
// draft, never a finding.

import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import { normalized, type Checkout, type ReadCheckout } from "@/runtime/code-check/lib/checkouts";
import { heldInFiles } from "@/runtime/code-check/lib/symbols";
import { neverRead, terraformRootOf, type FactsPass } from "@/runtime/code-facts/index";
import { sourceAt } from "@/runtime/history-lens/index";
import type { CodeCheckSkip, CodeFinding } from "@/shared/code-check/index";
import { bindingPathOf, filesOfBinding } from "@archboard/code-binding/binding-files";
import { type CodeBinding } from "@archboard/code-binding/code-binding";
import { draftRefs } from "@/shared/semantic-board/draft-ref";
import type { SemanticNode, SemanticVariant } from "@/shared/semantic-board/index";

/** What holding dropped parts to code needs from the pass. */
interface DroppedContext {
	readonly checkouts: ReadonlyMap<string, Checkout>;
	/** The pass's code facts of the files on disk. */
	readonly facts: FactsPass;
	readonly signal: AbortSignal;
}

/** A bound part, as the variant before a draft holds it. */
type BoundNode = SemanticNode & { readonly binding: CodeBinding };

/** A draft, the variant before it, and the bound parts of one repository it lacks. */
interface Drop {
	readonly read: BoardToCheck;
	readonly from: SemanticVariant;
	readonly repo: string;
	readonly nodes: readonly BoundNode[];
}

/** The code a draft is held to in one repository: a ref's tree, or the files on disk. */
interface Code {
	readonly checkout: ReadCheckout;
	readonly facts: FactsPass;
	/** The ref the draft's bindings name and the commit it resolved to; none for the files on disk. */
	readonly at?: { readonly ref: string; readonly commit: string };
}

/** Where the code holds a dropped part's symbol; nothing when the binding names none. */
interface Place {
	readonly file?: string;
	readonly line?: number;
}

/**
 * A file read as text is not noted here: the rest of the pass says that once
 * for each checkout, of the files on disk.
 */
function ignoreTextReading(): void {
	// Nothing to note.
}

/** What one draft's dropped parts gave. */
interface Judged {
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
}

/**
 * The variant a read draft was branched from, when it is a draft that has one.
 * @param read The board, at the variant the check reads.
 * @returns The variant before it, or undefined.
 */
function predecessorOf(read: BoardToCheck): SemanticVariant | undefined {
	if (read.variant.lifecycle !== "draft") return undefined;
	return read.board.variants.find((one) => one.id === read.variant.parent);
}

/**
 * The bound parts the variant before a read draft holds and the draft lacks,
 * by repository.
 * @param read The board, at the variant the check reads.
 * @returns One drop for each repository.
 */
function dropsOf(read: BoardToCheck): Drop[] {
	const from = predecessorOf(read);
	if (from === undefined) return [];
	const kept = new Set(read.variant.content.nodes.map((node) => node.id));
	const byRepo = new Map<string, BoundNode[]>();
	for (const node of from.content.nodes) {
		if (kept.has(node.id) || node.binding === undefined) continue;
		const { binding } = node;
		byRepo.set(binding.repo, [...(byRepo.get(binding.repo) ?? []), { ...node, binding }]);
	}
	return [...byRepo].map(([repo, nodes]) => ({ read, from, repo, nodes }));
}

/**
 * The bindings of every part a read draft dropped, so the pass captures their
 * checkouts.
 * @param reads The boards, each at the variant the check reads.
 * @returns Each binding.
 */
function droppedBindings(reads: readonly BoardToCheck[]): CodeBinding[] {
	return reads.flatMap(dropsOf).flatMap((drop) => drop.nodes.map((node) => node.binding));
}

/**
 * A skip that names a draft and a repository.
 * @param drop The draft and the repository.
 * @param reason Why its parts were not held to code.
 * @param detail What else the reason says.
 * @returns The skip.
 */
function draftSkip(drop: Drop, reason: CodeCheckSkip["reason"], detail?: string): CodeCheckSkip {
	const { board, variant } = drop.read;
	const said = detail === undefined ? {} : { detail };
	return { reason, board: board.name, variant: variant.id, repo: drop.repo, ...said };
}

/**
 * The code a draft is held to in one repository, or the skip that says why it
 * cannot be read. A checkout that is unavailable is said once for the whole
 * checkout, so a draft adds nothing.
 * @param drop The draft and the repository.
 * @param context The pass.
 * @returns The code, the skip, or undefined.
 */
async function codeOf(
	drop: Drop,
	context: DroppedContext,
): Promise<Code | CodeCheckSkip | undefined> {
	const checkout = context.checkouts.get(drop.repo);
	if (checkout?.status === "unregistered") return draftSkip(drop, "repository-unregistered");
	return checkout?.status === "read" ? codeAt(drop, checkout, context) : undefined;
}

/**
 * The code a draft's ref names in a checkout, read from Git, or the files on
 * disk when it names none, or the skip that says it names several or the
 * checkout has no such ref.
 * @param drop The draft and the repository.
 * @param checkout The repository's checkout.
 * @param context The pass.
 * @returns The code, or the skip.
 */
async function codeAt(
	drop: Drop,
	checkout: ReadCheckout,
	context: DroppedContext,
): Promise<Code | CodeCheckSkip> {
	const refs = draftRefs(drop.read.board, drop.read.variant, drop.repo);
	const [ref] = refs;
	if (ref === undefined) return { checkout, facts: context.facts };
	if (refs.length > 1) return draftSkip(drop, "draft-refs-ambiguous", refs.join(", "));
	const paths = drop.nodes.map((node) => boundPath(node.binding));
	const source = await sourceAt(checkout.root, ref, paths, { signal: context.signal });
	if (source === undefined) return draftSkip(drop, "draft-ref-missing", ref);
	const files = source.checkout.files;
	const tree: ReadCheckout = { status: "read", root: checkout.root, files };
	return { checkout: tree, facts: source.pass, at: { ref, commit: source.commit } };
}

/**
 * The path whose files a binding names, with `/` between names.
 * @param binding The binding.
 * @returns The path; the empty string is the whole checkout.
 */
function boundPath(binding: CodeBinding): string {
	return bindingPathOf(normalized(binding.path));
}

/**
 * Where the code holds a dropped part: the files of its bound path, and the
 * definition of its symbol when the binding names one.
 * @param node The part.
 * @param code The code the draft is held to.
 * @returns Where it is held, or undefined when the code no longer holds it.
 */
async function heldPart(node: BoundNode, code: Code): Promise<Place | undefined> {
	const bound = boundPath(node.binding);
	const files = filesOfBinding(bound, code.checkout.files).filter((file) => !neverRead(file));
	const { symbol } = node.binding;
	if (files.length === 0) return undefined;
	if (symbol === undefined) return {};
	const kind = code.checkout.files.has(bound) ? "file" : "directory";
	const root = terraformRootOf(bound, kind, code.checkout.files);
	const search = { facts: code.facts, checkout: code.checkout, readAsText: ignoreTextReading };
	const held = await heldInFiles(search, files, symbol, "definition", root);
	if (held.status !== "found") return undefined;
	return held.line === undefined ? { file: held.file } : { file: held.file, line: held.line };
}

/**
 * The warning for one part a draft dropped while the code still holds it.
 * @param drop The draft, the variant before it and the repository.
 * @param node The part.
 * @param code The code the draft is held to.
 * @param held Where the code holds it.
 * @returns The finding.
 */
function droppedFinding(drop: Drop, node: BoundNode, code: Code, held: Place): CodeFinding {
	const { read, from } = drop;
	const { path, symbol } = node.binding;
	const at =
		code.at === undefined ? "in the checkout's files" : `at ${JSON.stringify(code.at.ref)}`;
	const what =
		symbol === undefined
			? JSON.stringify(path)
			: `${JSON.stringify(symbol)} in ${JSON.stringify(path)}`;
	return {
		severity: "warning",
		code: "INHERITED_PART_DROPPED",
		file: read.file,
		board: read.board.name,
		variant: read.variant.id,
		path: `variants.${from.id}.content.nodes.${node.id}.binding`,
		subject: { kind: "node", id: node.id, name: node.name },
		message:
			`Draft ${JSON.stringify(read.variant.name)} lacks node ${JSON.stringify(node.name)}, which ` +
			`${JSON.stringify(from.name)} holds, and the code still holds its bound ${what} ${at}. A ` +
			`proposal holds the whole architecture: state "id": "${node.id}" to bring the part back, ` +
			"or remove its code if the change removes the part.",
		dropped: {
			from: from.id,
			repo: drop.repo,
			...code.at,
			path,
			...(symbol === undefined ? {} : { symbol }),
			...held,
		},
	};
}

/**
 * Hold the parts one draft dropped in one repository to the code it describes.
 * @param drop The draft, the variant before it and the repository.
 * @param context The pass.
 * @param judged What the pass found so far, which this adds to.
 */
async function judgeDrop(drop: Drop, context: DroppedContext, judged: Judged): Promise<void> {
	const code = await codeOf(drop, context);
	if (code === undefined) return;
	if ("reason" in code) {
		judged.skipped.push(code);
		return;
	}
	for (const node of drop.nodes) {
		// oxlint-disable-next-line no-await-in-loop -- one part at a time keeps the findings in board order, and a file one part reads is cached for the next
		const held = await heldPart(node, code);
		if (held !== undefined) judged.findings.push(droppedFinding(drop, node, code, held));
	}
}

/**
 * Hold every part a read draft dropped to the code the draft describes.
 * @param reads The boards, each at the variant the check reads.
 * @param context The pass.
 * @returns The findings, and the drafts whose code could not be read.
 */
async function judgeDroppedParts(
	reads: readonly BoardToCheck[],
	context: DroppedContext,
): Promise<Judged> {
	const judged: Judged = { findings: [], skipped: [] };
	for (const drop of reads.flatMap(dropsOf)) {
		// oxlint-disable-next-line no-await-in-loop -- one draft at a time keeps the findings in board order
		await judgeDrop(drop, context, judged);
	}
	return judged;
}

export { droppedBindings, judgeDroppedParts };
