export type Grid = {
  w: number
  h: number
  isBlocked: (tx: number, ty: number) => boolean
}

export type TilePoint = { tx: number; ty: number }

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const

export function findNearestWalkable(grid: Grid, start: TilePoint, maxRadius = 6): TilePoint | null {
  if (maxRadius < 0) return null
  if (start.tx >= 0 && start.ty >= 0 && start.tx < grid.w && start.ty < grid.h) {
    if (!grid.isBlocked(start.tx, start.ty)) return start
  }

  const seen = new Set<string>()
  const queue: Array<{ tx: number; ty: number; dist: number }> = [{ tx: start.tx, ty: start.ty, dist: 0 }]
  seen.add(`${start.tx},${start.ty}`)

  while (queue.length) {
    const cur = queue.shift()!
    if (cur.dist > maxRadius) continue
    if (cur.tx >= 0 && cur.ty >= 0 && cur.tx < grid.w && cur.ty < grid.h) {
      if (!grid.isBlocked(cur.tx, cur.ty)) return { tx: cur.tx, ty: cur.ty }
    }
    if (cur.dist === maxRadius) continue
    for (const d of DIRS) {
      const nx = cur.tx + d.x
      const ny = cur.ty + d.y
      const key = `${nx},${ny}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push({ tx: nx, ty: ny, dist: cur.dist + 1 })
    }
  }

  return null
}

export function findPath(
  grid: Grid,
  start: TilePoint,
  goal: TilePoint,
  opts?: { maxNodes?: number; nearestRadius?: number },
): TilePoint[] | null {
  const nearestRadius = opts?.nearestRadius ?? 6
  const startTile = findNearestWalkable(grid, start, nearestRadius)
  const goalTile = findNearestWalkable(grid, goal, nearestRadius)
  if (!startTile || !goalTile) return null

  const w = grid.w
  const h = grid.h
  const total = w * h
  const idx = (tx: number, ty: number) => ty * w + tx
  const startIdx = idx(startTile.tx, startTile.ty)
  const goalIdx = idx(goalTile.tx, goalTile.ty)

  const gScore = new Float32Array(total)
  const fScore = new Float32Array(total)
  const cameFrom = new Int32Array(total)
  const inOpen = new Uint8Array(total)
  const closed = new Uint8Array(total)

  for (let i = 0; i < total; i++) {
    gScore[i] = Number.POSITIVE_INFINITY
    fScore[i] = Number.POSITIVE_INFINITY
    cameFrom[i] = -1
  }

  const hScore = (a: TilePoint, b: TilePoint) => Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty)

  const open: number[] = []
  gScore[startIdx] = 0
  fScore[startIdx] = hScore(startTile, goalTile)
  open.push(startIdx)
  inOpen[startIdx] = 1

  const maxNodes = Math.max(32, opts?.maxNodes ?? total)
  let visited = 0

  while (open.length && visited < maxNodes) {
    let bestIdx = 0
    let bestScore = fScore[open[0]!] ?? Number.POSITIVE_INFINITY
    for (let i = 1; i < open.length; i++) {
      const score = fScore[open[i]!] ?? Number.POSITIVE_INFINITY
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    const current = open.splice(bestIdx, 1)[0]!
    inOpen[current] = 0
    if (current === goalIdx) return reconstructPath(cameFrom, current, w)

    closed[current] = 1
    visited += 1

    const cx = current % w
    const cy = Math.floor(current / w)
    for (const d of DIRS) {
      const nx = cx + d.x
      const ny = cy + d.y
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (grid.isBlocked(nx, ny)) continue
      const nIdx = idx(nx, ny)
      if (closed[nIdx]) continue

      const tentative = gScore[current] + 1
      if (tentative < gScore[nIdx]) {
        cameFrom[nIdx] = current
        gScore[nIdx] = tentative
        fScore[nIdx] = tentative + hScore({ tx: nx, ty: ny }, goalTile)
        if (!inOpen[nIdx]) {
          open.push(nIdx)
          inOpen[nIdx] = 1
        }
      }
    }
  }

  return null
}

export function simplifyPath(path: TilePoint[]): TilePoint[] {
  if (path.length <= 2) return path.slice()
  const out: TilePoint[] = [path[0]!]
  let prevDx = path[1]!.tx - path[0]!.tx
  let prevDy = path[1]!.ty - path[0]!.ty
  for (let i = 1; i < path.length - 1; i++) {
    const cur = path[i]!
    const next = path[i + 1]!
    const dx = next.tx - cur.tx
    const dy = next.ty - cur.ty
    if (dx !== prevDx || dy !== prevDy) {
      out.push(cur)
      prevDx = dx
      prevDy = dy
    }
  }
  out.push(path[path.length - 1]!)
  return out
}

function reconstructPath(cameFrom: Int32Array, current: number, w: number): TilePoint[] {
  const out: TilePoint[] = []
  let cur = current
  while (cur !== -1) {
    const tx = cur % w
    const ty = Math.floor(cur / w)
    out.push({ tx, ty })
    cur = cameFrom[cur] ?? -1
  }
  out.reverse()
  return out
}
