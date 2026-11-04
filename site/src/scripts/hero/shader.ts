// The hero's table, as one fragment shader. A ray from the eye meets the table, a tray sunk into
// it, or a tile that stands on either. The picture is printed on every face it meets: on the table
// and the trays' floors where the painter drew lines and labels, on a tile's top where it drew the
// card. A key light from behind and to the right shades the walls and casts soft shadows; light
// that travels along the routes draws each line during the entry and runs along it as traffic.
//
// Colour is worked in linear light and written out as sRGB, so the light adds the way light does.

import { CELL, REACH, ROUTE_TEXELS, SLOTS } from "./routes";

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
#define SLOTS ${String(SLOTS)}
#define TEXELS ${String(ROUTE_TEXELS)}
#define CELL ${CELL.toFixed(1)}
#define REACH ${REACH.toFixed(1)}

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

// The routes' straight runs, and the grid that names the runs near each cell.
uniform sampler2D uRuns;
uniform sampler2D uGrid;
uniform ivec2 uCells;

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

// Each line: its light's colour and how fast its traffic's pulses run; the part of it drawn (from,
// to), where the light that draws it stands and how bright it is, signed by its way; its length,
// how lit it is, how much traffic it carries, and how far apart its pulses run.
uniform vec4 uLineColor[LINES];
uniform vec4 uLineReveal[LINES];
uniform vec4 uLineLife[LINES];

// Each label: its box in picture units, its line and how far it shows.
uniform vec4 uLabelBox[LABELS];
uniform vec2 uLabelPose[LABELS];
uniform int uLabelCount;

out vec4 outColor;

// The page's ground, in linear light: the table fades into it at every edge.
const vec3 GROUND = vec3(0.002815, 0.002401, 0.001911);
// How far a tile's top edge is rounded off, in table units.
const float BEVEL = 0.008;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }

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

float within(vec4 r, vec2 s) {
	vec2 a = (s - r.xy) / max(r.zw - r.xy, vec2(1e-5));
	vec2 e = min(a, 1.0 - a);
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

// How far a part of a line, a distance along it, is drawn.
float drawn(int i, float s) {
	vec4 r = uLineReveal[i];
	return smoothstep(r.x - 3.0, r.x + 1.0, s) * (1.0 - smoothstep(r.y - 1.0, r.y + 3.0, s));
}

// The light a line gives at a point a distance d from it and s along it.
vec3 lineLight(int i, float d, float s, float fw) {
	vec4 colour = uLineColor[i];
	vec4 reveal = uLineReveal[i];
	vec4 life = uLineLife[i];
	float core = 1.0 - smoothstep(0.5, 1.2 + fw * 0.8, d);
	// The widest light fades out before the grid stops naming the run, so no cell's edge shows.
	float halo = (exp(-d / 4.0) * 0.5 + exp(-d / 13.0) * 0.16 + exp(-d / 30.0) * 0.06) *
		(1.0 - smoothstep(REACH * 0.5, REACH, d));

	// The light that draws the line: a bright head, a tail along the part already drawn.
	float way = sign(reveal.w);
	float behind = (reveal.z - s) * way;
	float spark = abs(reveal.w) * (behind >= 0.0 ? exp(-behind / 70.0) * 0.55 + exp(-behind / 10.0) * 1.6 : exp(behind / 2.5) * 1.6);

	// Traffic: pulses running the way the line points, each a sharp head and a fading tail.
	float pulses = 0.0;
	if (colour.w > 0.0 && life.z > 0.0) {
		float k = mod(uTime * colour.w - s + float(i) * 97.0, life.w);
		pulses = life.z * exp(-k / 38.0) * (1.0 - smoothstep(life.w - 6.0, life.w, k));
	}
	float shown = drawn(i, s);
	// A line that carries traffic keeps a little light of its own once its traffic starts.
	float energy = spark + shown * (pulses * (0.8 + life.y * 1.4) + life.y * 0.3 + life.z * 0.1);
	vec3 hot = mix(colour.rgb, vec3(1.0), 0.5);
	return (hot * core * 1.25 + colour.rgb * halo) * energy;
}

// The light of the lines near a point of the picture, and the line nearest it.
vec3 routesAt(vec2 px, float fw, out int nearest, out float nearestD, out float nearestS) {
	nearest = -1;
	nearestD = 1e9;
	nearestS = 0.0;
	ivec2 cell = ivec2(floor(px / CELL));
	if (cell.x < 0 || cell.y < 0 || cell.x >= uCells.x || cell.y >= uCells.y) return vec3(0.0);
	int base = (cell.y * uCells.x + cell.x) * (SLOTS / 4);
	int lines[4];
	float ds[4];
	float ss[4];
	for (int i = 0; i < 4; i++) {
		lines[i] = -1;
		ds[i] = 1e9;
		ss[i] = 0.0;
	}
	bool done = false;
	for (int k = 0; k < SLOTS / 4; k++) {
		if (done) break;
		int texel = base + k;
		vec4 ids = texelFetch(uGrid, ivec2(texel % TEXELS, texel / TEXELS), 0);
		for (int j = 0; j < 4; j++) {
			float id = ids[j];
			if (id < 0.0) {
				done = true;
				break;
			}
			int run = int(id + 0.5) * 2;
			vec4 a = texelFetch(uRuns, ivec2(run % TEXELS, run / TEXELS), 0);
			vec4 b = texelFetch(uRuns, ivec2((run + 1) % TEXELS, (run + 1) / TEXELS), 0);
			vec2 e = a.zw - a.xy;
			float t = clamp(dot(px - a.xy, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
			float d = length(px - a.xy - e * t);
			float s = b.x + b.y * t;
			int line = int(b.z + 0.5);
			for (int n = 0; n < 4; n++) {
				if (lines[n] == line) {
					if (d < ds[n]) {
						ds[n] = d;
						ss[n] = s;
					}
					break;
				}
				if (lines[n] < 0) {
					lines[n] = line;
					ds[n] = d;
					ss[n] = s;
					break;
				}
			}
			if (d < nearestD) {
				nearestD = d;
				nearest = line;
				nearestS = s;
			}
		}
	}
	vec3 light = vec3(0.0);
	for (int n = 0; n < 4; n++) {
		if (lines[n] < 0) break;
		light += lineLight(lines[n], ds[n], ss[n], fw);
	}
	return light;
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

void main() {
	vec2 frag = gl_FragCoord.xy;
	vec2 q = frag / uRes;
	vec3 ro = uEye;
	vec3 rd = ray(frag);
	vec3 key = normalize(vec3(0.42, 0.82, 0.38));
	vec3 fill = normalize(vec3(-0.3, 0.5, -0.8));

	// Where the ray meets the table, and the sheet's derivatives there, which every pixel takes.
	float tTable = -ro.y / min(rd.y, -1e-4);
	vec3 onTable = ro + rd * tTable;
	vec2 sheet = toSheet(onTable.xz);
	vec2 sdx = dFdx(sheet);
	vec2 sdy = dFdy(sheet);

	vec3 scene = GROUND;
	vec3 glow = vec3(0.0);
	if (rd.y < -1e-4) {
		// What the ray meets: 0 the table, 1 a tray's floor, 2 a tray's wall, 3 a tile's top, 4 its side.
		int kind = 0;
		int index = -1;
		vec3 p = onTable;
		float tHit = tTable;
		vec3 n = vec3(0.0, 1.0, 0.0);

		for (int i = 0; i < TRAYS; i++) {
			if (i >= uTrayCount) break;
			if (uTrayPose[i].x > 1e-5 && footprint(onTable.xz, uTrayBox[i], uTrayCorner) < 0.0) {
				index = i;
				break;
			}
		}
		if (index >= 0) {
			vec4 box = uTrayBox[index];
			float tFloor = (-uTrayPose[index].x - ro.y) / rd.y;
			vec3 f = ro + rd * tFloor;
			if (footprint(f.xz, box, uTrayCorner) < 0.0) {
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

		// The tile the ray meets first.
		int tileHit = -1;
		vec2 span = vec2(tHit);
		vec3 inv = 1.0 / rd;
		for (int i = 0; i < CARDS; i++) {
			if (i >= uCardCount) break;
			vec4 pose = uCardPose[i];
			if (pose.y - pose.x < 1e-4) continue;
			vec4 c = uCardBox[i];
			vec3 t0 = (vec3(c.x, pose.x, c.y) - ro) * inv;
			vec3 t1 = (vec3(c.z, pose.y, c.w) - ro) * inv;
			vec3 tn = min(t0, t1);
			vec3 tf = max(t0, t1);
			float enter = max(max(tn.x, tn.y), tn.z);
			float leave = min(min(tf.x, tf.y), tf.z);
			if (enter < leave && leave > 0.0 && enter < span.x) {
				tileHit = i;
				span = vec2(max(enter, 0.0), min(leave, tHit));
			}
		}
		if (tileHit >= 0) {
			vec4 c = uCardBox[tileHit];
			vec2 h = uCardPose[tileHit].xy;
			float along = span.x;
			for (int k = 0; k < 40; k++) {
				float d = tile(ro + rd * along, c, h);
				if (d < 0.0002) {
					p = ro + rd * along;
					n = tileNormal(p, c, h);
					tHit = along;
					kind = n.y > 0.9 ? 3 : 4;
					index = tileHit;
					break;
				}
				along += d;
				if (along > span.y) break;
			}
		}

		vec2 at = toSheet(p.xz);
		vec2 px = at * uPicture;
		float fw = max(length(sdx), length(sdy)) * uPicture.x;
		// Far away the picture softens, as a lens focused near would draw it.
		float soft = 1.0 + smoothstep(uFar * 0.95, uFar * 1.7, tHit) * 3.0;
		vec2 dx = sdx * soft;
		vec2 dy = sdy * soft;
		float light = pool(p.xz);
		vec2 lampD = (p.xz - uPointer.xy) / 1.1;
		float lamp = uPointer.z * exp(-dot(lampD, lampD));

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
				float sunk = uTrayPose[index].x;
				vec2 away = key.xz / key.y * (-p.y);
				float wall = footprint(p.xz + away, uTrayBox[index], uTrayCorner);
				shade = max(shade, smoothstep(-0.02, 0.01, wall) * 0.7);
			}
		}

		if (kind <= 1) {
			// The table, or a tray's floor: the picture printed on it, in its light.
			int nearest;
			float nearD, nearS;
			vec3 routeGlow = routesAt(px, fw, nearest, nearD, nearS);
			vec4 ink = inkAt(at, dx, dy);
			float shown = 1.0;
			float level = 0.0;
			bool owned = false;
			// A label lies over its line, so it holds back most of the line's light.
			float cover = 1.0;
			for (int i = 0; i < LABELS; i++) {
				if (i >= uLabelCount) break;
				vec4 b = uLabelBox[i];
				if (px.x >= b.x - 1.0 && px.y >= b.y - 1.0 && px.x <= b.z + 1.0 && px.y <= b.w + 1.0) {
					shown = uLabelPose[i].y;
					level = uLineLife[int(uLabelPose[i].x + 0.5)].y;
					cover = 1.0 - shown * 0.8;
					owned = true;
					break;
				}
			}
			if (!owned && nearest >= 0 && nearD < 6.0) {
				shown = drawn(nearest, nearS);
				level = uLineLife[nearest].y;
				owned = true;
			}
			if (!owned) {
				for (int i = 0; i < TRAYS; i++) {
					if (i >= uTrayCount) break;
					vec4 r = uTrayRegion[i];
					if (px.x >= r.x && px.y >= r.y && px.x <= r.z && px.y <= r.w) {
						shown = uTrayPose[i].y;
						break;
					}
				}
			}
			// A card shows only on its tile.
			for (int i = 0; i < CARDS; i++) {
				if (i >= uCardCount) break;
				if (footprint(p.xz, uCardBox[i], uCorner) < 0.0015) shown = 0.0;
			}
			ink *= shown;
			vec3 base = GROUND * (0.85 + light * 4.2 + lamp * 2.2);
			float bright = (0.74 + light * 0.4 + lamp * 0.25) * lit(level);
			vec3 surface = base * (1.0 - ink.a) + ink.rgb * bright;
			if (kind == 1) surface *= 0.86;
			scene = surface * (1.0 - shade);
			glow = routeGlow * cover * (1.0 - shade * 0.5) + vec3(0.78, 0.86, 1.0) * flash * 0.05;
		} else if (kind == 2) {
			// A tray's wall: the tray's lip, lit from the side that faces the key light.
			vec4 r = uTrayRegion[index];
			vec2 lip = (vec2(clamp(px.x, r.x + 4.0, r.z - 4.0), r.y + (r.w - r.y) * 0.6)) / uPicture;
			vec3 tone = inkAt(lip, sdx * 8.0, sdy * 8.0).rgb * 0.85 + GROUND;
			float facing = max(dot(n, key), 0.0) * 0.8 + max(dot(n, fill), 0.0) * 0.35 + 0.28;
			scene = tone * facing * (0.6 + light * 0.6) * uTrayPose[index].y;
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
			// Light from the lines near its foot spills onto its sides.
			if (top < 0.5) {
				int nearest;
				float nearD, nearS;
				glow = routesAt(px, fw, nearest, nearD, nearS) * body * 4.0 * (1.0 - top);
			}
			glow += vec3(0.85, 0.9, 1.0) * pose.w * 0.06 * (1.0 - top * 0.6);
		}

		// The far table falls into the room's dark.
		float fog = exp(-max(tHit - uFar * 1.05, 0.0) * 0.3);
		scene = mix(GROUND, scene, fog);
		glow *= mix(0.4, 1.0, fog);
	}

	// The picture lies darker behind the words, its light a little less so.
	vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
	vec2 inside = max(max(uWords.xy - q, q - uWords.zw), 0.0) * aspect;
	float words = smoothstep(0.0, 0.2, length(inside));
	float edge = smoothstep(1.0, 0.9, q.y) * smoothstep(0.0, 0.04, q.y) * smoothstep(0.0, 0.03, q.x) * smoothstep(1.0, 0.97, q.x);
	vec3 lifted = GROUND + (scene - GROUND) * uExposure * mix(0.035, 1.0, words) * edge;
	vec3 colour = lifted + glow * mix(0.12, 1.0, words) * edge;
	colour = toSrgb(shoulder(colour));
	colour += (hash2(frag + fract(uTime) * 91.0) - 0.5) / 255.0;
	outColor = vec4(colour, 1.0);
}`;
