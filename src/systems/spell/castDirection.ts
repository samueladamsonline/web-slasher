export function normalizeCardinalDirection(dir: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!dir) return null
  const x = typeof dir.x === 'number' && Number.isFinite(dir.x) ? dir.x : 0
  const y = typeof dir.y === 'number' && Number.isFinite(dir.y) ? dir.y : 0
  if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001) return null
  if (Math.abs(x) >= Math.abs(y)) return { x: x < 0 ? -1 : 1, y: 0 }
  return { x: 0, y: y < 0 ? -1 : 1 }
}
