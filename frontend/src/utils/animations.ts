// Shared animation constants used across charts and UI components.

export const EASING = [0.16, 1, 0.3, 1] as const

export const SLIDER_TRANSITION = {
  type: 'tween',
  ease: EASING,
  duration: 0.2,
} as const

export const CHART_TRANSITION = {
  type: 'tween',
  ease: EASING,
  duration: 0.25,
} as const
