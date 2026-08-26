# Samsung Flip WM75FX as the whiteboard surface

Physical setup notes. The canvas/agent side is in `AGENTS.md`.

## Decision

Drive the Flip as a **dumb touchscreen** from the MacBook Pro M4 Max over HDMI +
USB touch-out. Run the Excalidraw canvas on the Mac. Do not use the Flip's own
Whiteboard app, its browser, or MagicINFO.

Rationale: everything valuable about the panel (IR touch, pen, 75", glass) is
reachable over standard USB HID. Everything closed about it (`.iwb`, partner
certificates, Tizen app signing) is avoided by not using it.

## Verified hardware facts

From the official WMFX leaflet spec table:

| Spec             | WM75FX                                             |
| ---------------- | -------------------------------------------------- |
| Video in         | Rear HDMI 1, Front HDMI 1, USB-C 65W PD            |
| Video out        | HDMI 1                                             |
| **Touch out**    | **Rear 1 (USB upstream type), Front 1**            |
| Touch            | IR, 20 points, passive pen w/ magnet, 6.7ms        |
| External control | RS232C via stereo jack, RJ45 for MDC               |
| Platform         | Tizen 9.0, CA76 quad 1.7GHz, 8GB RAM, 64GB         |
| OPS slot         | **None** (`Media Player Option Type: N/A`)         |
| Orientation      | Landscape only (75"/85"; rotation is 55"/65" only) |
| Mount / weight   | VESA 400x400, 53.6 kg                              |

A USB upstream cable is **included in the box**.

## The macOS problem

macOS has **no native support for external touchscreens** — not on Apple
Silicon, not in 2026, no Apple driver at any version. Video over HDMI works
fine; touch is the gap.

**Hard ceiling regardless of driver:** macOS has a single system cursor. Any
driver translates HID touch reports into cursor + gesture events, so 20 touch
points collapse to **one pointer plus gestures**. Two people cannot draw
simultaneously on a Mac-driven Flip. Fine for one person + agent, which is the
intended use.

### Path 1 — Touch-Up (try first, free)

<https://github.com/shueber/Touch-Up> — MIT, user-level driver, v1.1 (2026-06-04).

- Works with any touchscreen that works on Windows (standard USB HID)
- Clicks, drag, scroll, pinch-to-zoom
- Notarized build; drag to Applications, grant Accessibility
- **No kext, no reboot, no security downgrade**

Caveat: small project (179 stars, 32 commits, 31 open issues). Tested displays
are Iiyama/3M, not a Samsung Flip. Unknown until tried.

### Path 2 — UPDD V7 (only if Touch-Up fails)

Commercial, universal binary, native M4. **But** it ships a codeless kernel
extension, which on Apple Silicon requires booting into 1TR recovery and
downgrading to **Reduced Security** to allow third-party kexts.

That is a permanent security posture change on the primary work laptop in
exchange for a whiteboard. Weigh it seriously; prefer path 3.

### Path 3 — thin client (last resort)

Mac keeps Claude Code + canvas server; a cheap N100 mini PC behind the Flip runs
Chromium kiosk against `http://<mac>.local:3000` over HDMI + USB touch. Linux
does 20-point HID multitouch natively, no drivers, full multi-user.

Cost: an extra box, and the canvas server currently binds `127.0.0.1` **with no
authentication** — exposing it on the LAN means an unauthenticated canvas on the
network. Tunnel over SSH or restrict to a trusted VLAN.

## Test plan

1. Cable HDMI + USB upstream. Confirm video (expected to just work).
2. Install Touch-Up, grant Accessibility, check the Flip is recognized.
3. Test in Excalidraw: single-point draw, drag, pinch-zoom, pen vs finger.
4. Solid → done, one machine. Janky → path 3, not path 2.

## Gotchas

- **Don't use the Flip's annotate-over-HDMI overlay.** Those strokes live in
  Flip-land where the agent cannot see them. Keep everything inside the canvas
  app so touch passes through.
- **Power:** the front USB-C is 65W PD; the 16" M4 Max ships with 140W. It will
  hold at idle but not keep up under load. Don't rely on it as sole power.
- **Touch cable:** touch is a separate USB-B upstream port. Don't assume it
  rides the USB-C video link — test both, expect to need the upstream cable.
- **Scaling:** 3840x2160 on 75" is tiny at arm's length. Set a deliberate
  display scale on the driving machine and lean on Excalidraw's own zoom.
  Deliberately _not_ an in-app concern: archboard has no large-display mode and
  does not need one yet.

## Not worth pursuing

- **Flip's native Whiteboard app** — `.iwb` is proprietary and undocumented; no
  API to push content in. Import from an SMB network drive works (images,
  `.iwb`, PDF/DOC/PPT/XLS) but is one-way and manual.
- **A native Tizen app** — the signage custom-app flow requires a Samsung
  Partner certificate; personal Tizen dev certs do not work.
- **MDC** (RJ45, TCP 1515) — power, input source, volume only. No content
  access. Could be useful glue later to wake the panel and switch input when a
  session starts: see [vgavro/samsung-mdc](https://github.com/vgavro/samsung-mdc).
