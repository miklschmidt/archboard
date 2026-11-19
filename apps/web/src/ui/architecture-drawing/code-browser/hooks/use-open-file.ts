import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { openModules } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import {
	codeFileQuery,
	type FilePlace,
	type OwnerReading,
} from "#ui/architecture-drawing/code-browser/clients/code-files.ts";
import { ownerIds, ownerPicture } from "#ui/architecture-drawing/code-browser/rules/file-owners.ts";

/**
 * The reading a pane's file owners come from.
 * @param reader The reader.
 * @returns The reading the pane displays, with its input revision.
 */
function ownerReading(reader: Reader): OwnerReading {
	const { model, location } = reader;
	return {
		model: model.manifest.id,
		state: location.state,
		checkpoint: location.checkpoint,
		ref: model.sourceRef?.commit ?? location.ref,
		revision: model.revision.digest,
	};
}

/**
 * Open a file beside the picture, and bring its owners into the picture: the file is read first, so
 * the file and the picture with it are one move, which Back undoes as one. A file no module owns
 * leaves the picture and its selection as they are.
 * @param reader The reader of the pane.
 * @param repo The repository the tree shows, or undefined for the model's own.
 * @returns Open one file of that repository.
 */
function useOpenFile(
	reader: Reader,
	repo: string | undefined,
): (place: FilePlace) => Promise<void> {
	const client = useQueryClient();
	const selected = reader.selection.ids;
	const { vault, model, location, selection, accepted } = reader;
	const { showFile } = location;
	const { selectMany } = selection;
	const { projection } = accepted.shown;
	const { model: id, state, checkpoint, ref, revision } = ownerReading(reader);
	const origin = useMemo(
		() => ({ reading: { model: id, state, checkpoint, ref, revision }, vault, selected }),
		[id, state, checkpoint, ref, revision, vault, selected],
	);
	const current = useRef<typeof origin | null>(null);
	const pending = useRef<symbol | null>(null);
	useLayoutEffect(() => {
		current.current = origin;
		return () => {
			current.current = null;
		};
	}, [origin]);
	return useCallback(
		async (place: FilePlace): Promise<void> => {
			const intent = Symbol();
			pending.current = intent;
			const file = await client
				.fetchQuery(codeFileQuery(origin.vault, place, origin.reading))
				.catch(() => null);
			// A newer click, or another reading, owns the code view now.
			if (current.current !== origin || pending.current !== intent) return;
			const owners = file === null ? [] : ownerIds(file.owners);
			const frames = openModules(projection);
			const picture = ownerPicture(
				owners,
				model.modules,
				(scope) => frames.has(scope),
				projection.opened,
			);
			showFile({ file: place.path, repo, picture });
			if (owners.length > 0) selectMany(owners);
		},
		[
			client,
			origin, // The owner answer belongs to the reading and selection it started from.
			projection,
			model.modules,
			showFile,
			repo,
			selectMany,
		],
	);
}

export { ownerReading, useOpenFile };
