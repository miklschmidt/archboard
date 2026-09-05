# Third-party notice: LiveKit Agents UI wave renderer

`agent-audio-visualizer-wave.tsx` and `react-shader-toy.tsx` are copied from
the LiveKit Agents UI registry (`@livekit/agents-ui` 1.0.8), fetched on
2026-09-05. Both are licensed under the Apache License, Version 2.0
(<https://www.apache.org/licenses/LICENSE-2.0>). `react-shader-toy.tsx` also
carries its own MIT header (Morgan Villedieu 2018, Rysana 2023, LiveKit 2026),
retained verbatim at the top of the file.

| Registry item                 | URL                                                         | Item JSON SHA-256 (first 16) |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------- |
| `agent-audio-visualizer-wave` | `https://livekit.com/ui/r/agent-audio-visualizer-wave.json` | `2d91e5e65ba051fb`           |
| `react-shader-toy`            | `https://livekit.com/ui/r/react-shader-toy.json`            | `32a02642ab0a3c34`           |

Content digests (SHA-256, first 16 hex) of each file exactly as served inside
the item JSON, before the repository formatter and the adaptations below:

| Served path                                            | Content digest     | Local file                        |
| ------------------------------------------------------ | ------------------ | --------------------------------- |
| `components/agents-ui/agent-audio-visualizer-wave.tsx` | `daf1fa9df5d42c58` | `agent-audio-visualizer-wave.tsx` |
| `components/agents-ui/react-shader-toy.tsx`            | `eb8efb252e7908e2` | `react-shader-toy.tsx`            |
| `hooks/agents-ui/use-agent-audio-visualizer-wave.ts`   | `db83bd092ec88bc4` | not copied, see README            |

The upstream hook is not copied: it imports LiveKit room and track utilities
and the `motion` library even when a volume is supplied. `lib/use-voice-output-wave.ts`
is the Archboard-owned replacement. No `livekit-client`,
`@livekit/components-react` or `motion` dependency was added.
