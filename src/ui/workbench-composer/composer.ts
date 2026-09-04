import { ComposerPrimitive } from "@assistant-ui/react";

/**
 * The module's single assistant-ui import site.
 *
 * `ComposerPrimitive` is the only member assigned to this module by the
 * repository's assistant-ui policy, and only its headless `Root` form mechanics
 * are used: the form element and the mechanic that focuses the composer input
 * when a person taps blank composer space. Everything a person reads or presses
 * — the input, the send control, the interrupt control, the status region, the
 * retained-draft region — is Archboard source in `lib/WorkbenchComposer.tsx`,
 * and so are the text buffer, the keyboard, and every dispatch.
 *
 * `Input` is deliberately not used. Its buffer and its Enter policy belong to
 * assistant-ui, which refuses to send while a run is in progress unless its
 * `Queue` is enabled — the opposite of Archboard's steer, which exists to
 * correct a running turn. No Element is copied from assistant-ui, and the
 * primitive's `Queue`, `Dictate`, `StopDictation`, and `DictationTranscript`
 * members are never reached: Archboard owns queueing, and voice belongs to the
 * coordinator (ADR 0019), not to this composer.
 */
export const assistantComposerPrimitives = Object.freeze({ ComposerPrimitive });
