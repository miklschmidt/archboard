# Upgrade Codex

Archboard pins `@openai/codex` and generates protocol types from that executable.
A version change also needs a review of the matching upstream source.
Read this guide when upgrading Codex.

## Review the upstream changes

In a clone of `github.com/openai/codex`, compare the old and new `rust-v<version>` tags.
Read the changes to these areas:

- The message definitions and serde attributes in `codex-rs/app-server-protocol/src/protocol`.
- The app-server handlers for methods listed in `packages/codex-app-server/src/runtime/protocol/protocol-methods.ts` in Archboard.
- The realtime implementation, including `core/src/realtime_conversation*`, `realtime_history.rs`, `session/world_state.rs`, and `codex-api/src/endpoint/realtime_websocket`.
- The models and supported effort levels in `models-manager` that Archboard uses.

For each relevant change, record whether Archboard adopts it, ignores it, or changes behavior.
A generated `T | null` does not prove that a field is optional.
Read its serde attributes to distinguish an omitted field from an explicit `null`.

## Adapt Archboard

Before changing the pin in a fresh checkout, run `bun install` to generate the old contract.
Keep that contract for comparison with the new one.
Update the pins in `package.json`, `scripts/generate-codex-app-server-contract.ts`, and `packages/codex-app-server/src/runtime/protocol/protocol-version.ts` together.
Run `bun install` to generate the new contract.
Compare the generated versions under `packages/codex-app-server/src/shared/protocol/generated/versions/`.

Adapt the handwritten schemas to the generated types.
Keep the type assertions that test compatibility in both directions.
Update required fields in the standalone fake servers as well as TypeScript fixtures.
The standalone servers include fixtures under `tests/system/server-state/fixtures` and `tests/system/process-contracts`.

Read version-specific claims against their cited upstream source at the new tag.
Keep historical measurements tied to the version that produced them.
Update version literals in standalone fake executables.

## Test the upgrade

Run `bun run check`.
Use [TESTING.md](../../TESTING.md) to start a server with the machine's Archboard Codex sign-in.
Use a scratch vault at `<scratch>/.archboard/vault`, copied from `examples/web-shop`.
Name `<scratch>` with `-C` on commands that use that vault.
Keep the default state directory so that the server uses that sign-in.

Open the server in a browser and send one message.
Make sure that the coordinator and workhorse start and that the message receives an answer.
Stop the test server when the trial ends.
