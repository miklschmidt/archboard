// Every element id archboard mints, minted once, in the one shape every
// consumer can hold: one to eight characters from Obsidian's block-id
// alphabet.
//
// The constraint is that an id has to be writable as an Obsidian block
// reference, which cannot hold more than eight characters — so anything longer
// would have to be renamed somewhere downstream. A rename is the most dangerous
// act in the system: an id is what a proposal is compared by, so renaming one
// makes a change look like a deletion and an addition, and anything holding the
// old id is quietly pointing at nothing.
//
// The only defence is that ids do not change, and the only way to get that is
// to mint them in the final shape. So minting lives here, and nothing
// downstream is left with a reason to rename.
//
// Collision handling lives here too, for the same reason it does not belong at
// the writing site: a collision is a property of the id space, not of a file
// format. The mint takes the ids already spoken for and will not return one of
// them.

// No dash. It is legal in a block id, and an id like `a-1-b-2` reads as
// structure that is not there.
const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 8;

// Obsidian block ids are alphanumeric-and-dash only — an id containing "_"
// would be written as an unresolvable block reference. Dashes are accepted
// here even though nothing mints them, because ids authored elsewhere may
// carry one and are none the worse for it.
const BLOCK_ID_RE = /^[A-Za-z0-9-]{1,8}$/u;

/**
 * Can this id be written as an Obsidian block reference as it stands?
 * @param id - Candidate identifier.
 * @returns Whether the identifier is directly usable as a block reference.
 */
function isBlockId(id: unknown): boolean {
	return typeof id === "string" && BLOCK_ID_RE.test(id);
}

/**
 * The ids already spoken for. A `Set` and a `Map` both satisfy it, so a caller
 * with the board's element map available passes it directly rather than
 * building a copy of the keys.
 */
interface IdsInUse {
	readonly has: (id: string) => boolean;
}

/**
 * The empty set of ids: the default for a mint that has nothing to avoid.
 */
const NOTHING_IN_USE: IdsInUse = {
	/**
	 * Reports that no id is in use.
	 * @returns Always false.
	 */
	has: () => false,
};

/**
 * Creates a fresh id nobody is using.
 * @param inUse - Existing identifiers that the mint must avoid.
 * @returns A unique block-safe identifier.
 */
function mintId(inUse: IdsInUse = NOTHING_IN_USE): string {
	for (;;) {
		let id = "";
		for (let i = 0; i < ID_LENGTH; i++) {
			id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
		}
		if (!inUse.has(id)) {
			return id;
		}
	}
}

export { BLOCK_ID_RE, isBlockId, type IdsInUse, mintId };
