import { ComposerPrimitive } from "@assistant-ui/react";

/**
 * The module's single assistant-ui import site.
 *
 * `ComposerPrimitive` is the only member assigned to this module by the
 * repository's assistant-ui policy, and only its headless form and input
 * mechanics are used: `Root` is the form whose submit reaches the runtime, and
 * `Input` is the textarea bound to the composer's own text buffer. Everything a
 * person reads or presses — the send control, the interrupt control, the status
 * region, the retained-draft region — is Archboard source in
 * `lib/WorkbenchComposer.tsx`. No Element is copied from assistant-ui, and the
 * primitive's `Queue`, `Dictate`, `StopDictation`, and `DictationTranscript`
 * members are never reached: Archboard owns queueing, and voice belongs to the
 * coordinator (ADR 0019), not to this composer.
 */
export const assistantComposerPrimitives = Object.freeze({ ComposerPrimitive });
