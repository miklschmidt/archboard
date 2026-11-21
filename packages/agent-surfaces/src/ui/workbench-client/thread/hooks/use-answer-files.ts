// Opening a file an agent's answer links to. The application owns the opener
// and where a refusal is told, and an answer is drawn deep inside the
// conversation and inside a pane's explanation. So the application offers the
// opening through a context, and each link reads it where it is drawn.

import { createContext, useContext } from "react";

import type { AnswerFile } from "#ui/workbench-client/thread/rules/answer-file.ts";

/** Open a file an answer names in the person's editor. */
type OpenAnswerFile = (file: AnswerFile) => void;

/** The opening the application offers, or null where it offers none. */
const AnswerFilesContext = createContext<OpenAnswerFile | null>(null);

/**
 * The opening the application offers.
 * @returns The opening, or null outside a provider.
 */
function useOpenAnswerFile(): OpenAnswerFile | null {
	return useContext(AnswerFilesContext);
}

export { AnswerFilesContext, useOpenAnswerFile, type OpenAnswerFile };
