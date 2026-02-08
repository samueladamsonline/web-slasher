export type ItemId = 'coin' | 'key' | 'heart'

export type ItemKind = 'currency' | 'key' | 'pickup'

export type ItemDef = {
  id: ItemId
  name: string
  kind: ItemKind
  texture: string
  stackable: boolean
}

export const ITEMS: Record<ItemId, ItemDef> = {
  coin: { id: 'coin', name: 'Coin', kind: 'currency', texture: 'item-coin', stackable: true },
  key: { id: 'key', name: 'Key', kind: 'key', texture: 'item-key', stackable: true },
  heart: { id: 'heart', name: 'Heart', kind: 'pickup', texture: 'item-heart', stackable: false },
}

