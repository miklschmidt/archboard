# Voice output wave

The official LiveKit Agents UI oscilloscope wave, driven by Archboard's typed
voice output state and the measured model output level. There is no
microphone input path: the wave only ever shows what the model is saying.

Provenance, licences and content digests: `LICENSE-NOTICE.md`.

## Files

- `index.tsx` — `VoiceOutputWave`, the product component. Fully lint-checked.
- `wave-state.ts` — the pure state mapping (targets, easing, pulse, text).
  Public so the tests can reach it.
- `lib/use-voice-output-wave.ts` — the Archboard-owned hook that replaces the
  upstream `useAgentAudioVisualizerWave`. One `requestAnimationFrame` loop
  while the session is live; cancelled on stop, inactivity or unmount.
- `lib/environment.ts` — one-time WebGL probe, `prefers-reduced-motion`
  subscription, and the `--status` accent read from computed style.
- `agent-audio-visualizer-wave.tsx` — official renderer (shader source,
  `WaveShader`, size variants, mask). On the lint override list.
- `react-shader-toy.tsx` — official WebGL shader host. On the lint override list.

## Behaviour

| State        | Wave                                                              |
| ------------ | ----------------------------------------------------------------- |
| `inactive`   | flat line; no animation loop                                      |
| `connecting` | small fast buzz, opacity pulsing every 400 ms (same as thinking)  |
| `listening`  | slow idle wave, opacity pulsing every 750 ms                      |
| `thinking`   | small fast buzz, opacity pulsing every 400 ms                     |
| `speaking`   | amplitude `0.015 + 0.4·level`, frequency `20 + 60·level`, no ease |

`active=false` stops the loop whatever the state says. Reduced motion (the
`reducedMotion` prop or the media query) and a browser without WebGL both
render `StaticWave`: one status-coloured rule and the visible state text.
The animated presentation carries the same text in an `aria-live` `<output>`,
visually hidden unless `showText` is set.

## Adaptations to the official files

`react-shader-toy.tsx` keeps the shader compilation, uniform handling,
texture, mouse and resize mechanics unchanged. Edits exist only to pass the
retained compiler and safety checks:

- index-signature uniforms are read with bracket access
  (`noPropertyAccessFromIndexSignature`);
- `as` assertions are replaced by `instanceof` narrowing, a typed image
  promise, and a `numberList` helper for `number | number[]` uniform values;
- `_webglTexture` is `webglTexture`; `image.onload`/`onerror` use
  `addEventListener`; default array and object props are module constants;
- always-true guards on non-null WebGL handles are removed; two effects that
  deliberately run once per mount keep upstream's own `exhaustive-deps`
  suppression, translated to `oxlint-disable-next-line`;
- the two `.then` callbacks return explicitly; two `useEffect` early exits
  return `undefined` explicitly.

`agent-audio-visualizer-wave.tsx` keeps the shader source, `WaveShader`,
`hexToRgb`, the size variants and the mask. Edits:

- the LiveKit `AgentState`, `audioTrack` and `volume` props are replaced by
  `state: VoiceWaveState`, `level`, `active` and `reducedMotion`, passed to
  `useVoiceOutputWave`;
- `AgentAudioVisualizerWaveVariants` is `agentAudioVisualizerWaveVariants`
  (a cva result, not a component); `_lineWidth` is `resolvedLineWidth`;
- optional `WaveShaderProps` members accept `undefined` explicitly
  (`exactOptionalPropertyTypes`); `globalThis.devicePixelRatio` is read
  without a fallback it never needed.

The repository formatter (`bun run fmt`) reflows both files; the digests in
`LICENSE-NOTICE.md` are of the served bytes.
