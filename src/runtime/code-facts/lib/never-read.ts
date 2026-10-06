// The files code facts never read, whatever Git says about them (ADR 0046):
// Terraform state, its backups and workspaces, variable files and the
// `.terraform` directory. They can hold secrets in plain text, and the
// Archboard server answers any request from this machine.

/**
 * Paths never read: the `.terraform` directory, state with every backup
 * Terraform writes beside it (`terraform.tfstate.backup`,
 * `terraform.tfstate.<time>.backup`) and the workspaces under
 * `terraform.tfstate.d/`, and variable files.
 */
const NEVER_READ = [/(^|\/)\.terraform(\/|$)/u, /\.tfstate(\.|\/|$)/u, /\.tfvars(\.json)?$/u];

/**
 * Whether code facts never read a path.
 * @param relative The path, relative to its checkout, with `/` between names.
 * @returns True for Terraform state, a variable file or the `.terraform` directory.
 */
function neverRead(relative: string): boolean {
	return NEVER_READ.some((pattern) => pattern.test(relative));
}

export { neverRead };
