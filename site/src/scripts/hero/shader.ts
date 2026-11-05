// The hero's table, as one fragment shader. A ray from the eye meets the table, a tray sunk into
// it, a tile that stands on either, or a label that floats on its beam. The picture is printed on
// every face it meets: on the table and the trays' floors where the painter drew their frames, on
// a tile's top where it drew the card, on a label's plate where it drew the label. A key light from
// behind and to the right shades the walls and casts soft shadows.
//
// Each line of the picture is a laser that floats above its route: it leaves its source's tile at
// the tile's own height, rises to its own, and falls into its target's. Its light lies on the table
// below it and on the tiles beside it. The light that draws each beam during the entry, and the
// packets of its traffic, run along the same route.
//
// Colour is worked in linear light and written out as sRGB, so the light adds the way light does.

import { CELL, RAMP, ROUTE_TEXELS, SHINE } from "./routes";

/** How many of each part the shader holds. The plan of the picture must fit. */
export const LIMITS = { cards: 16, trays: 4, lines: 20, labels: 20 } as const;

export const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

#define CARDS ${String(LIMITS.cards)}
#define TRAYS ${String(LIMITS.trays)}
#define LINES ${String(LIMITS.lines)}
#define LABELS ${String(LIMITS.labels)}
#define TEXELS ${String(ROUTE_TEXELS)}
#define CELL ${CELL.toFixed(1)}
#define SHINE ${SHINE.toFixed(1)}
#define RAMP ${RAMP.toFixed(1)}
// How many lines a ray takes the light of at most, the nearest it meets, and how many cells of the
// grid it crosses at most.
#define NEAR 6
#define CROSSED 24

uniform vec2 uRes;
// Seconds of traffic.
uniform float uTime;
// The eye, and its turn, its tilt down and its focal length, and how far the lens is shifted
// across and up the canvas, in canvas heights.
uniform vec3 uEye;
uniform vec3 uView;
uniform vec2 uShift;
// The picture's sheet on the table: its left edge, near edge, width and depth, in table units.
uniform vec4 uSheet;
// The picture's size in its own units.
uniform vec2 uPicture;
// How far the room's light is up, 0 to 1.
uniform float uExposure;
// How far the eye stands from the point it looks at: the lens is focused there.
uniform float uFar;
// How far the rest of the picture dims for a card under the pointer.
uniform float uFocus;
// The pointer on the table, and how much it lights.
uniform vec3 uPointer;
// Where the words stand on the canvas: left, bottom, right and top, 0..1.
uniform vec4 uWords;

// The picture at two scales: the whole of it, and a part nearer the eye.
uniform sampler2D uLevel0;
uniform sampler2D uLevel1;
uniform vec4 uRegions[2];
uniform int uLevels;

// The routes' straight runs, and the grid that names the runs near each cell: how many cells across
// and down it has, and how many texels each takes.
uniform sampler2D uRuns;
uniform sampler2D uGrid;
uniform ivec2 uCells;
uniform int uCellTexels;
// How low the light of the lowest beam reaches, and how high that of the highest, in table units.
uniform vec2 uBeamSpan;

// Each card's tile: its footprint in table units (left, near, right, far), the heights of its
// underside and its face, how far its face shows, and the flash of the light that reached it.
uniform vec4 uCardBox[CARDS];
uniform vec4 uCardPose[CARDS];
uniform float uCardLit[CARDS];
uniform int uCardCount;
uniform float uCorner;

// Each tray: its floor's footprint in table units, its region with its tab in picture units,
// and how deep it is sunk and how far it shows.
uniform vec4 uTrayBox[TRAYS];
uniform vec4 uTrayRegion[TRAYS];
uniform vec2 uTrayPose[TRAYS];
uniform int uTrayCount;
uniform float uTrayCorner;

// Each line: its light's colour and how fast its traffic's packets run; the part of it drawn
// (from, to), where the light that draws it stands and how bright it is, signed by its way; its
// length, how lit it is, how much traffic it carries, and how far apart its packets run.
uniform vec4 uLineColor[LINES];
uniform vec4 uLineReveal[LINES];
uniform vec4 uLineLife[LINES];
// Each line's beam: how high its ends are, at its source's tile and at its target's, how high it
// floats between, in table units, and how thick it is. A dotted line's beam is a string of beads.
uniform vec4 uLineBeam[LINES];

// Each label: its box in picture units; its line, how far it shows, and how far along the line.
uniform vec4 uLabelBox[LABELS];
uniform vec3 uLabelPose[LABELS];
uniform int uLabelCount;

out vec4 outColor;

// The page's ground, in linear light: the table fades into it at every edge.
const vec3 GROUND = vec3(0.002815, 0.002401, 0.001911);
// How far a tile's top edge is rounded off, in table units.
const float BEVEL = 0.008;
// How wide a beam's white-hot core is, and how far its glow spreads, in table units.
const float CORE = 0.0024;
const float GLOW = 0.016;
// How bright the smoke about a beam burns, and how much of what lies behind it hides.
const float HAZE = 1.0;
const float VEIL = 0.5;
// How far ahead of a front of a beam's light, where it runs, its core lights, in the picture's units.
const float SHARP = 2.5;
// About how high the beams float, in table units: the light they shed falls off from there.
const float FLOAT = 0.04;
// How far the light a beam sheds on what lies below it reaches, in the picture's units.
const float SHED = 12.0;
// How much of a beam's light the table and the trays' floors give back.
const float POOL = 0.07;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }

// A value from 0 to 1 for each cell of a grid, the same at every frame.
float cellHash(vec2 cell) {
	uvec2 q = uvec2(ivec2(cell)) * uvec2(1597334673u, 3812015801u);
	return float((q.x ^ q.y) * 1597334673u) * (1.0 / 4294967296.0);
}

// Smooth noise, from 0 to 1.
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 w = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(cellHash(i), cellHash(i + vec2(1.0, 0.0)), w.x),
		mix(cellHash(i + vec2(0.0, 1.0)), cellHash(i + vec2(1.0, 1.0)), w.x),
		w.y
	);
}

// Smooth noise in three octaves, from 0 to 1.
float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int o = 0; o < 3; o++) {
		v += a * noise(p);
		p = p * 2.03 + vec2(17.3, 9.1);
		a *= 0.5;
	}
	return v / 0.875;
}

// The smoke a beam's heat lifts, from 0 to 1: noise folded through noise, so that it curls, carried
// up and along as time runs.
float smokeAt(vec2 q, float time) {
	vec2 fold = vec2(fbm(q + vec2(0.0, -0.7 * time)), fbm(q * 1.3 + vec2(5.2, 1.3 - 0.5 * time)));
	return fbm(q + 1.7 * fold + vec2(-0.35 * time, -0.8 * time));
}

vec3 toSrgb(vec3 c) {
	c = max(c, 0.0);
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// Bright light rolls off instead of clipping; the picture's own colours stay as they are.
vec3 shoulder(vec3 c) {
	const float k = 0.82;
	vec3 over = max(c - k, 0.0);
	return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}

vec3 ray(vec2 frag) {
	vec2 uv = (frag - 0.5 * uRes) / uRes.y - uShift;
	vec3 d = normalize(vec3(uv.x, uv.y, uView.z));
	float cp = cos(uView.y), sp = sin(uView.y);
	d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
	float cy = cos(uView.x), sy = sin(uView.x);
	return vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
}

vec2 toSheet(vec2 xz) {
	return vec2((xz.x - uSheet.x) / uSheet.z, 1.0 - (xz.y - uSheet.y) / uSheet.w);
}

// Where a point of the picture, in its units, lies on the table.
vec2 toTable(vec2 px) {
	return vec2(uSheet.x + px.x / uPicture.x * uSheet.z, uSheet.y + (1.0 - px.y / uPicture.y) * uSheet.w);
}

// A point's distance from a rounded footprint, negative inside it.
float footprint(vec2 p, vec4 c, float corner) {
	vec2 size = (c.zw - c.xy) * 0.5;
	float r = min(corner, min(size.x, size.y));
	vec2 q = abs(p - (c.xy + c.zw) * 0.5) - size + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 footprintNormal(vec2 p, vec4 c, float corner) {
	vec2 e = vec2(0.0006, 0.0);
	return normalize(vec2(
		footprint(p + e.xy, c, corner) - footprint(p - e.xy, c, corner),
		footprint(p + e.yx, c, corner) - footprint(p - e.yx, c, corner)
	) + 1e-9);
}

// A point's distance from a tile: its footprint raised between two heights, its top edge rounded.
float tile(vec3 p, vec4 c, vec2 h) {
	float rise = (h.y - h.x) * 0.5;
	float bevel = min(BEVEL, rise);
	vec2 w = vec2(footprint(p.xz, c, uCorner) + bevel, abs(p.y - (h.x + h.y) * 0.5) - rise + bevel);
	return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - bevel;
}

vec3 tileNormal(vec3 p, vec4 c, vec2 h) {
	vec2 e = vec2(0.0007, -0.0007);
	return normalize(
		e.xyy * tile(p + e.xyy, c, h) + e.yyx * tile(p + e.yyx, c, h) +
		e.yxy * tile(p + e.yxy, c, h) + e.xxx * tile(p + e.xxx, c, h)
	);
}

vec4 level(sampler2D t, vec4 r, vec2 s, vec2 dx, vec2 dy) {
	vec2 k = 1.0 / (r.zw - r.xy);
	return textureGrad(t, (s - r.xy) * k, dx * k, dy * k);
}

// How much the near image serves a point of the sheet: all of it inside its part, less near an
// edge of the part, where it blends into the whole picture's image. An edge that the part shares
// with the picture needs no blend, as nothing lies past it.
float within(vec4 r, vec2 s) {
	vec2 a = (s - r.xy) / max(r.zw - r.xy, vec2(1e-5));
	vec2 low = mix(a, vec2(1.0), step(r.xy, vec2(1e-4)));
	vec2 high = mix(1.0 - a, vec2(1.0), step(vec2(1.0 - 1e-4), r.zw));
	vec2 e = min(low, high);
	return smoothstep(0.0, 0.04, min(e.x, e.y));
}

// The picture at a point of its sheet, premultiplied, from the finest image that holds it.
vec4 inkAt(vec2 s, vec2 dx, vec2 dy) {
	if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) return vec4(0.0);
	vec4 ink = level(uLevel0, uRegions[0], s, dx, dy);
	if (uLevels > 1) {
		float near = within(uRegions[1], s);
		if (near > 0.0) ink = mix(ink, level(uLevel1, uRegions[1], s, dx, dy), near);
	}
	return ink;
}

// How far a part of a line, a distance along it, is drawn, as light that reaches \`lead\` past the
// ends of the drawn part.
float drawn(int i, float s, float lead) {
	vec4 r = uLineReveal[i];
	return smoothstep(r.x - lead, r.x + 1.0, s) * (1.0 - smoothstep(r.y - 1.0, r.y + lead, s));
}

// How high a line's beam floats a distance along it: it leaves its source's tile at the tile's
// own height, rises to its own over the first RAMP of its route, and falls to its target's over
// the last.
float beamHeight(int i, float s) {
	vec4 beam = uLineBeam[i];
	float leave = 1.0 - smoothstep(0.0, RAMP, s);
	float arrive = 1.0 - smoothstep(0.0, RAMP, uLineLife[i].x - s);
	return beam.z + (beam.x - beam.z) * leave + (beam.y - beam.z) * arrive;
}

// How bright a line's beam burns a distance along it: the light that draws it during the entry,
// a steady burn once it is drawn, and the packets of its traffic, of which how much is there comes
// out as well. Where the light runs, its front reaches \`lead\` ahead of it: sharp at the core, and
// wider farther from it, as the light there comes from more of the beam, so that a packet swells
// into the smoke instead of cutting through it. A card under the pointer brightens its own beams
// and dims the rest.
float beamEnergy(int i, float s, float lead, out float packet) {
	vec4 colour = uLineColor[i];
	vec4 reveal = uLineReveal[i];
	vec4 life = uLineLife[i];
	float way = sign(reveal.w);
	float behind = (reveal.z - s) * way;
	float spark = abs(reveal.w) * (behind >= 0.0 ? exp(-behind / 70.0) * 0.55 + exp(-behind / 10.0) * 1.6 : exp(behind / lead) * 1.6);
	packet = 0.0;
	if (colour.w > 0.0 && life.z > 0.0) {
		// How far behind its packet's head the point lies; ahead of the head, it is less than none.
		float k = mod(uTime * colour.w - s + float(i) * 97.0, life.w);
		float d = k > life.w - 100.0 ? k - life.w : k;
		packet = life.z * exp(-max(d, 0.0) / 38.0) * exp(min(d, 0.0) / lead);
	}
	float focus = mix(1.0, mix(0.3, 1.5, life.y), uFocus);
	return spark + drawn(i, s, lead) * (0.6 + packet * 1.5) * focus;
}

// The floor of a tray as the painter drew it, from a corner of its frame that no card covers.
vec4 trayFloor(int i, vec2 sdx, vec2 sdy) {
	vec4 r = uTrayRegion[i];
	return inkAt(vec2(r.z - 14.0, r.w - 14.0) / uPicture, sdx * 2.0, sdy * 2.0);
}

// How much smoke a beam lifts at a point of the straight stretch it lies on, from where the stretch
// starts along the line and how long it is: most at the middle of a long stretch, none at a bend
// or an end, and more on some stretches than on others. A screen shows faint light brighter than
// its share, so the smoke gathers slowly from a bend, or it would seem to start at once.
float lengthwise(int i, float s, vec2 stretch) {
	float u = clamp((s - stretch.x) / max(stretch.y, 1e-3), 0.0, 1.0);
	float some = 0.6 + 0.4 * cellHash(vec2(float(i) * 31.0, stretch.x));
	return pow(4.0 * u * (1.0 - u), 1.8) * stretch.y / (stretch.y + 120.0) * some;
}

// The light of a line's beam where a ray passes it, from \`pass\`: how far off its axis, how far along
// the line, how far along the ray, and how far above the axis, square to it. A beam is a laser: a
// white-hot core, a glow of its colour close about it, and smoke that its heat lifts, which billows
// up off it and drifts the way its light runs, by \`smoke\` as much as the stretch of the line lifts.
// The smoke is densest at the axis and thins away from it as a bell, which is all but gone well
// before the beam's reach, so its faint outer smoke shows no edge. Far from the axis only its
// thickest wisps show, and they fade out as the bell does, so it ends ragged, not round. It hides some
// of what lies behind it, which comes out as the fourth part. Each beam flickers on its own, and it
// flares where it strikes its target, which shows its way in a still picture. A dotted line's beam
// is a string of beads of the same light, which drift the same way. No light is drawn finer than a
// pixel, so a far beam keeps its light instead of flickering.
vec4 beamGlow(int i, vec4 pass, float smoke, float packet, float burn, float halo, float cone) {
	float off = pass.x;
	float s = pass.y;
	vec3 colour = uLineColor[i].rgb;
	float thick = uLineBeam[i].w;
	float unit = uSheet.z / uPicture.x;
	float reach = SHINE * unit;
	float phase = float(i) * 7.3;
	float r = off;
	float size = thick;
	float smoky = 1.0;
	float strike = exp(-(uLineLife[i].x - s) / 4.0) * 1.6 + exp(-s / 4.0) * 0.4;
	if (thick <= 0.0) {
		float k = s - uTime * 6.0;
		float along = (k - 12.0 * floor(k / 12.0 + 0.5)) * unit;
		r = length(vec2(off, along));
		size = 0.5;
		smoky = 0.35;
		strike = 0.0;
	}
	float rc = CORE * size * (1.0 + 0.5 * packet);
	float aa = max(rc, pass.z * cone * 0.8);
	float core = rc / aa * exp(-r * r / (aa * aa));
	float rg = GLOW * size;
	float x = off / reach;
	float glow = pow(rg / max(r, aa), 0.9) * exp(-r / rg) * (1.0 - smoothstep(0.6, 1.0, x));
	float haze = 0.0;
	float thin = 1.0 - min(x * x, 1.0);
	float body = exp(-x * x * 4.0) * thin * thin * smoke * smoky;
	if (body > 0.002) {
		vec2 q = vec2(s / 30.0 - uTime * 0.5, pass.w / unit / 16.0 - uTime * 0.4 + phase);
		float wisp = smoothstep(0.25 + 0.25 * x, 0.9, smokeAt(q, uTime * 0.5));
		float rise = smoothstep(-0.45, 0.35, pass.w / reach);
		float puff = 0.5 + 0.7 * noise(vec2(s / 110.0 - uTime * 0.35, phase + 2.0));
		haze = body * (0.12 + 0.88 * wisp) * rise * puff;
	}
	float flow = 0.8 + 0.4 * noise(vec2(s * 0.045 - uTime * 2.6, phase));
	float flicker = 0.8 + 0.2 * noise(vec2(uTime * 7.0, phase + 4.0));
	vec3 hot = mix(colour, vec3(1.0), 0.8);
	vec3 light = hot * core * 3.0 * burn + colour * (glow * 0.5 * flow + haze * HAZE) * halo;
	return vec4(light * (1.0 + strike) * flicker, haze * VEIL * flicker * min(halo, 1.0));
}

// The beams near a ray. The light it sees of them comes out as \`seen\`, how much of what lies behind
// it their smoke hides as \`veil\`, and what they shed on the point it meets, p, which faces n, at
// tHit along it, as \`shed\`. A beam glows around its core wherever the ray meets the table, which
// lies below every beam, but a tile or a label in front of it hides it, as \`solid\` says the ray met
// one, and so does the top of one that stands above it. A label's plate covers its own beam by
// \`cover\`.
void beams(vec3 ro, vec3 rd, float tHit, vec3 p, vec3 n, float cone, bool solid, int covered, float cover, out vec3 seen, out float veil, out vec3 shed) {
	seen = vec3(0.0);
	veil = 0.0;
	shed = vec3(0.0);
	// For each line near: the point of its beam nearest the ray's line (how far off, how far along
	// the line and along the ray, and how far above the beam), and the point of its route nearest p
	// (how far, how far along the line, and where on the table). When more lines are near than it
	// holds, the nearest stay.
	int lines[NEAR];
	int passed[NEAR];
	vec4 passing[NEAR];
	vec4 nearest[NEAR];
	for (int k = 0; k < NEAR; k++) {
		lines[k] = -1;
		passed[k] = 0;
		passing[k] = vec4(1e9);
		nearest[k] = vec4(1e9);
	}
	// The ray's way across the grid, through the heights the beams' light fills, or to the tile or
	// label it meets, which hides every beam behind it. Each cell it crosses names every run whose
	// light reaches that cell.
	float tTop = max((uBeamSpan.y - ro.y) / rd.y, 0.0);
	float tBottom = max(solid ? min((uBeamSpan.x - ro.y) / rd.y, tHit + 0.004) : (uBeamSpan.x - ro.y) / rd.y, tTop);
	vec2 a = toSheet((ro + rd * tTop).xz) * uPicture / CELL;
	vec2 way = toSheet((ro + rd * tBottom).xz) * uPicture / CELL - a;
	ivec2 cell = ivec2(floor(a));
	ivec2 go = ivec2(sign(way));
	vec2 delta = vec2(abs(way.x) > 1e-6 ? 1.0 / abs(way.x) : 1e9, abs(way.y) > 1e-6 ? 1.0 / abs(way.y) : 1e9);
	vec2 next = vec2(way.x > 0.0 ? float(cell.x + 1) - a.x : a.x - float(cell.x), way.y > 0.0 ? float(cell.y + 1) - a.y : a.y - float(cell.y)) * delta;
	for (int c = 0; c < CROSSED; c++) {
		if (cell.x >= 0 && cell.y >= 0 && cell.x < uCells.x && cell.y < uCells.y) {
			int base = (cell.y * uCells.x + cell.x) * uCellTexels;
			bool done = false;
			for (int k = 0; k < uCellTexels; k++) {
				if (done) break;
				int texel = base + k;
				vec4 ids = texelFetch(uGrid, ivec2(texel % TEXELS, texel / TEXELS), 0);
				for (int j = 0; j < 4; j++) {
					float id = ids[j];
					if (id < 0.0) {
						done = true;
						break;
					}
					int run = int(id + 0.5) * 3;
					vec4 ra = texelFetch(uRuns, ivec2(run % TEXELS, run / TEXELS), 0);
					vec4 rb = texelFetch(uRuns, ivec2((run + 1) % TEXELS, (run + 1) / TEXELS), 0);
					int line = int(rb.z + 0.5);
					vec2 a2 = toTable(ra.xy);
					vec2 b2 = toTable(ra.zw);
					vec3 from = vec3(a2.x, beamHeight(line, rb.x), a2.y);
					vec3 e = vec3(b2.x, beamHeight(line, rb.x + rb.y), b2.y) - from;
					float span = max(length(e), 1e-6);
					vec3 u = e / span;
					// The points of the run and of the ray's line that lie nearest each other.
					vec3 w = ro - from;
					float cu = dot(u, rd);
					float wr = dot(rd, w);
					float wu = dot(u, w);
					float t = max((cu * wu - wr) / max(1.0 - cu * cu, 1e-5), 0.0);
					float along = clamp(wu + cu * t, 0.0, span);
					t = max(cu * along - wr, 0.0);
					along = clamp(wu + cu * t, 0.0, span);
					vec3 d = ro + rd * t - from - u * along;
					float off = length(d);
					// The line's slot: its own, a free one, or that of the farthest line, if this is nearer.
					int slot = -1;
					int far = 0;
					for (int m = 0; m < NEAR; m++) {
						if (lines[m] == line || lines[m] < 0) {
							slot = m;
							break;
						}
						if (passing[m].x > passing[far].x) far = m;
					}
					if (slot < 0) {
						if (off >= passing[far].x) continue;
						slot = far;
						passing[slot] = vec4(1e9);
						nearest[slot] = vec4(1e9);
					}
					lines[slot] = line;
					if (off < passing[slot].x) {
						vec3 up = vec3(0.0, 1.0, 0.0) - u * u.y;
						passing[slot] = vec4(off, rb.x + rb.y * along / span, t, dot(d, up) / max(length(up), 1e-4));
						passed[slot] = run;
					}
					// The run's point nearest p, across the table.
					vec2 e2 = b2 - a2;
					float f = clamp(dot(p.xz - a2, e2) / max(dot(e2, e2), 1e-12), 0.0, 1.0);
					vec2 point = a2 + e2 * f;
					float dp = length(p.xz - point);
					if (dp < nearest[slot].x) nearest[slot] = vec4(dp, rb.x + rb.y * f, point);
				}
			}
		}
		if (min(next.x, next.y) > 1.0) break;
		if (next.x < next.y) {
			next.x += delta.x;
			cell.x += go.x;
		} else {
			next.y += delta.y;
			cell.y += go.y;
		}
	}
	float unit = uSheet.z / uPicture.x;
	// The top of a tile or a label's plate hides a beam that runs below it.
	float top = solid ? smoothstep(0.85, 0.95, n.y) : 0.0;
	for (int k = 0; k < NEAR; k++) {
		int i = lines[k];
		if (i < 0) break;
		vec4 pass = passing[k];
		float hidden = 0.0;
		if (solid) {
			float under = 1.0 - smoothstep(-0.003, 0.003, beamHeight(i, pass.y) - p.y);
			hidden = max(smoothstep(-0.004, 0.004, pass.z - tHit), top * under);
		}
		// The core burns with the light where it runs, and the glow and the smoke about it with the
		// light of the beam around, which reaches farther ahead the farther from the axis they lie.
		float keep = (1.0 - hidden) * (i == covered ? 1.0 - cover : 1.0);
		float packet, swell;
		float burn = beamEnergy(i, pass.y, SHARP, packet) * keep;
		float halo = beamEnergy(i, pass.y, SHARP + 1.5 * pass.x / unit, swell) * keep;
		if (halo > 0.0) {
			int run = passed[k] + 2;
			vec2 stretch = texelFetch(uRuns, ivec2(run % TEXELS, run / TEXELS), 0).xy;
			vec4 light = beamGlow(i, pass, lengthwise(i, pass.y, stretch), packet, burn, halo, cone);
			seen += light.rgb;
			veil += light.a;
		}
		// The light it sheds on p, from where its route passes nearest, at its height there.
		vec4 near = nearest[k];
		vec3 toward = vec3(near.z - p.x, beamHeight(i, near.y) - p.y, near.w - p.z);
		float apart = max(length(toward), 1e-5);
		float facing = max(dot(n, toward) / apart, 0.0);
		float glowing;
		float there = beamEnergy(i, near.y, SHARP + 1.5 * near.x / unit, glowing);
		float reach = 1.0 - smoothstep(SHED * 0.5, SHED, near.x / unit);
		float strength = uLineBeam[i].w > 0.0 ? 1.0 : 0.3;
		shed += uLineColor[i].rgb * there * facing * FLOAT / max(apart, FLOAT * 0.35) * reach * strength;
	}
	veil = min(veil, 0.6);
}

// How lit a part is, as the pointer's card dims the rest.
float lit(float level) {
	return mix(1.0, mix(0.34, 1.0, level), uFocus);
}

// The key light's pool on the table: brightest over the picture, falling into the room's dark.
float pool(vec2 xz) {
	vec2 middle = vec2(uSheet.x + uSheet.z * 0.55, uSheet.y + uSheet.w * 0.45);
	vec2 d = (xz - middle) / vec2(uSheet.z * 0.7, uSheet.w * 1.1);
	return exp(-dot(d, d));
}

// The rays an edge's pixel takes, in pixels from its middle: its own, then four in a rotated grid.
const vec2 RAYS[5] = vec2[5](vec2(0.0), vec2(0.125, 0.375), vec2(0.375, -0.125), vec2(-0.125, -0.375), vec2(-0.375, 0.125));

// What the ray through a point of the canvas meets, lit: the surface, and the light the beams give
// over it. How near the point lies to the outline of a tile, a tray or a label comes out too, in
// pixels, so that a pixel near none takes its one ray. The sheet's derivatives, and how far a pixel
// reaches across the table, are the pixel's own, which each of its rays takes.
void trace(vec2 frag, vec2 sdx, vec2 sdy, float pixel, out vec3 scene, out vec3 glow, out float edge) {
	vec3 ro = uEye;
	vec3 rd = ray(frag);
	vec3 key = normalize(vec3(0.42, 0.82, 0.38));
	vec3 fill = normalize(vec3(-0.3, 0.5, -0.8));
	scene = GROUND;
	glow = vec3(0.0);
	edge = 1e9;
	if (rd.y >= -1e-4) return;
	// How wide a pixel is, per unit of distance along the ray, and across the picture.
	float cone = 1.0 / (uRes.y * uView.z);
	float fw = max(length(sdx), length(sdy)) * uPicture.x;
	float tTable = -ro.y / rd.y;
	vec3 onTable = ro + rd * tTable;

	// What the ray meets: 0 the table, 1 a tray's floor, 2 a tray's wall, 3 a tile's top, 4 its
	// side, 5 a label's plate.
	int kind = 0;
	int index = -1;
	vec3 p = onTable;
	float tHit = tTable;
	vec3 n = vec3(0.0, 1.0, 0.0);

	for (int i = 0; i < TRAYS; i++) {
		if (i >= uTrayCount) break;
		if (uTrayPose[i].x <= 1e-5) continue;
		float rim = footprint(onTable.xz, uTrayBox[i], uTrayCorner);
		edge = min(edge, abs(rim) / pixel);
		if (rim < 0.0) index = i;
	}
	if (index >= 0) {
		vec4 box = uTrayBox[index];
		float tFloor = (-uTrayPose[index].x - ro.y) / rd.y;
		vec3 f = ro + rd * tFloor;
		float below = footprint(f.xz, box, uTrayCorner);
		edge = min(edge, abs(below) / pixel);
		if (below < 0.0) {
			kind = 1;
			p = f;
			tHit = tFloor;
		} else {
			// The ray leaves the well on its way down: it meets the far wall.
			float a = tTable, b = tFloor;
			for (int k = 0; k < 12; k++) {
				float m = 0.5 * (a + b);
				if (footprint((ro + rd * m).xz, box, uTrayCorner) < 0.0) a = m;
				else b = m;
			}
			kind = 2;
			tHit = a;
			p = ro + rd * a;
			vec2 out2 = footprintNormal(p.xz, box, uTrayCorner);
			n = normalize(vec3(-out2.x, 0.0, -out2.y));
		}
	}

	// The tile the ray meets first. Each tile's box is grown by a few pixels, so a ray that passes
	// close by a tile without meeting it marks the tile's outline as well.
	int tileHit = -1;
	float ground = p.y;
	float margin = 3.0 * uFar * cone;
	vec3 inv = 1.0 / rd;
	for (int i = 0; i < CARDS; i++) {
		if (i >= uCardCount) break;
		vec4 pose = uCardPose[i];
		if (pose.y - pose.x < 1e-4) continue;
		vec4 c = uCardBox[i];
		vec3 t0 = (vec3(c.x - margin, pose.x, c.y - margin) - ro) * inv;
		vec3 t1 = (vec3(c.z + margin, pose.y + margin, c.w + margin) - ro) * inv;
		vec3 tn = min(t0, t1);
		vec3 tf = max(t0, t1);
		float enter = max(max(tn.x, tn.y), tn.z);
		float leave = min(min(tf.x, tf.y), tf.z);
		if (enter >= leave || leave <= 0.0 || enter >= tHit) continue;
		float along = max(enter, 0.0);
		float end = min(leave, tHit);
		// How near the ray comes to the tile, in pixels, if it does not meet it.
		float closest = 1e9;
		bool met = false;
		for (int k = 0; k < 48; k++) {
			float d = tile(ro + rd * along, c, pose.xy);
			float wide = along * cone;
			if (d < 0.2 * wide) {
				met = true;
				break;
			}
			closest = min(closest, d / wide);
			along += d;
			if (along > end) break;
		}
		if (met) {
			tileHit = i;
			tHit = along;
		} else {
			edge = min(edge, min(closest, tile(ro + rd * end, c, pose.xy) / (end * cone)));
		}
	}
	if (tileHit >= 0) {
		vec2 h = uCardPose[tileHit].xy;
		p = ro + rd * tHit;
		n = tileNormal(p, uCardBox[tileHit], h);
		kind = n.y > 0.9 ? 3 : 4;
		index = tileHit;
		// On its rounded top edge, on a side seen edge on, or where it meets what it rises through, the
		// tile's outline is near.
		if ((n.y > 0.02 && n.y < 0.995) || abs(dot(n, rd)) < 0.3 || p.y - max(h.x, ground) < 1.5 * tHit * cone) edge = 0.0;
	}

	// A label floats on its beam: a plate at the beam's height where the label sits.
	float plate = 0.0;
	for (int i = 0; i < LABELS; i++) {
		if (i >= uLabelCount) break;
		vec3 pose = uLabelPose[i];
		if (pose.y <= 0.002) continue;
		float t = (beamHeight(int(pose.x + 0.5), pose.z) - ro.y) / rd.y;
		if (t <= 0.0 || t >= tHit) continue;
		vec3 there = ro + rd * t;
		float d = footprint(toSheet(there.xz) * uPicture, uLabelBox[i], 4.0);
		edge = min(edge, abs(d) / fw);
		if (d < 0.0) {
			kind = 5;
			index = i;
			tHit = t;
			p = there;
			n = vec3(0.0, 1.0, 0.0);
			plate = d;
		}
	}

	vec2 at = toSheet(p.xz);
	vec2 px = at * uPicture;
	// Far away the picture softens, as a lens focused near would draw it.
	float soft = 1.0 + smoothstep(uFar * 0.95, uFar * 1.7, tHit) * 3.0;
	vec2 dx = sdx * soft;
	vec2 dy = sdy * soft;
	float light = pool(p.xz);
	vec2 lampD = (p.xz - uPointer.xy) / 1.1;
	float lamp = uPointer.z * exp(-dot(lampD, lampD));

	// The beams the ray passes, and the light they shed where it ends. A label covers its own beam.
	vec3 seen, shed;
	float veil;
	int covered = kind == 5 ? int(uLabelPose[index].x + 0.5) : -1;
	float cover = kind == 5 ? uLabelPose[index].y : 0.0;
	beams(ro, rd, tHit, p, n, cone, kind >= 3, covered, cover, seen, veil, shed);

	// Shade on the table and the trays' floors: the tiles' soft shadows away from the key light,
	// and the dark of a tray's wall on the floor below it.
	float shade = 0.0;
	float flash = 0.0;
	if (kind <= 1) {
		for (int i = 0; i < CARDS; i++) {
			if (i >= uCardCount) break;
			vec4 pose = uCardPose[i];
			float tall = pose.y - max(pose.x, p.y);
			if (tall <= 1e-4 && pose.w <= 0.0) continue;
			vec4 c = uCardBox[i];
			float d0 = footprint(p.xz, c, uCorner);
			if (tall > 1e-4) {
				// Toward the light, the ray from this point passes the tile between its foot and its face.
				vec2 away = key.xz / key.y * (pose.y - p.y);
				float d = footprint(p.xz + away * 0.5, c, uCorner) - length(away) * 0.5;
				float soft2 = 0.012 + (pose.y - p.y) * 0.5;
				shade = max(shade, (1.0 - smoothstep(-soft2, soft2, d)) * min(1.0, tall * 26.0) * 0.55);
				// The dark where a tile meets what it stands on.
				shade = max(shade, exp(-max(d0, 0.0) / 0.018) * min(1.0, tall * 30.0) * 0.5);
			}
			flash += pose.w * exp(-max(d0, 0.0) / 0.05) * step(0.0, d0);
		}
		if (kind == 1) {
			vec2 away = key.xz / key.y * (-p.y);
			float wall = footprint(p.xz + away, uTrayBox[index], uTrayCorner);
			shade = max(shade, smoothstep(-0.02, 0.01, wall) * 0.45);
		}
	}

	if (kind <= 1) {
		// The table, or a tray's floor: the picture printed on it, in its light, and the light of
		// the beams above it. What the painter drew of a tray, a card or a label blurs past its edge
		// by about a pixel of the picture, and the ink reads it across what a pixel of the screen
		// covers, so each of them takes its print off the floor that much farther out.
		vec4 ink = inkAt(at, dx, dy);
		float open = 1.0;
		vec4 under = vec4(0.0);
		float reads = fw * soft;
		for (int i = 0; i < TRAYS; i++) {
			if (i >= uTrayCount) break;
			vec4 r = uTrayRegion[i] + vec4(-1.0, -1.0, 1.0, 1.0) * (0.5 + 1.5 * reads);
			if (px.x >= r.x && px.y >= r.y && px.x <= r.z && px.y <= r.w) {
				open = uTrayPose[i].y;
				if (kind == 1) under = trayFloor(i, sdx, sdy);
				break;
			}
		}
		// A card shows only on its tile, and a label only on its plate. Below either lies the floor
		// it stands on.
		float bare = 1.0;
		float unit = uSheet.z / uPicture.x;
		for (int i = 0; i < CARDS; i++) {
			if (i >= uCardCount) break;
			bare *= clamp((footprint(p.xz, uCardBox[i], uCorner) - 0.5 * unit) / (reads * unit) - 0.5, 0.0, 1.0);
		}
		for (int i = 0; i < LABELS; i++) {
			if (i >= uLabelCount) break;
			bare *= clamp((footprint(px, uLabelBox[i], 4.0) - 2.5) / fw + 0.5, 0.0, 1.0);
		}
		ink = mix(under, ink, bare) * open;
		vec3 base = GROUND * (0.85 + light * 4.2 + lamp * 2.2);
		float bright = (0.74 + light * 0.4 + lamp * 0.25) * lit(0.0);
		vec3 surface = base * (1.0 - ink.a) + ink.rgb * bright;

		scene = surface * (1.0 - shade);
		glow = shed * POOL * (1.0 - shade * 0.5) + vec3(0.78, 0.86, 1.0) * flash * 0.05;
	} else if (kind == 2) {
		// A tray's wall: the tone of its floor, lit from the side that faces the key light.
		vec3 tone = trayFloor(index, sdx, sdy).rgb * 0.85 + GROUND;
		float facing = max(dot(n, key), 0.0) * 0.8 + max(dot(n, fill), 0.0) * 0.35 + 0.28;
		scene = tone * facing * (0.8 + light * 0.7) * uTrayPose[index].y;
		glow = shed * POOL * 0.25;
	} else if (kind == 5) {
		// A label: its plate as the painter drew it, floating on its beam, its rim lit by the beam.
		vec3 pose = uLabelPose[index];
		int line = int(pose.x + 0.5);
		vec4 chip = inkAt(at, dx, dy);
		vec3 behind = GROUND * (0.85 + light * 4.2 + lamp * 2.2);
		float bright = (0.8 + light * 0.4 + lamp * 0.25) * lit(uLineLife[line].y);
		scene = mix(behind, behind * (1.0 - chip.a) + chip.rgb * bright, pose.y);
		float burning;
		glow = uLineColor[line].rgb * exp(plate / 1.6) * 0.35 * pose.y * beamEnergy(line, pose.z, 24.0, burning);
	} else {
		// A tile: its top is the card as the painter drew it, its sides the card's own tone.
		vec4 c = uCardBox[index];
		vec4 pose = uCardPose[index];
		float card = lit(uCardLit[index]);
		vec2 corner = vec2(c.z - 0.035, c.y + 0.03);
		vec3 body = inkAt(toSheet(corner), sdx * 6.0, sdy * 6.0).rgb;
		float top = smoothstep(0.86, 0.985, n.y);
		vec4 face = inkAt(at, dx, dy) * pose.z;
		vec3 lift = vec3(1.0 + lamp * 0.12 + light * 0.08);
		vec3 topTone = (face.rgb + body * (1.0 - face.a)) * lift;
		float facing = max(dot(n, key), 0.0) * 1.1 + max(dot(n, fill), 0.0) * 0.35 + 0.12;
		vec3 sideTone = body * 0.7 * facing * (0.7 + light * 0.5);
		// The rounded top edge catches the key light: a thin line of light along the far side.
		vec3 mid = normalize(key - rd);
		float edgeBand = smoothstep(0.35, 0.8, n.y) * (1.0 - top);
		float shine = pow(max(dot(n, mid), 0.0), 36.0) * (1.0 - top) + edgeBand * max(dot(n, key), 0.0) * 0.35;
		scene = mix(sideTone, topTone, top) * card + vec3(0.92, 0.95, 1.0) * shine * 0.55 * card * (0.6 + light * 0.6);
		// The beams beside it light its sides, brightest where one meets it.
		glow = shed * (body * 4.0 + 0.05) * (1.0 - top * 0.7);
		glow += vec3(0.85, 0.9, 1.0) * pose.w * 0.06 * (1.0 - top * 0.6);
	}
	// The smoke in front of what the ray meets hides some of it, and its own light lies over it.
	scene *= 1.0 - veil;
	glow = glow * (1.0 - veil) + seen;

	// The far table falls into the room's dark.
	float fog = exp(-max(tHit - uFar * 1.05, 0.0) * 0.3);
	scene = mix(GROUND, scene, fog);
	glow *= mix(0.4, 1.0, fog);
}

void main() {
	vec2 frag = gl_FragCoord.xy;
	vec2 q = frag / uRes;
	// Where the pixel's ray meets the table, and the sheet's derivatives there.
	vec3 rd = ray(frag);
	vec3 onTable = uEye + rd * (-uEye.y / min(rd.y, -1e-4));
	vec2 sheet = toSheet(onTable.xz);
	vec2 sdx = dFdx(sheet);
	vec2 sdy = dFdy(sheet);
	float pixel = max(length(dFdx(onTable.xz)), length(dFdy(onTable.xz)));

	// The picture lies darker behind the words, its light a little less so.
	vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
	vec2 inside = max(max(uWords.xy - q, q - uWords.zw), 0.0) * aspect;
	float words = smoothstep(0.0, 0.2, length(inside));
	float border = (1.0 - smoothstep(0.9, 1.0, q.y)) * smoothstep(0.0, 0.04, q.y) * smoothstep(0.0, 0.03, q.x) * (1.0 - smoothstep(0.97, 1.0, q.x));
	float sceneGain = uExposure * mix(0.035, 1.0, words) * border;
	float glowGain = mix(0.12, 1.0, words) * border;

	// A pixel near no outline takes one ray; a pixel on one takes all of them, and their mean.
	vec3 colour = vec3(0.0);
	int rays = 1;
	for (int k = 0; k < rays; k++) {
		vec3 scene, glow;
		float edge;
		trace(frag + RAYS[k], sdx, sdy, pixel, scene, glow, edge);
		colour += shoulder(GROUND + (scene - GROUND) * sceneGain + glow * glowGain);
		if (k == 0 && edge <= 1.0) rays = 5;
	}
	colour = toSrgb(colour / float(rays));
	colour += (hash2(frag + fract(uTime) * 91.0) - 0.5) / 255.0;
	outColor = vec4(colour, 1.0);
}`;
