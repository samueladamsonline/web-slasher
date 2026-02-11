import type { Facing } from '../game/types'

export type HeroFrameStep = 0 | 1 | 2

const HERO_FRAME_NAMES: Record<Facing, Record<HeroFrameStep, string>> = {
  down: { 0: 'down-idle', 1: 'down-walk-1', 2: 'down-walk-2' },
  up: { 0: 'up-idle', 1: 'up-walk-1', 2: 'up-walk-2' },
  left: { 0: 'left-idle', 1: 'left-walk-1', 2: 'left-walk-2' },
  right: { 0: 'right-idle', 1: 'right-walk-1', 2: 'right-walk-2' },
}

export function heroFrameName(facing: Facing, step: HeroFrameStep) {
  return HERO_FRAME_NAMES[facing][step]
}

export function heroWalkFrameNames(facing: Facing) {
  return [heroFrameName(facing, 0), heroFrameName(facing, 1), heroFrameName(facing, 2), heroFrameName(facing, 1)]
}
