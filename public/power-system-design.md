# Power & Progression System — Horror Web Game

## 1. Core Loop (High Level)

```
Biome 1 (explore, scavenge, survive)
   ↓ collect Fragments + Skill Shards + Boss Key pieces
   ↓ reach Power Threshold
BOSS 1 (gated fight)
   ↓ defeat → grants Relic + unlocks Biome 2
   ↓ Biome 1 pickups "decay" — respawn as harder/rarer variants
Biome 2 (new items, higher stakes, corruption ramps up)
   ↓ collect new Fragments + new Skill Shards + Boss Key pieces
BOSS 2 (gated fight, harder threshold + new mechanic)
   ↓ repeat pattern, escalate horror + power ceiling
```

Each biome is a self-contained "power gate" — it can't be rushed because the boss door literally won't open without enough Power Threshold + the right Key items. This forces exploration, which is where your horror atmosphere does its work (tension while scavenging).

---

## 2. Biome & Boss Gating System

### Pickup types per biome
| Type | Purpose | Rarity |
|---|---|---|
| **Fragments** | Generic currency, upgrades skill levels | Common, scattered everywhere |
| **Skill Shards** | Unlock a new base skill or modifier | Uncommon, semi-hidden |
| **Boss Key Pieces** | Literal gate — need all N pieces to open boss door | Rare, often guarded/require risk (dark rooms, chase sequences) |
| **Cursed Relics** | Powerful but attach a Corruption cost (see §6) | Rare, optional, high risk/reward |

### Gating math
- Define a **Power Threshold** (e.g., sum of skill levels × modifier count, or just a flat "Power Score").
- Boss door checks: `hasAllKeyPieces && powerScore >= threshold`.
- This means a player *could* find all key pieces early but still get walled off if underleveled — pushes them to explore more of the biome rather than beelining.
- Recommend threshold sits around 70–80% of what's *possible* to collect in that biome, so players don't need 100% completion but can't skip exploration either.

### Post-boss transition
- On boss death: grant a **permanent Relic** (passive stat buff, e.g., +1 modifier slot, or a biome-1 "mastery" bonus).
- Biome 1 pickups don't just vanish — have them **decay/mutate**: same spawn points now drop Biome 2-tier fragments at reduced rate. This rewards backtracking without making biome 1 replay identical, and it's a cheap way to extend content without new asset creation.
- Introduce Biome 2's *new* mechanic here (see §6 — corruption ramping is a good candidate).

---

## 3. Base Skills (the "verbs")

These are the fundamental actions a player collects as glowing pickups in the world (Skill Shards). Think of them as weapon archetypes:

- **Arrow** — single-target ranged
- **Fire Bolt** — AoE ranged, damage-over-time
- **Shadow Blade** — melee, fast, low range
- **Ward** — defensive, blocks/reflects
- **Trap** — placed, delayed trigger
- **Pulse** — short-range AoE burst (good panic button in horror encounters)

Each base skill has its own **level** (1–5), raised by spending Fragments. Leveling changes numbers only (damage, cooldown) — flavor and behavior comes from Modifiers.

---

## 4. Modifiers (the "adjectives")

Modifiers attach to a base skill and change *how* it behaves. This is your combinatorial depth layer.

| Modifier | Effect |
|---|---|
| **Multishot** | Fires N projectiles in a spread |
| **Supershot** | Hold to charge → single massive hit |
| **Homing** | Projectile curves toward nearest enemy |
| **Chain** | Hits arc to a second/third target |
| **Piercing** | Passes through enemies instead of stopping |
| **Explosive** | Small AoE on impact |
| **Ricochet** | Bounces off walls/surfaces |
| **Vampiric** | Heals player on hit |
| **Split** | Projectile splits into 2 on first hit |

### Slot system
- Each base skill has **modifier slots** (start at 1, unlock up to 3–4 via Relics/progression).
- Modifiers are found as their own pickups — independent of which base skill you have — so the player literally finds "Multishot" and then chooses which base skill to slot it into. This is what creates your "collect random powers, combine with skills" idea directly.
- Some modifier combos should have **explicit synergy text** so players hunt for them:
  - `Arrow + Multishot + Homing` = fan of tracking arrows (crowd control)
  - `Fire Bolt + Supershot + Explosive` = single nuke, high risk (long charge = vulnerable)
  - `Shadow Blade + Vampiric + Chain` = sustain-melee build
  - `Trap + Split + Piercing` = area denial build

### Rarity tiers
- **Common** (white) — minor modifiers, found everywhere
- **Uncommon** (blue) — situational modifiers
- **Rare** (purple) — strong modifiers, biome-gated
- **Cursed** (red/black) — best-in-slot power, but costs Corruption per use (see §6)

---

## 5. Fusion Mechanic (optional depth layer)

Place **Fusion Altars** at 1–2 fixed locations per biome (good horror set-piece — a ritual-looking shrine). Players can:
- Fuse **two base skills** into a hybrid (e.g., `Arrow + Shadow Blade` → **Shadow Arrow**: pierces + applies a fear debuff that blinds enemy briefly).
- Fuse **two modifiers** into a stronger one (e.g., `Multishot + Supershot` → **Volley Burst**: charge, then release a spread of empowered shots).

Fusion should **consume** the ingredients (can't undo), which creates meaningful choice — good tension for a horror game where every decision should feel a little costly.

---

## 6. Horror-Flavored Resource: Corruption / Sanity

This is what ties the power system into the horror genre instead of it just being generic ARPG loot:

- **Corruption meter** (0–100) rises when:
  - Equipping/using **Cursed Relics** or Cursed-tier modifiers
  - Optionally: using high-power abilities near "watching" enemies (noise-based aggro)
- **Effects of high Corruption**:
  - Visual: screen distortion, flickering lights, whispers in audio
  - Gameplay: spawns rarer/stronger enemies, or hallucinated fake enemies that cost stamina to avoid
  - **But** — higher Corruption also unlocks a **Corrupted Power Tier**: your base skills gain a temporary visual + damage upgrade while corrupted (e.g., Arrow becomes "Bone Arrow" with bleed effect)
- This creates a real risk/reward axis: strongest possible build vs. safest possible run. Very fitting for horror pacing — the player should feel like power has a cost.
- Corruption can decay over time in "safe rooms" or be cleansed with a rare item, giving players agency over how far they push it.

---

## 7. Example Progression Table

| Stage | Collect | Threshold | Boss Mechanic |
|---|---|---|---|
| Biome 1 | 3 Boss Key pieces, Skill Shards (Arrow, Fire Bolt, Ward), Fragments | Power Score ≥ 40 | Boss 1 has an armored phase — needs Piercing or Explosive modifier to break it, nudging players toward specific combos |
| Biome 2 | 3 new Key pieces, Skill Shards (Shadow Blade, Trap), Cursed Relics appear | Power Score ≥ 90, Corruption-aware fight (boss reacts to your corruption level) | Boss 2 punishes high Corruption (extra phase) but rewards it with an exposed weak point — ties §6 directly into a boss fight |

---

## 8. Skill Appearances (VFX)

Three.js (via react-three-fiber) handles all of this fine — shaders, instanced particles, and post-processing cover the whole list below. The design problem isn't "can it do it," it's avoiding combinatorial explosion: with 6 base skills × 9 modifiers, you don't want to hand-author a unique effect per combo. Instead, build reusable **effect primitives** that compose, mirroring the base skill + modifier data structure from §3/§4.

### Base skill visual identity (color/shape language)
Each base skill needs a distinct silhouette + color so players read what's coming at a glance, even in horror-dark lighting:

| Skill | Color | Shape/Trail | Material feel |
|---|---|---|---|
| **Arrow** | Pale white/bone | Thin streak, minimal trail | Sharp, physical |
| **Fire Bolt** | Orange/red | Thick trail, flickering edges | Emissive, roiling |
| **Shadow Blade** | Deep violet/black | Smeared afterimage, low opacity | Semi-transparent, glitchy |
| **Ward** | Pale cyan | Ring/dome shell | Glassy, shimmering |
| **Trap** | Sickly green | Pulsing glyph on ground | Runic, slow pulse |
| **Pulse** | Muted grey-blue | Radial shockwave ring | Distortion-heavy, no fill |

Keep the *cursed* variant of each skill on the same silhouette but shift the palette toward red/black with a corrupted noise texture — so players instantly recognize "this is Arrow, but corrupted" rather than a totally new shape they have to relearn.

### Modifier effect primitives (composable, reusable)
Build these once as standalone components; any base skill's projectile can pick them up:

| Modifier | Primitive | Implementation |
|---|---|---|
| **Multishot** | `SpreadEmitter` | Spawns N instances of the base skill's own visual at spread angles — no new asset needed |
| **Supershot** | `ChargeGlow` | Scales + brightens the base skill's material while charging (shader `uIntensity` uniform ramps up) |
| **Homing** | `HomingWisp` | Adds a faint particle trail (`Points`/instanced sparks) that curves with the projectile's steering |
| **Chain** | `ChainBeam` | A thin `Line`/tube geometry rendered between the hit points, fades over ~0.2s |
| **Piercing** | *(reuses base trail, no separate primitive)* | Just skip the "stop on hit" despawn logic |
| **Explosive** | `ImpactBurst` | `InstancedMesh` particle burst + brief point-light flash at impact |
| **Ricochet** | *(reuses trail)* + spark burst | Small non-instanced spark flash on each bounce point |
| **Vampiric** | `LifestealWisp` | Thin particle tendril arcing from enemy back to player on hit |
| **Split** | `SpreadEmitter` (reused) | Same primitive as multishot, triggered on impact instead of on fire |

Because multiple modifiers stack on one skill, each primitive should be additive/independent — e.g., `Arrow + Multishot + Homing` just means the base Arrow trail renders 3× with the HomingWisp attached to each, no special-cased "arrow-multishot-homing" asset.

### Corruption-state overlay (ties to §6)
Rather than reskinning every skill per corruption level, apply a **global shader overlay** driven by the Corruption meter:
- A noise-based "static/glitch" fragment shader pass over all active skill effects once Corruption crosses a threshold (e.g., >50).
- Color grading shifts (via post-processing) — desaturate slightly, push toward red/black — reinforcing that *everything* feels more dangerous, not just the equipped skill.
- Optional: subtle audio-reactive flicker on emissive intensity, since horror reads as much through sound-synced visual instability as through the shapes themselves.

### Practical build order
1. Get one base skill (Arrow) rendering with its own shader trail — establishes your material/uniform pattern.
2. Build `SpreadEmitter` and `ChargeGlow` against it — these two alone cover Multishot and Supershot, your most requested combo.
3. Extend to `HomingWisp`, `ImpactBurst`, `ChainBeam` — these are the ones that need per-frame logic (steering, beam lifetime) rather than just instancing.
4. Only after the primitive layer works for Arrow, port the same primitives onto Fire Bolt / Shadow Blade / etc. — confirms the system is actually skill-agnostic before you sink time into asset variety.

---

## 9. Data Schema (for implementation)

Recommend structuring skills/modifiers as data, not hardcoded logic, so you can add content without touching gameplay code:

```json
{
  "baseSkills": {
    "arrow": {
      "id": "arrow",
      "type": "ranged",
      "baseDamage": 10,
      "cooldown": 0.6,
      "maxLevel": 5,
      "slots": 1
    }
  },
  "modifiers": {
    "multishot": {
      "id": "multishot",
      "rarity": "common",
      "appliesTo": ["ranged"],
      "effect": { "projectileCount": 3, "spreadAngle": 15 }
    },
    "cursed_supershot": {
      "id": "cursed_supershot",
      "rarity": "cursed",
      "appliesTo": ["ranged", "melee"],
      "effect": { "chargeMultiplier": 4 },
      "corruptionCostPerUse": 3
    }
  }
}
```

This lets you drive pickups, fusion recipes, and UI tooltips all from the same source of truth.

---

## 10. Implementation Prompt (for Claude Code / your r3f codebase)

Copy-paste this into Claude Code (or adapt for whichever assistant scaffolds your Next.js/react-three-fiber project):

> I'm building a 3D horror web game in Next.js + react-three-fiber. I need to scaffold a power/skill progression system with the following architecture:
>
> 1. **Data layer**: JSON-driven definitions for `baseSkills` (arrow, fireBolt, shadowBlade, ward, trap, pulse) and `modifiers` (multishot, supershot, homing, chain, piercing, explosive, ricochet, vampiric, split), each with rarity tiers (common/uncommon/rare/cursed).
> 2. **State management**: Use Zustand to track player state — equipped skills, equipped modifiers per skill (with slot limits), skill levels, Fragment currency, collected Boss Key pieces per biome, and a Corruption meter (0–100).
> 3. **Pickup system**: World-space pickup objects (r3f meshes with simple glow/outline shaders) that, on player collision/interaction, add the item to inventory state and despawn. Support different pickup types (fragment, skillShard, keyPiece, cursedRelic) with distinct visual treatment.
> 4. **Boss gate logic**: A gate/door component that checks `hasAllKeyPieces(biomeId) && powerScore >= threshold` before allowing boss room transition, with a locked-state visual/audio cue when conditions aren't met.
> 5. **Combat integration**: A skill-firing system where the active base skill's projectile/effect behavior is dynamically modified by its equipped modifiers (e.g., multishot changes projectile count, homing adds a steering behavior each frame, explosive spawns an AoE on collision).
> 6. **Corruption system**: A meter that increases when cursed-tier modifiers are used, drives post-processing visual effects (screen distortion / vignette pulsing) via r3f postprocessing, and unlocks a "corrupted" visual/stat variant of equipped skills above a threshold.
> 7. **Fusion altar**: A world object that, when interacted with while holding 2 valid base skills or 2 valid modifiers, opens a UI to confirm fusion, consumes the ingredients, and grants the fused result per a recipe table.
> 8. **VFX primitive layer**: Build reusable, composable effect components rather than per-combo assets — `SpreadEmitter` (multishot/split), `ChargeGlow` (supershot, shader uniform-driven), `HomingWisp` (homing trail), `ChainBeam` (chain hits), `ImpactBurst` (explosive, instanced particles + light flash), `LifestealWisp` (vampiric). Each base skill gets its own color/shader identity (e.g., Arrow = pale bone streak, Fire Bolt = orange roiling trail, Shadow Blade = violet afterimage); modifiers attach their primitive to whichever base skill's projectile without needing a new asset per combination. Start with Arrow + SpreadEmitter + ChargeGlow to validate the pattern before porting to other base skills.
>
> Please set this up with clean separation: `/lib/gameData` for JSON definitions, `/store` for Zustand slices, `/components/pickups`, `/components/combat`, `/components/ui` for HUD/inventory. Start with the data layer and Zustand store, then the pickup + gate logic, then combat integration. Flag any performance concerns with r3f instancing for pickups given multiple biomes worth of items in the scene.

---

## Quick Notes / Open Questions to Decide Before Building
- **Power Score formula**: flat sum vs. weighted (rare modifiers count more)? Weighted encourages hunting rares over grinding commons.
- **Modifier slot unlocks**: tied to Relics (boss rewards) or to Fragment spend? Relics feels more "earned," better for horror pacing (fewer, more meaningful upgrades).
- **Corruption decay**: passive over time, or only in designated safe zones? Safe zones create more tension (you *have* to find one).
