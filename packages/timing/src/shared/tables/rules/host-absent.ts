// What a published build reads in place of the host half of timing's tables:
// no groups, no waits and no pauses, so the build carries only the published
// half. timing's package.json selects it under the `published` condition.

/** No groups. */
const HOST_GROUPS = Object.freeze({});

/** No polls. */
const HOST_WAITS = Object.freeze({});

/** No pauses. */
const HOST_PAUSES = Object.freeze({});

export { HOST_GROUPS, HOST_PAUSES, HOST_WAITS };
