export type TiledProps = unknown

export function getTiledProp(props: TiledProps, name: string): unknown {
  if (!Array.isArray(props)) return undefined
  return (props as any[]).find((p) => p?.name === name)?.value
}

export function getTiledString(props: TiledProps, name: string): string | undefined {
  const v = getTiledProp(props, name)
  return typeof v === 'string' ? v : undefined
}

export function getTiledNumber(props: TiledProps, name: string): number | undefined {
  const v = getTiledProp(props, name)
  return typeof v === 'number' ? v : undefined
}

export function getTiledBoolean(props: TiledProps, name: string): boolean | undefined {
  const v = getTiledProp(props, name)
  return typeof v === 'boolean' ? v : undefined
}

