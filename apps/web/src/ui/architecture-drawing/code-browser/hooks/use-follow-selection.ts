import { useEffect, useRef } from "react";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";

/** The bound path of the module the code view follows. */
interface FollowTarget {
	readonly path: string | null;
	readonly repo: string | null;
}

/** A binding that can still open a file when the listing arrives. */
interface PendingFollow extends FollowTarget {
	pending: "initial" | "pick" | null;
}

const NOTHING_FOLLOWED = { file: null, folder: null } as const;

/**
 * The module the code follows: the one picked module, or the open one while nothing is picked.
 * @param reader The reader.
 * @returns The module, or null.
 */
function followedModule(reader: Reader): string | null {
	const { ids } = reader.selection;
	if (ids.size === 0) return reader.structure.opened;
	const [id = null] = ids;
	return ids.size === 1 ? id : null;
}

/**
 * Read the binding the picture follows, even before its repository's files are listed.
 * @param reader The reader.
 * @returns The bound path and its repository.
 */
function followTarget(reader: Reader): FollowTarget {
	const id = followedModule(reader);
	const binding =
		id === null ? undefined : reader.model.modules.find((module) => module.id === id)?.binding;
	return binding === undefined
		? { path: null, repo: null }
		: { path: binding.path.replace(/\/+$/u, ""), repo: binding.repo };
}

/**
 * Find the target in the tree of the repository on screen.
 * @param target The binding the picture follows.
 * @param repo The repository the tree shows.
 * @param files Its files.
 * @returns The file or folder to reveal.
 */
function followed(
	target: FollowTarget,
	repo: string | null,
	files: ReadonlySet<string> | undefined,
) {
	const { path } = target;
	if (path === null || target.repo !== repo || files === undefined) return NOTHING_FOLLOWED;
	return files.has(path) ? { file: path, folder: null } : { file: null, folder: path };
}

/**
 * Track a new pick independently of the listing. On first mount, keep a file already in the address.
 * @param last The previous target.
 * @param target The target now.
 * @param open The file in the address.
 * @returns The target and whether to follow it when the listing arrives.
 */
function nextFollow(last: PendingFollow, target: FollowTarget, open: string | null): PendingFollow {
	if (last.path !== target.path || last.repo !== target.repo) return { ...target, pending: "pick" };
	if (last.pending === "initial" && open !== null) return { ...target, pending: null };
	return last;
}

/**
 * Follow a pick in the picture, or the module opened while nothing is picked: a module bound to a
 * file opens that file in the code view, and the picture and the selection stay as they are. Only the pick moves the code, never the code
 * the pick: a file opened from the tree selects modules that all own it, so a pick of one of them
 * finds its file already open.
 * @param reader The reader.
 * @param repo The repository the tree shows.
 * @param files Its files, once they are listed.
 * @returns The folder the tree opens to for a module bound to a folder, or null.
 */
function useFollowSelection(
	reader: Reader,
	repo: string | null,
	files: ReadonlySet<string> | undefined,
): string | null {
	const { file: open, fileRepo, showFile } = reader.location;
	const { path, repo: boundRepo } = followTarget(reader);
	const { file, folder } = followed({ path, repo: boundRepo }, repo, files);
	const last = useRef<PendingFollow>({ path, repo: boundRepo, pending: "initial" });
	const ready = repo !== null && files !== undefined;
	useEffect(() => {
		last.current = nextFollow(last.current, { path, repo: boundRepo }, open);
		if (last.current.pending === null || !ready) return;
		last.current.pending = null;
		if (file !== null && file !== open) showFile({ file, repo: fileRepo, picture: null });
	}, [path, boundRepo, file, open, fileRepo, showFile, ready]);
	return folder;
}

export { useFollowSelection };
