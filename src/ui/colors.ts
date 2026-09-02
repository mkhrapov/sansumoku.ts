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
