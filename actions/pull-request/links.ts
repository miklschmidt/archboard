// The addresses a pull request comment points at. Pure.

/** Where a repository's files are served. */
interface Hosting {
	/** GITHUB_SERVER_URL, such as `https://github.com`. */
	readonly server: string;
	/** `owner/name`. */
	readonly repository: string;
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

export { folderUrl, type Hosting };
