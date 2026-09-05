// The palette, ported from MyColors.swift.
//
// Blue and orange each have a saturated colour and a pale one. A played cell is
// pale with a saturated digit; the most recent move inverts that, going
// saturated with a black digit; a won section is a solid block of the saturated
// colour. In light mode the "ghost" digits marking playable cells use the pale
// colour, which is too faint to see on black, so dark mode promotes them to the
// saturated one.

export interface Palette {
  background: string;
  lightLine: string;
  heavyLine: string;
  blueFg: string;
  blueBg: string;
  oranFg: string;
  oranBg: string;
  /** The digit colour of the most recent move, in either colour. */
  recentFg: string;
  blueGhost: string;
  oranGhost: string;
  finalStrike: string;
  /** The disc marking a section won because the opponent had no move. */
  constraintMark: string;
}

const BLUE_FG = '#1C86EE';
const BLUE_BG = '#D4E5F7';
const ORAN_FG = '#FF7F00';
const ORAN_BG = '#FFD9B3';

const LIGHT: Palette = {
  background: '#FFFFFF',
  lightLine: '#808080',
  heavyLine: '#000000',
  blueFg: BLUE_FG,
  blueBg: BLUE_BG,
  oranFg: ORAN_FG,
  oranBg: ORAN_BG,
  recentFg: '#000000',
  blueGhost: BLUE_BG,
  oranGhost: ORAN_BG,
  finalStrike: '#FF0000',
  constraintMark: 'rgba(0, 0, 0, 0.1)',
};

const DARK: Palette = {
  ...LIGHT,
  background: '#000000',
  lightLine: '#323232',
  heavyLine: '#646464',
  blueGhost: BLUE_FG,
  oranGhost: ORAN_FG,
  constraintMark: 'rgba(0, 0, 0, 0.25)',
};

export function paletteFor(dark: boolean): Palette {
  return dark ? DARK : LIGHT;
}

/**
 * Blend two palette colours. `t` of 0 gives `from`, 1 gives `to`.
 *
 * Only the solid `#RRGGBB` entries above go through here — the translucent ones
 * are faded with the canvas `globalAlpha` instead, which composites correctly
 * over whatever is already painted.
 */
export function mix(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = channelsOf(from);
  const b = channelsOf(to);
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

/** Parsed once per colour: this runs for every occupied cell of every frame. */
const CHANNELS = new Map<string, [number, number, number]>();

function channelsOf(hex: string): [number, number, number] {
  const known = CHANNELS.get(hex);
  if (known !== undefined) return known;
  const packed = Number.parseInt(hex.slice(1), 16);
  const channels: [number, number, number] = [
    (packed >> 16) & 0xff,
    (packed >> 8) & 0xff,
    packed & 0xff,
  ];
  CHANNELS.set(hex, channels);
  return channels;
}
