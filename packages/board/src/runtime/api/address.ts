// Where a board lives: its identity and board key, the variant a key states, and the path of its file in a vault.
export { boardMemoryKey, makeIdentity, normalizeBoardKey, paneBoardAddress, parseBoardKey, statedVariant } from "#runtime/store/address.ts";
export { locateSemanticBoard, semanticBoardAddress } from "#runtime/store/location.ts";
