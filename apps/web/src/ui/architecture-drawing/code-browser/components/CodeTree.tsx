// The files of one repository, as a tree on the chrome (TASK-648). @pierre/trees draws it in its own
// shadow root, virtualized, with search and the keys of a tree, and reads the shell's theme through
// its custom properties, which pass into a shadow root. A row of a file or folder that a module binds
// ends with a mark whose tooltip names the module. A file the server never quotes ends with another
// mark whose tooltip says so: a deep row has room for a mark, but not for words.

import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type JSX } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { FileTreeBatchOperation, FileTreeRowDecorationContext } from "@pierre/trees";
import type { CodeFiles } from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import {
	bindingLabel,
	type PathBinding,
} from "#ui/architecture-drawing/code-browser/rules/bound-paths.ts";

/** The shell's tones, type and rows, in the tree's own custom properties. */
const TREE_STYLE = {
	// The column's own tone, not transparent: a long name's ellipsis is painted on it, over the
	// letters it hides.
	"--trees-bg-override": "var(--sidebar)",
	"--trees-fg-override": "var(--foreground)",
	"--trees-fg-muted-override": "var(--muted-foreground)",
	"--trees-bg-muted-override": "color-mix(in oklch, var(--face) 50%, transparent)",
	"--trees-selected-bg-override": "var(--face)",
	"--trees-selected-fg-override": "var(--foreground)",
	"--trees-selected-focused-border-color-override": "var(--ring)",
	"--trees-focus-ring-color-override": "var(--ring)",
	"--trees-border-color-override": "var(--border)",
	"--trees-indent-guide-bg-override": "var(--border)",
	"--trees-search-bg-override": "var(--tray-sink)",
	"--trees-search-fg-override": "var(--foreground)",
	"--trees-input-bg-override": "var(--tray-sink)",
	"--trees-scrollbar-thumb-override": "var(--border)",
	"--trees-font-family-override": "var(--font-sans)",
	"--trees-font-size-override": "12px",
	// 8px from the column's edges, as the repository switcher over it stands.
	"--trees-padding-inline-override": "8px",
	"--trees-accent-override": "var(--primary-mark)",
} as CSSProperties;

/**
 * The Quiet Scrollbar Rule inside the tree's shadow root, which the page's rule for every element
 * does not reach: the tree's scrollbar is thin, so its rows end near the 8px the column keeps.
 */
const TREE_CSS = "[data-file-tree-virtualized-scroll] { scrollbar-width: thin; }";

/** A row is 28px high, as every row of the shell's lists is. */
const ROW_HEIGHT = 28;

/** The words the tree says. */
const LABELS = { searchPlaceholder: "Find a file" };

/** The mark at the end of the row of a file the server never quotes. */
const NEVER_SHOWN = { text: "⊘", title: "Archboard never shows this file's text" };

/**
 * A row's path without the `/` that ends a folder's.
 * @param path The path.
 * @returns The path.
 */
function bare(path: string): string {
	return path.replace(/\/+$/u, "");
}

/** Inputs for the tree. */
interface CodeTreeProps {
	readonly files: CodeFiles;
	/** The modules bound to each path. */
	readonly bound: ReadonlyMap<string, PathBinding>;
	/** The open file, which the tree selects. */
	readonly open: string | null;
	/** A folder to open the tree to, for a module the picture picked. */
	readonly reveal: string | null;
	readonly onOpen: (path: string) => void;
}

/** The paths and selected file reflected in the tree. */
interface TreeState {
	paths: readonly string[];
	open: string | null;
	applying: boolean;
}

/**
 * The files of one repository.
 * @param props The files, what binds them, and what is open.
 * @returns The tree.
 */
function CodeTree(props: CodeTreeProps): JSX.Element {
	const { files, bound, open, reveal } = props;
	const paths = files.files;
	// The tree is made once, so what it calls reads the newest values through these refs.
	const hidden = useMemo(() => new Set(files.neverQuoted), [files.neverQuoted]);
	const latest = useRef({ bound, hidden, open, onOpen: props.onOpen });
	const synced = useRef<TreeState>({ paths, open: null, applying: false });
	useLayoutEffect(() => {
		latest.current = { bound, hidden, open, onOpen: props.onOpen };
	});
	const { model } = useFileTree({
		paths,
		flattenEmptyDirectories: true,
		initialExpansion: "closed",
		initialExpandedPaths: open === null ? [] : ancestors(open),
		initialSelectedPaths: open === null ? [] : [open],
		itemHeight: ROW_HEIGHT,
		search: true,
		labels: LABELS,
		unsafeCSS: TREE_CSS,
		/**
		 * What a row says at its end: that a module binds its path, or that its text is never shown.
		 * @param context The row.
		 * @returns The words, or nothing.
		 */
		renderRowDecoration: (context: FileTreeRowDecorationContext) => {
			const path = bare(context.item.path);
			if (latest.current.hidden.has(path)) return NEVER_SHOWN;
			const binding = latest.current.bound.get(path);
			return binding === undefined ? null : bindingLabel(binding);
		},
		/**
		 * Open the one file a person chose; a folder only opens in place.
		 * @param selected The chosen rows.
		 */
		onSelectionChange: (selected) => {
			if (synced.current.applying) return;
			const [path] = selected;
			if (selected.length !== 1 || path === undefined || path.endsWith("/")) return;
			if (path !== latest.current.open) latest.current.onOpen(path);
		},
	});
	useEffect(() => {
		syncTree(model, synced.current, paths, open);
	}, [paths, model, open]);
	useEffect(() => {
		if (reveal !== null) showPath(model, `${reveal}/`, false);
	}, [model, reveal]);
	return (
		<FileTree
			model={model}
			data-slot="code-tree"
			aria-label={`Files of ${files.repo}`}
			style={TREE_STYLE}
			className="block h-full min-h-0"
		/>
	);
}

/**
 * Apply listing and address changes without treating them as a user's file pick.
 * @param model The tree.
 * @param synced The last values applied to the tree.
 * @param paths The latest checkout paths.
 * @param open The addressed file.
 */
function syncTree(
	model: ReturnType<typeof useFileTree>["model"],
	synced: TreeState,
	paths: readonly string[],
	open: string | null,
): void {
	synced.applying = true;
	try {
		if (synced.paths !== paths) {
			const changes = pathChanges(synced.paths, paths);
			if (changes.length > 0) model.batch(changes);
			synced.paths = paths;
		}
		syncOpenPath(model, open, synced.open);
		synced.open = open;
	} finally {
		synced.applying = false;
	}
}

/**
 * Reflect the addressed file in the tree selection.
 * @param model The tree.
 * @param open The addressed file.
 * @param previous The last addressed file.
 */
function syncOpenPath(
	model: ReturnType<typeof useFileTree>["model"],
	open: string | null,
	previous: string | null,
): void {
	if (open === null) {
		model.getSelectedPaths().forEach((path) => model.getItem(path)?.deselect());
	} else if (previous !== open || !model.getSelectedPaths().includes(open)) {
		showPath(model, open, true);
	}
}

/**
 * Update the paths without resetting the expanded folders or tree focus.
 * @param previous The paths in the tree.
 * @param next The paths from the latest listing.
 * @returns The file removals and additions.
 */
function pathChanges(
	previous: readonly string[],
	next: readonly string[],
): FileTreeBatchOperation[] {
	const added = new Set(next);
	const changes: FileTreeBatchOperation[] = [];
	for (const path of previous) if (!added.delete(path)) changes.push({ type: "remove", path });
	for (const path of added) changes.push({ type: "add", path });
	return changes;
}

/**
 * The folders above a path, outermost first, each ending with `/`.
 * @param path The path.
 * @returns The folders.
 */
function ancestors(path: string): string[] {
	const names = path.split("/").slice(0, -1);
	return names.map((_, index) => `${names.slice(0, index + 1).join("/")}/`);
}

/**
 * Open the tree down to a path and bring its row into view.
 * @param model The tree.
 * @param path The path; a folder's ends with `/`.
 * @param select Whether to select its row too, as the open file's is.
 */
function showPath(
	model: ReturnType<typeof useFileTree>["model"],
	path: string,
	select: boolean,
): void {
	ancestors(bare(path)).forEach((folder) => expand(model, folder));
	const item = model.getItem(path);
	if (item === null) return;
	if (select) selectOnly(model, item);
	model.scrollToPath(path, { focus: false });
}

/**
 * Open one folder of the tree, if it is closed.
 * @param model The tree.
 * @param folder The folder, ending with `/`.
 */
function expand(model: ReturnType<typeof useFileTree>["model"], folder: string): void {
	const item = model.getItem(folder);
	if (item !== null && "expand" in item && !item.isExpanded()) item.expand();
}

/**
 * Select one row and let go of every other, as a click on it does.
 * @param model The tree.
 * @param item The row.
 */
function selectOnly(
	model: ReturnType<typeof useFileTree>["model"],
	item: NonNullable<ReturnType<ReturnType<typeof useFileTree>["model"]["getItem"]>>,
): void {
	for (const path of model.getSelectedPaths())
		if (path !== item.getPath()) model.getItem(path)?.deselect();
	if (!item.isSelected()) item.select();
}

export { CodeTree };
