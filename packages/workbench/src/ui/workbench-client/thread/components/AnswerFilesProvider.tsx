import type { ReactNode } from "react";

import {
	AnswerFilesContext,
	type OpenAnswerFile,
} from "#ui/workbench-client/thread/hooks/use-answer-files.ts";

/**
 * Offer the opening of a file an answer names to every answer drawn below it.
 * @param props The opening to offer and what draws the answers.
 * @param props.open Opens the file in the person's editor.
 * @param props.children What draws the answers.
 * @returns The children, with the opening in reach.
 */
function AnswerFilesProvider(props: {
	readonly open: OpenAnswerFile;
	readonly children: ReactNode;
}) {
	const { open, children } = props;
	return <AnswerFilesContext value={open}>{children}</AnswerFilesContext>;
}

export { AnswerFilesProvider };
