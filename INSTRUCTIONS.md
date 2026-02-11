# Web-Slasher Project Notes

## Overview
Web-Slasher is a Phaser-based 2D top-down action RPG. The codebase favors data-driven definitions (maps/items/enemies), modular systems, and deterministic test coverage (`vitest` + Playwright).

## High-Level Architecture
- `src/main.ts` bootstraps Phaser.
- `src/scenes/GameScene.ts` is the integration layer for core systems.
- `src/scenes/coordinators/SceneFlowCoordinator.ts` owns start menu, pause/map/inventory/spellbook overlays, dialogue pause, and game-over/respawn flow.
- `src/scenes/coordinators/SceneDebugCoordinator.ts` owns debug bridge lifecycle (`window.__dbg`).
- `src/game/MapRuntime.ts` owns map loading, collisions, warps, and enemy spawns.
- Entities live in `src/entities/*` (Hero, Enemy, enemy defs).
- Systems live in `src/systems/*` (AI, combat, health, inventory, pickups, interaction, save, etc).
- UI components live in `src/ui/*`.

## Core Systems
- `EnemyAISystem`: finite state machines per enemy. Bats use path-following when LOS is blocked and a deaggro cooldown; slimes wander/leash. Enemy melee now uses a parity model with windup/active/recovery/cooldown and data-defined hitboxes/knockback.
- `CombatSystem`: handles player attacks and hit detection.
- `SpellSystem`: handles spell casting and projectile spells (data-driven from `src/content/spells.ts`), including optional on-hit effects (for example slow).
- `StatusEffectSystem`: updates enemy status-effect visuals (for example a slow icon) and keeps those indicators attached to enemies.
- `SpellbookUI`: overlay for viewing available spells and assigning spell hotkeys.
- `SpellSlotUI`: bottom-right HUD slot showing the currently selected spell (icon + name).
- `PlayerHealthSystem`: damage, invulnerability, and health UI. Damage intake is strike-driven (`tryApplyEnemyStrike`) instead of raw overlap touch damage.
- `InventorySystem`: equipment, weapons, and bag.
- `InventoryUI`: Diablo-2-ish overlay for EQUIPPED + STASH; the right-side Details panel shows hovered item stats, and shows aggregated equipped stats when nothing is hovered.
- `PickupSystem` + `LootSystem`: drops and auto-pickups.
- `InteractionSystem`: sign/chest/doors and dialogue.
- `SaveSystem`: persistence of inventory/world/checkpoint.
- `SoundSystem`: listens to game events and plays SFX (attack swing, hits, pickups, UI open/close).
- `MapRuntime`: tilemap collision, warps, LOS checks, and pathfinding.
- `Hero` (`src/entities/Hero.ts`): movement/attack/hurt finite state machine. Attacks do not hard-lock movement; if movement input is held, the hero keeps moving while the attack timing still runs.
- Hero animation frames are atlas-metadata driven (`public/sprites/hero.atlas.json`, `src/content/heroAtlas.ts`) using named frames, not hardcoded row/column math.

## Player Stats
Player power is derived from equipment via `InventorySystem.getPlayerStats()`:
- Weapons: determine whether the player can melee attack and contribute `attackDamage`.
- Boots: `moveSpeedPct` (multiplies base movement speed).
- Gloves: `attackSpeedPct` (scales weapon windup/active/recovery and combat lock time).
- Chest: `maxHpBonus` (adds flat hearts to max HP; if the player was full, stays full on increases).
- Spells: equipped items can grant spells (`spell id + level`). The player has a single `selectedSpell` at a time.
  - If multiple equipped items grant the same spell at different levels, the highest level wins.
  - Spells may define on-hit effects (for example, Ice Bolt slows enemies) in `src/content/spells.ts`. The effect schema lives in `src/game/statusEffects.ts`.

Spell input and selection:
- `1-5`: select the spell assigned to that hotkey (spells only; no weapon quick-equip).
- `F`: toggles the `SpellbookUI` overlay. While open, hover a spell and press `1-5` to assign that hotkey to the hovered spell (a small number indicator appears on the spell icon).
- Arrow keys: cast the currently selected spell in the direction of the pressed arrow key (WASD = move, arrows = cast).

Invalidation rules:
- If a gear change removes a spell, any hotkey slots pointing to it are cleared.
- If the currently selected spell becomes unavailable, selection becomes "No Spell" (no auto-picking a replacement).
- Hotkeys and the selected spell persist via `SaveSystem` / localStorage.

`GameScene` is the integration point: it applies `moveSpeedMul`, scaled attack timings, and max HP to hero/combat/health, wires `SpellSystem` casts, and keeps `SpellSlotUI` + `SpellbookUI` in sync with inventory changes while delegating flow/debug concerns to coordinators.

## Pathfinding
`src/game/pathfinding.ts` provides A* on the collision grid. `MapRuntime.findPath` wraps this and returns tile + world-point paths. `EnemyAISystem` uses `findPath` and `hasLineOfSight` to chase around walls rather than pushing into them.

## Current World Content
- Maps: `overworld`, `cave`, `marsh`, `ruins`, `citadel`.
- The legacy overworld/cave coordinates used by integration playtests are intentionally preserved; expansions are added around those anchors.
- Enemy roster: `slime`, `bat`, `spider`, `skeleton`, `wisp`, `imp`, `golem`, plus boss `bone_lord`.
- New spell-granting gear: `helmet_storm` -> `stormlance`, `chest_venom` -> `venomshot`, `boots_rift` -> `arcaneorb`.
- Generated art/data helper: `scripts/generate_content_pack.mjs` rebuilds the expanded tileset, new enemy sprites, and expanded/new maps.

## Collision & Damage
Arcade physics colliders handle world blocking. Enemy damage uses timed melee strike windows (windup/active/recovery) with configurable circular hitboxes; `PlayerHealthSystem` applies invulnerability and knockback when a strike lands.

## Events
`src/game/events.ts` defines typed game events (enemy damaged/died, player attacks, pickups collected). Prefer emitting events from gameplay systems and reacting in dedicated systems (for example `SoundSystem`, `LootSystem`) to keep coupling low.

## Testing
- Focused unit tests live under `tests/` and run with `npm run test` (Inventory, Spell helpers, Enemy AI/attack model).
- Integration playtests run with `npm run playtest`.
- Build verification runs with `npm run build`.

## Engineering Guidelines
- Keep the codebase clean: remove dead or unused code when refactoring.
- Prefer industry-standard patterns for top-down games (pathfinding over walls, proper collision handling, data-driven tuning).
- Keep systems modular and focused; avoid large mixed-responsibility classes.
- Always update tests alongside gameplay changes and rerun the test suite.
