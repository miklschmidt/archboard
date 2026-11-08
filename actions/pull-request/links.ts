// The addresses a pull request comment points at. Pure.

/** Where a repository's files are served. */
interface Hosting {
	/** GITHUB_SERVER_URL, such as `https://github.com`. */
	readonly server: string;
	/** `owner/name`. */
	readonly repository: string;
}

/**
 * The address a comment embeds a committed file from. github.com serves raw files from its own
 * host. A GitHub Enterprise Server serves them below the repository.
 * @param hosting Where the repository is.
 * @param branch The branch that holds the file.
 * @param path The file's path on the branch.
 * @returns The address.
 */
function rawUrl(hosting: Hosting, branch: string, path: string): string {
	const encoded = path.split("/").map(encodeURIComponent).join("/");
	return hosting.server === "https://github.com"
		? `https://raw.githubusercontent.com/${hosting.repository}/${encodeURIComponent(branch)}/${encoded}`
		: `${hosting.server}/${hosting.repository}/raw/${encodeURIComponent(branch)}/${encoded}`;
}

/**
 * The address of a folder of the repository at a commit.
 * @param hosting Where the repository is.
 * @param ref The commit.
 * @param folder The folder's path from the repository root.
 * @returns The address.
 */
function folderUrl(hosting: Hosting, ref: string, folder: string): string {
	return `${hosting.server}/${hosting.repository}/tree/${ref}/${folder.split("/").map(encodeURIComponent).join("/")}`;
}

export { folderUrl, rawUrl, type Hosting };
