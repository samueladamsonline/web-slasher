# Web-Slasher Project Notes

## Overview
Web-Slasher is a Phaser-based 2D top-down action RPG. The game is organized around a single `GameScene` that wires together entities, world runtime, and gameplay systems. The codebase favors data-driven definitions (maps/items/enemies) and modular systems that can be tested via Playwright.

## High-Level Architecture
- `src/main.ts` bootstraps Phaser.
- `src/scenes/GameScene.ts` is the orchestration layer that instantiates entities/systems and handles pause/game-over flows.
- `src/game/MapRuntime.ts` owns map loading, collisions, warps, and enemy spawns.
- Entities live in `src/entities/*` (Hero, Enemy, enemy defs).
- Systems live in `src/systems/*` (AI, combat, health, inventory, pickups, interaction, save, etc).
- UI components live in `src/ui/*`.

## Core Systems
- `EnemyAISystem`: finite state machines per enemy. Bats use path-following when line-of-sight is blocked; slimes wander/leash.
- `CombatSystem`: handles player attacks and hit detection.
- `SpellSystem`: handles spell casting and projectile spells (data-driven from `src/content/spells.ts`).
- `SpellSlotUI`: bottom-right HUD slot showing the currently selected spell (icon + name).
- `PlayerHealthSystem`: damage, invulnerability, and health UI. Touch damage uses overlap + swept-circle check for tunneling.
- `InventorySystem`: equipment, weapons, and bag.
- `InventoryUI`: Diablo-2-ish overlay for EQUIPPED + STASH; the right-side Details panel shows hovered item stats, and shows aggregated equipped stats when nothing is hovered.
- `PickupSystem` + `LootSystem`: drops and auto-pickups.
- `InteractionSystem`: sign/chest/doors and dialogue.
- `SaveSystem`: persistence of inventory/world/checkpoint.
- `SoundSystem`: listens to game events and plays SFX (attack swing, hits, pickups, UI open/close).
- `MapRuntime`: tilemap collision, warps, LOS checks, and pathfinding.
- `Hero` (`src/entities/Hero.ts`): movement/attack/hurt finite state machine. Attacks do not hard-lock movement; if movement input is held, the hero keeps moving while the attack timing still runs.

## Player Stats
Player power is derived from equipment via `InventorySystem.getPlayerStats()`:
- Weapons: determine whether the player can melee attack and contribute `attackDamage`.
- Boots: `moveSpeedPct` (multiplies base movement speed).
- Gloves: `attackSpeedPct` (scales weapon windup/active/recovery and combat lock time).
- Chest: `maxHpBonus` (adds flat hearts to max HP; if the player was full, stays full on increases).
- Helmet: grants a spellbook (spell id + level). The player has a single `selectedSpell` at a time (auto-picks the first available when gear changes).

`GameScene` is the integration point: it applies `moveSpeedMul`, scaled attack timings, and max HP to the hero/combat/health systems, and wires `SpellSystem` to cast the selected spell in the direction of the arrow keys (WASD = move, arrows = cast). `SpellSlotUI` shows the selected spell in the bottom-right HUD.

## Pathfinding
`src/game/pathfinding.ts` provides A* on the collision grid. `MapRuntime.findPath` wraps this and returns tile + world-point paths. `EnemyAISystem` uses `findPath` and `hasLineOfSight` to chase around walls rather than pushing into them.

## Collision & Damage
Arcade physics colliders handle walls. Touch damage is driven by overlap callbacks plus a swept-circle check in `PlayerHealthSystem` to avoid tunneling with fast/small enemies.

## Events
`src/game/events.ts` defines typed game events (enemy damaged/died, player attacks, pickups collected). Prefer emitting events from gameplay systems and reacting in dedicated systems (for example `SoundSystem`, `LootSystem`) to keep coupling low.

## Testing
Playtests run via `npm run playtest` and should be executed after any gameplay changes. Update or add tests when behavior changes.

## Engineering Guidelines
- Keep the codebase clean: remove dead or unused code when refactoring.
- Prefer industry-standard patterns for top-down games (pathfinding over walls, proper collision handling, data-driven tuning).
- Keep systems modular and focused; avoid large mixed-responsibility classes.
- Always update tests alongside gameplay changes and rerun the test suite.
