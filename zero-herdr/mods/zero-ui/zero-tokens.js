// Zero UI tokens — the single source for sizes, spacing, radii and durations.
// No colors live here: every color comes from theme() at call time, so the
// layout follows whatever theme the person picked (see zero-theme.js).
// This file is stamped into each consuming mod by tools/stamp-zero-ui.mjs.

/** Font family names. Both families ship in zero-ui/fonts/ (stamped next to
 *  this file as fonts/), so Zero stays intact when Paper is removed. */
export const UI = "Allo";
export const MONO = "Geist Mono";

export const T = {
  /** Type ladder (px). Title 14/500, main readout 20/500, body & controls 12,
   *  group labels 11/500, auxiliary text 10.5. Nothing smaller is necessary
   *  text; decorative ticks simply shrink, they never carry words. */
  type: {
    title: 14,
    readout: 20,
    body: 12,
    label: 11,
    hint: 10.5,
  },
  /** Spacing ladder (px). Right panel padding 12; between groups 12-16;
   *  inside a group 6-8; inline 4-6. */
  space: {
    panel: 12,
    group: 14,
    inGroup: 7,
    inline: 5,
  },
  /** Radii: outer shell 12, inner banner 8, controls & menu items 6, dots full. */
  radius: {
    outer: 12,
    banner: 8,
    control: 6,
  },
  /** Motion (ms). Only opacity/width/height/left/top transition natively;
   *  hover color changes are instant. Loop periods match the plan: banner
   *  breathing 1600, signal bars keep their staggered 880-1350 rhythm. */
  duration: {
    hover: 120,
    menu: 160,
    drawer: 200,
    breath: 1600,
  },
  /** Icon sizes (px) and stroke width. Small hit targets stay >= 24x24. */
  icon: {
    default: 14,
    nav: 16,
    stroke: 1.5,
  },
  /** Hit areas. */
  hit: {
    button: 24,
    menuRow: 28,
  },
};
