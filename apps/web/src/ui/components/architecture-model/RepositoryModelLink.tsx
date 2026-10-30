import { useCallback, type JSX, type MouseEvent } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";

/**
 * Open current architecture from its repository without inventing a board.
 * @param props The repository and canonical identity returned by the reader.
 * @param props.onOpen Opens through the existing shell action owner.
 * @param props.model The canonical manifest.
 * @returns One explicit action in the repository navigator.
 */
function RepositoryModelLink({
	model,
	onOpen,
}: {
	model: Model["manifest"];
	onOpen: () => void;
}): JSX.Element {
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>): void => {
			event.stopPropagation();
			onOpen();
		},
		[onOpen],
	);
	return (
		<Button
			data-slot="repository-model-open"
			variant="ghost"
			size="sm"
			onClick={open}
			title={`Open ${model.name}`}
		>
			Open
		</Button>
	);
}

export { RepositoryModelLink };
