import { git } from "@archboard/process/git";
import { ArchiveError, type archiveContext } from "#runtime/store/model-archive-location.ts";

const TREE_BRANCH = "refs/archboard/tree";

type ArchiveLocation = Awaited<ReturnType<typeof archiveContext>>;
type ArchiveContext = ArchiveLocation & {
	reader?: ReturnType<typeof archiveReader>;
	ancestor?: (ancestor: string, descendant: string) => boolean | undefined;
};

/**
 * Match a discovered identity or let Git resolve an immutable record selector.
 * @param object The requested blob or commit path.
 * @param identity The resolved blob identity.
 * @returns Whether the response names the requested object.
 */
function matchesBlob(object: string, identity: string) {
	return object.endsWith(":record.json") || identity === object;
}

/**
 * Decode one length-delimited Git blob without interpreting content as protocol lines.
 * @param output The complete batch response.
 * @param offset The next response header position.
 * @param object The requested immutable blob identity.
 * @returns Its exact bytes and the following response position.
 */
function batchBlob(output: Buffer, offset: number, object: string) {
	const end = output.indexOf(10, offset);
	if (end < 0)
		throw new ArchiveError("CHECKPOINT_INVALID", "A retained blob response is incomplete.", object);
	const header = /^([a-f0-9]+) blob ([0-9]+)$/u.exec(output.subarray(offset, end).toString());
	if (header === null)
		throw new ArchiveError(
			"ARCHITECTURE_UNAVAILABLE",
			"A required retained blob is unavailable.",
			object,
		);
	const size = Number(header[2]);
	const start = end + 1,
		next = start + size;
	if (!Number.isSafeInteger(size) || output[next] !== 10 || !matchesBlob(object, header[1]!))
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"Retained blob framing disagrees with its immutable identity or length.",
			object,
		);
	return { bytes: output.subarray(start, next), next: next + 1 };
}

/**
 * Read the already-discovered immutable blobs through one existing Git process.
 * @param context The addressed archive context.
 * @param objects The immutable input blob identities in authored path order.
 * @returns Every exact blob in that same order.
 */
async function checkpointBlobs(context: ArchiveContext, objects: string[]) {
	if (context.reader !== undefined) return context.reader.blobs(objects);
	if (objects.length === 0) return [];
	const output = Buffer.from(
		(await git(context.root, ["cat-file", "--batch"], {
			input: Buffer.from(objects.join("\n") + "\n"),
			trimOutput: false,
			maxOutputBytes: Infinity,
		})) ?? "",
	);
	let offset = 0;
	return objects.map((object) => {
		const retained = batchBlob(output, offset, object);
		offset = retained.next;
		return retained.bytes;
	});
}

/**
 * Share immutable reads within one inspection and bound supervised Git work.
 * @param context The operation's archive location without a reader.
 * @returns Its disposable blob and tree readers.
 */
function archiveReader(context: ArchiveLocation) {
	const location = { root: context.root, vault: context.vault, sourceRoot: context.sourceRoot };
	const retainedBlobs = new Map<string, Promise<Buffer>>();
	const trees = new Map<string, Promise<string | undefined>>();
	const treeIds = new Map<string, string>();
	let pending: Promise<unknown> = Promise.resolve();
	/**
	 * Finish each read before starting another supervised command.
	 * @param read The next immutable read.
	 * @returns Its complete result.
	 */
	function command<T>(read: () => Promise<T>): Promise<T> {
		const result = pending.then(read);
		pending = result.catch(() => undefined);
		return result;
	}
	return {
		treeIds,
		/**
		 * Read each immutable object once, including shared pending reads.
		 * @param objects Exact blob identities or immutable commit path selectors.
		 * @returns The requested exact bytes in input order.
		 */
		blobs(objects: string[]) {
			const missing = [...new Set(objects.filter((object) => !retainedBlobs.has(object)))];
			if (missing.length !== 0) {
				const batch = command(() => checkpointBlobs(location, missing));
				missing.forEach((object, index) =>
					retainedBlobs.set(
						object,
						batch.then((values) => values[index]!),
					),
				);
			}
			return Promise.all(objects.map((object) => retainedBlobs.get(object)!));
		},
		/**
		 * Reuse one complete tree listing for validation and input discovery.
		 * @param id The immutable commit identity.
		 * @returns Its complete NUL-delimited recursive listing.
		 */
		listing(id: string) {
			const rootTree = treeIds.get(id) ?? id;
			let listing = trees.get(rootTree);
			if (listing === undefined) {
				listing = command(() =>
					git(location.root, ["ls-tree", "-r", "-z", rootTree], {
						trimOutput: false,
						maxOutputBytes: Infinity,
					}),
				);
				trees.set(rootTree, listing);
			}
			return listing;
		},
	};
}

/**
 * Quote a path for a fast-import file command.
 * @param path The exact relative path.
 * @returns Its C-style quoted form.
 */
function quotedPath(path: string): string {
	return `"${path.replaceAll(/["\\]/gu, "\\$&").replaceAll("\n", "\\n")}"`;
}

/**
 * Store every blob and tree through one supervised Git process, without refs or an index.
 * The commit that carries the tree stays unreachable, and resetting its branch writes no ref.
 * @param context The caller's checkout.
 * @param inputs Exact relative paths and authored bytes.
 * @returns The tree identity.
 */
async function tree(context: ArchiveContext, inputs: Map<string, Buffer>): Promise<string> {
	const files = [...inputs];
	const blobs = files.flatMap(([, bytes], index) => [
		Buffer.from(`blob\nmark :${index + 1}\ndata ${bytes.length}\n`),
		bytes,
		Buffer.from("\n"),
	]);
	const carrier = files.length + 1;
	const paths = files.map(([path], index) => `M 100644 :${index + 1} ${quotedPath(path)}\n`);
	const commit = [
		`commit ${TREE_BRANCH}\nmark :${carrier}\n`,
		"committer archboard <archboard> 0 +0000\ndata 0\n\n",
		...paths,
		`\nls :${carrier} ""\nreset ${TREE_BRANCH}\ndone\n`,
	].join("");
	const output = await git(context.root, ["fast-import", "--quiet", "--done"], {
		input: Buffer.concat([...blobs, Buffer.from(commit)]),
	});
	const id = /^040000 tree ([a-f0-9]+)/u.exec(output ?? "")?.[1];
	if (id === undefined) throw new Error("Git returned no tree identity.");
	return id;
}

export { archiveReader, checkpointBlobs, tree, type ArchiveContext };
