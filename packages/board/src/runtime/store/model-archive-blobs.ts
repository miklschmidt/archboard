import { git } from "@archboard/process/git";
import { ArchiveError, type archiveContext } from "#runtime/store/model-archive-location.ts";

type ArchiveContext = Awaited<ReturnType<typeof archiveContext>>;

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
	if (!Number.isSafeInteger(size) || output[next] !== 10 || header[1] !== object)
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

export { checkpointBlobs };
