// What the application offers a reader whose code check found a checkout without the server of a
// language (TASK-646.09): the server each language needs, as the one setup brief names it, and
// Fix with Codex, which asks the agent of that checkout to set it up. A reader outside the
// application has none, and names no server.
import { createContext } from "react";

/** The setup of missing language servers, as the application offers it. */
interface LanguageServerFix {
	/**
	 * The server that a language needs, in Markdown.
	 * @param language The language, as the code check names it.
	 * @returns The server, or nothing for a language whose server no agent configures.
	 */
	readonly server: (language: string) => string | undefined;
	/**
	 * Start the setup in the conversation of the repository's checkout.
	 * @param repo The repository, as the code check names it.
	 * @param languages Its languages without a server.
	 */
	readonly fix: (repo: string, languages: readonly string[]) => void;
}

const LanguageServerFixContext = createContext<LanguageServerFix | null>(null);

export { LanguageServerFixContext };
