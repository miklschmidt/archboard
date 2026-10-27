import fs from "node:fs";
import path from "node:path";
import {VAULT_DIRECTORY} from "@archboard/workspace/vault";
import type {checkoutsReadFrom} from "@archboard/code-binding/resolution";
import type {EmbedVault} from "#cli/protocol/check/embeds-answer.ts";
import {fetchedVault} from "#cli/operations/vault/embeds/fetched-vaults.ts";
interface VaultFailure {readonly ok:false;readonly code:"EMBED_VAULT_UNAVAILABLE"|"EMBED_VAULT_FETCH_FAILED";readonly reason:string;}
type FoundVault={readonly ok:true;readonly vault:string;readonly read:EmbedVault}|VaultFailure;
type VaultReading=FoundVault;
type ReadCheckouts=ReturnType<typeof checkoutsReadFrom>;
function unavailable(reason:string):VaultFailure{return {ok:false,code:"EMBED_VAULT_UNAVAILABLE",reason};}
/**
 * The vault of the default branch of a repository that no checkout on this
 * machine holds: fetched, or the newest cached copy when the fetch fails.
 * @param repo The identity.
 * @param signal Cancels the fetch.
 * @returns The vault, or why there is none.
 */
async function remoteVault(repo: string, signal: AbortSignal): Promise<FoundVault> {
	const fetched = await fetchedVault(repo, signal);
	if (!fetched.ok) {
		return fetched.failure === "unfetchable"
			? unavailable(
					`No checkout of ${repo} is registered on this machine, and ${fetched.reason}, so the embed was not checked. Register one with \`archboard repo add <directory>\`.`,
				)
			: {
					ok: false,
					code: "EMBED_VAULT_FETCH_FAILED",
					reason: `No checkout of ${repo} is registered on this machine, fetching its vault failed (${fetched.reason}), and no copy is cached, so the embed was not checked. Check the network and your Git credentials for ${repo}, or register a checkout with \`archboard repo add <directory>\`.`,
				};
	}
	const { commit, fetchFailed } = fetched;
	if (fetched.vault === undefined) {
		const read =
			fetchFailed === undefined
				? `The default branch of ${repo}, at ${commit.slice(0, 9)},`
				: `Fetching the vault of ${repo} failed (${fetchFailed}), and the newest cached commit, ${commit.slice(0, 9)},`;
		return unavailable(`${read} holds no ${VAULT_DIRECTORY}, so the embed was not checked.`);
	}
	const read: EmbedVault =
		fetchFailed === undefined
			? { source: "fetched", repo, commit }
			: {
					source: "cache",
					repo,
					commit,
					severity: "information",
					code: "EMBED_VAULT_CACHED",
					message: `Fetching the vault of ${repo} failed (${fetchFailed}), so the check read the newest cached commit, ${commit.slice(0, 9)}, which can be behind the default branch.`,
				};
	return { ok: true, vault: fetched.vault, read };
}

/**
 * The vault a repository identity names, as a reader of this checkout's vault resolves it.
 * @param repo The identity the recipe names, or null for a vault in no repository.
 * @param checkouts The checkouts that reader resolves identities in.
 * @param signal Cancels a fetch.
 * @returns The vault directory and where it was read, or why it cannot be read.
 */
async function vaultOf(
	repo: string | null,
	checkouts: ReadCheckouts,
	signal: AbortSignal,
): Promise<FoundVault> {
	if (repo === null) {
		return unavailable(
			"The recipe names a vault in no Git repository, which no checkout can find. Draw it again from a vault in a repository.",
		);
	}
	const checkout = checkouts.find((each) => each.repo === repo);
	if (checkout === undefined) return remoteVault(repo, signal);
	const vault = path.join(checkout.root, VAULT_DIRECTORY);
	if (!fs.existsSync(vault)) {
		return unavailable(
			`The chosen checkout of ${repo}, ${checkout.root}, holds no vault, so the embed was not checked.`,
		);
	}
	return { ok: true, vault: fs.realpathSync.native(vault), read: { source: "checkout", repo } };
}

/** Each vault the embeds name, read once however many embeds name it. */
interface VaultReader {
	/** The vault an identity names. */
	readonly read: (repo: string | null) => Promise<VaultReading>;
	/** Every vault read so far, in the order the embeds named them. */
	readonly vaults: () => Promise<EmbedVault[]>;
}

/**
 * A reader that reads each vault once, however many embeds name it.
 * @param checkouts The checkouts identities resolve in.
 * @param signal Cancels a fetch.
 * @returns The reader.
 */
function vaultReader(checkouts: ReadCheckouts, signal: AbortSignal): VaultReader {
	const readings = new Map<string | null, Promise<VaultReading>>();
	/**
	 * The vault an identity names, read on first use.
	 * @param repo The identity.
	 * @returns The reading.
	 */
	function read(repo: string | null): Promise<VaultReading> {
		let reading = readings.get(repo);
		if (reading === undefined) {
			reading = vaultOf(repo, checkouts, signal);
			readings.set(repo, reading);
		}
		return reading;
	}
	/**
	 * Where each vault that could be read was read.
	 * @returns The vaults.
	 */
	async function vaults(): Promise<EmbedVault[]> {
		const all = await Promise.all(readings.values());
		return all.flatMap((reading) => (reading.ok ? [reading.read] : []));
	}
	return { read, vaults };
}

export {vaultReader,type VaultReading};
