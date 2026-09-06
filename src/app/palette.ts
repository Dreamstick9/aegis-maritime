/**
 * The one JavaScript copy of the visual world's colours (see DESIGN.md and the CSS token layer in
 * src/styles/app.css, which must agree with this file). Only code that cannot read a CSS custom
 * property imports from here: Recharts props, three.js materials and canvas textures.
 */

/** black structure */
export const K0 = '#151614'
export const K1 = '#1c1d1a'
export const K2 = '#24251f'
export const K3 = '#313329'
/** the chart plate ground */
export const PLATE = '#101210'

/** ink ramp on black surfaces */
export const INK0 = '#f4f4ef'
export const INK1 = '#d5d6d1'
export const INK2 = '#a3a3a0'
export const INK3 = '#5c5d5a'

/** the signal green: a fill on black, type on a black block, and the brightest mark */
export const SIGNAL = '#bfe7a2'
export const SIGNAL_INK = '#cbe9ab'
export const SIGNAL_BRIGHT = '#8fd66e'

/** computed alarms only */
export const ALARM_ON_K = '#ef4b3f'
export const ALARM_ON_Y = '#a8261c'

/** hairlines on black */
export const HAIR_ON_K = 'rgba(244, 244, 239, 0.12)'
export const HAIR_2_ON_K = 'rgba(244, 244, 239, 0.24)'
