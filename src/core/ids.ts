// Every element id archboard mints, minted once, in the one shape every
// consumer can hold: one to eight characters from Obsidian's block-id
// alphabet.
//
// The constraint comes from the note. A text element's block id *is* its
// element id (the Obsidian Excalidraw plugin's own rule, mirrored in
// obsidian-md.ts), and a block reference cannot hold more than eight
// characters, so anything longer has to be renamed on the way into a note.
// That rename is the most dangerous act in the system. Measured: with a text
// editor open on a bound label, a document was applied in which that text
// element had been renamed. The textarea stayed on screen, stayed focused and
// kept its value, but the scene no longer held the id the editor was bound to.
// Five characters were typed and Escape pressed, and the five characters were
// discarded — no error, no warning, nothing on screen to say it had happened.
//
// No amount of timing fixes that: holding a server update until a text edit
// ends does not help, because the next keystroke still goes to an element that is gone.
// The only defence is that ids do not change, and the only way to get that is
// to mint them in the final shape. So minting lives here, and nothing
// downstream — least of all the note writer — is left with a reason to rename.
//
// Excalidraw is the one minter this file cannot reach: it names what a user
// draws with a 21-character nanoid, in the browser. So the pane calls
// `derivedId` below the moment a text editor closes, before the element is
// reported (TASK-098, `frontend/src/canvas/useCanvasSession.ts`). Same
// function, same answer, and the rename therefore happens where no editor is
// bound rather than at the far end of a round trip.
//
// Collision handling lives here too, for the same reason it does not belong at
// the writing site: a collision is a property of the id space, not of a file
// format. Both mints take the ids already spoken for and will not return one
// of them.

// No dash. It is legal in a block id, and an id like `a-1-b-2` reads as
// structure that is not there.
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

// Obsidian block ids are alphanumeric-and-dash only — an id containing "_"
// would be written as an unresolvable block reference. Dashes are accepted
// here even though nothing mints them, because ids arriving from elsewhere
// (Excalidraw's own, a user-edited note) may carry one and are none the worse
// for it.
const BLOCK_ID_RE = /^[A-Za-z0-9-]{1,8}$/;

/** Can this id be written as an Obsidian block reference as it stands? */
export function isBlockId(id: unknown): boolean {
  return typeof id === 'string' && BLOCK_ID_RE.test(id);
}

/**
 * The ids already spoken for. A `Set` and a `Map` both satisfy it, so a caller
 * with the board's element map available passes it directly rather than
 * building a copy of the keys.
 */
export interface IdsInUse {
  has(id: string): boolean;
}

const NOTHING_IN_USE: IdsInUse = { has: () => false };

function encode(bits: bigint): string {
  let remaining = bits;
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[Number(remaining % BigInt(ID_ALPHABET.length))];
    remaining /= BigInt(ID_ALPHABET.length);
  }
  return id;
}

/** A fresh id nobody is using. */
export function mintId(inUse: IdsInUse = NOTHING_IN_USE): string {
  for (;;) {
    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    if (!inUse.has(id)) return id;
  }
}

// FNV-1a 32-bit — a stable positive int from a string.
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The id `sourceKey` always gets, so two places that derive an id for the same
 * thing agree without passing it between them — and so a board that has been
 * through an older archboard, which derived ids the same way at the note
 * boundary, keeps the ids it already has.
 *
 * Deterministic up to collision: the first `sourceKey` to ask gets the plain
 * derivation, and a later one whose derivation is taken gets the next salted
 * attempt.
 */
export function derivedId(sourceKey: string, inUse: IdsInUse = NOTHING_IN_USE): string {
  for (let attempt = 0; ; attempt++) {
    const salted = attempt === 0 ? sourceKey : `${sourceKey}:${attempt}`;
    const bits = (BigInt(fnv1a(salted)) << 32n) | BigInt(fnv1a(`${salted}#2`));
    const id = encode(bits);
    if (!inUse.has(id)) return id;
  }
}
