// The code browser (TASK-648, TASK-649): in Code mode the focused pane's reading puts the files of
// a repository in the navigator and the open file in the code view's column beside it, so the
// pane's picture stays as it is. Opening a file brings the modules that own it into the picture, a
// bound name in the code shows its module, and a pick in the picture opens the file its module
// binds.

import { useCallback, useContext, useMemo, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModelColumn } from "#ui/architecture-drawing/model-reader/reading/components/ModelColumn.tsx";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { useShowSubject } from "#ui/architecture-drawing/model-reader/reading/hooks/use-show-subject.ts";
import { PeekControlContext } from "#ui/architecture-drawing/canvas/presentation/components/Peek.tsx";
import {
	codeFilesQuery,
	type CodeFiles as CodeFilesAnswer,
} from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import { boundPaths } from "#ui/architecture-drawing/code-browser/rules/bound-paths.ts";
import { useFollowSelection } from "#ui/architecture-drawing/code-browser/hooks/use-follow-selection.ts";
import {
	ownerReading,
	useOpenFile,
} from "#ui/architecture-drawing/code-browser/hooks/use-open-file.ts";
import { CodeTree } from "#ui/architecture-drawing/code-browser/components/CodeTree.tsx";
import { CodeSource } from "#ui/architecture-drawing/code-browser/components/CodeSource.tsx";

/**
 * The code of a reading in Code mode: the files of a repository in the navigator, in place of the
 * reading's lists, and the open file in the code view's column.
 * @param props The reader.
 * @param props.reader The reader of the focused pane.
 * @returns The tree and the file, each in its place.
 */
function CodeBrowser(props: { readonly reader: Reader }): JSX.Element {
	const { reader } = props;
	const { vault, location, selection } = reader;
	const files = useQuery(codeFilesQuery(vault, location.fileRepo ?? undefined));
	const repo = files.data?.repo ?? null;
	const { file } = location;
	const place = useMemo(
		() => (file === null || repo === null ? null : { repo, path: file }),
		[file, repo],
	);
	const actions = useSubjectActions(reader);
	return (
		<>
			<ModelColumn.Lists>
				<CodeFiles reader={reader} files={files} />
			</ModelColumn.Lists>
			<ModelColumn.Viewer>
				<CodeSource
					vault={vault}
					place={place}
					reading={ownerReading(reader)}
					selected={selection.ids}
					elsewhere={readsElsewhere(location)}
					{...actions}
				/>
			</ModelColumn.Viewer>
		</>
	);
}

/**
 * Whether a reading is of something other than the live current state, whose code the checkout
 * on disk is.
 * @param location The reading's address.
 * @param location.state The selected state, or null for the current one.
 * @param location.checkpoint The exact checkpoint, or null.
 * @param location.ref The branch of a branch reading, or null.
 * @returns True for a proposal, a saved reading or a branch.
 */
function readsElsewhere(location: {
	readonly state: string | null;
	readonly checkpoint: string | null;
	readonly ref: string | null;
}): boolean {
	return [location.state, location.checkpoint, location.ref].some((one) => one !== null);
}

/**
 * The tree of a repository's files, or what stands in its place while they are listed.
 * @param props The reader and the listing.
 * @param props.reader The reader of the pane.
 * @param props.files The read of the listing.
 * @returns The tree.
 */
function CodeFiles(props: {
	readonly reader: Reader;
	readonly files: ReturnType<typeof useQuery<CodeFilesAnswer>>;
}): JSX.Element {
	const { reader, files } = props;
	const { location, model } = reader;
	const fileRepo = location.fileRepo ?? undefined;
	const repo = files.data?.repo ?? null;
	const listed = useMemo(
		() => (files.data === undefined ? undefined : new Set(files.data.files)),
		[files.data],
	);
	const bound = useMemo(() => boundPaths(model.modules, repo ?? ""), [model.modules, repo]);
	const openFile = useOpenFile(reader, fileRepo);
	const onOpen = useCallback(
		(path: string): void => void openFile({ repo: repo ?? "", path }),
		[openFile, repo],
	);
	const reveal = useFollowSelection(reader, repo, listed);
	if (files.data === undefined)
		return (
			<p className="text-body text-muted-foreground p-4">
				{files.isError ? files.error.message : "Listing the files…"}
			</p>
		);
	return (
		<CodeTree
			key={files.data.repo}
			files={files.data}
			bound={bound}
			open={location.file}
			reveal={reveal}
			onOpen={onOpen}
		/>
	);
}

/**
 * What the code view does with the model's subjects: show one in the picture, light one there,
 * and name one.
 * @param reader The reader of the pane.
 * @returns The actions.
 */
function useSubjectActions(reader: Reader) {
	const onShow = useShowSubject(reader);
	const { point } = useContext(PeekControlContext);
	const { modules, relationships } = reader.model;
	const names = useMemo(() => {
		const byId = new Map(modules.map((module) => [module.id, module.name]));
		for (const edge of relationships) {
			const ends = `${byId.get(edge.from) ?? edge.from} to ${byId.get(edge.to) ?? edge.to}`;
			byId.set(edge.id, edge.label === undefined ? ends : `${edge.label} (${ends})`);
		}
		return byId;
	}, [modules, relationships]);
	const paths = useMemo(
		() =>
			new Map(
				modules.flatMap((module) =>
					module.binding === undefined ? [] : [[module.id, module.binding.path] as const],
				),
			),
		[modules],
	);
	const nameOf = useCallback((subject: string) => names.get(subject) ?? subject, [names]);
	const boundPathOf = useCallback((subject: string) => paths.get(subject), [paths]);
	return { onShow, onPoint: point, nameOf, boundPathOf };
}

export { CodeBrowser };
