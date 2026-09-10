"use client";

import { useState } from "react";
import { Combine, Sparkles, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FUSE_RECIPES,
  FRAGMENT_LEVEL_COST,
  MODIFIERS,
  RARITY_COLOR,
  SKILLS,
  modifierFits,
  recipeReady,
  type ModifierId,
  type SkillId,
} from "@/lib/gameData";
import { computePowerScore, useGameStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SkillBench() {
  const unlockedSkills = useGameStore((s) => s.unlockedSkills);
  const skillLevels = useGameStore((s) => s.skillLevels);
  const ownedModifiers = useGameStore((s) => s.ownedModifiers);
  const loadout = useGameStore((s) => s.loadout);
  const activeSkill = useGameStore((s) => s.activeSkill);
  const fragments = useGameStore((s) => s.fragments);
  const modifierSlots = useGameStore((s) => s.modifierSlots);
  const setActiveSkill = useGameStore((s) => s.setActiveSkill);
  const slotModifier = useGameStore((s) => s.slotModifier);
  const levelSkill = useGameStore((s) => s.levelSkill);
  const fuseRecipe = useGameStore((s) => s.fuseRecipe);
  const setSkillMenuOpen = useGameStore((s) => s.setSkillMenuOpen);
  const powerScore = useGameStore((s) => computePowerScore(s));

  const [selected, setSelected] = useState<SkillId>(activeSkill);
  const skill = unlockedSkills.includes(selected) ? selected : unlockedSkills[0] ?? "arrow";
  const def = SKILLS[skill];
  const slotted = loadout[skill] ?? [];
  const level = skillLevels[skill] ?? 1;
  const canLevel = level < def.maxLevel && fragments >= FRAGMENT_LEVEL_COST;

  const usedElsewhere = new Set<ModifierId>();
  for (const id of unlockedSkills) {
    if (id === skill) continue;
    for (const mod of loadout[id] ?? []) usedElsewhere.add(mod);
  }

  const recipes = FUSE_RECIPES.filter((recipe) => recipeReady(recipe.id, unlockedSkills, ownedModifiers));

  const pickSkill = (id: SkillId) => {
    setSelected(id);
    setActiveSkill(id);
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex cursor-auto items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      data-ui-block
      onClick={() => setSkillMenuOpen(false)}
    >
      <Card
        className="max-h-[min(92dvh,760px)] w-full max-w-4xl overflow-hidden border-border/70 bg-card/95 py-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg tracking-wide">
              <WandSparkles className="size-5 text-violet-300" />
              Skill bench
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Slot modifiers onto an attack. Fuse recipes consume the ingredients. Tab or Esc to close.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-amber-200/90">Power {powerScore}</span>
            <Button type="button" size="icon" variant="ghost" onClick={() => setSkillMenuOpen(false)}>
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 overflow-y-auto px-5 py-4 md:grid-cols-[200px_1fr_220px]">
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold tracking-[0.22em] text-white/45 uppercase">Attacks</p>
            {unlockedSkills.map((id) => {
              const skillDef = SKILLS[id];
              const on = id === skill;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickSkill(id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    on ? "border-white/50 bg-white/10" : "border-border/50 bg-black/30 hover:bg-white/5"
                  )}
                >
                  <p className="text-sm font-semibold" style={{ color: skillDef.color }}>
                    {skillDef.name}
                  </p>
                  <p className="text-[10px] text-white/45">
                    Lv {skillLevels[id] ?? 1} · {(loadout[id] ?? []).length} / {modifierSlots} mods
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-black/25 p-4">
            <div>
              <p className="text-lg font-semibold" style={{ color: def.color }}>
                {def.name}
              </p>
              <p className="text-xs text-white/55">{def.summary}</p>
              <p className="mt-1 text-[11px] text-white/40">
                {def.type} · Lv {level} / {def.maxLevel} · {modifierSlots} modifier slot
                {modifierSlots === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: modifierSlots }, (_, i) => {
                const modId = slotted[i];
                const mod = modId ? MODIFIERS[modId] : null;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!mod}
                    onClick={() => {
                      if (modId) slotModifier(skill, modId);
                    }}
                    className={cn(
                      "min-h-16 min-w-36 rounded-lg border px-3 py-2 text-left",
                      mod ? "border-white/30 bg-black/40" : "border-dashed border-white/15 bg-black/20"
                    )}
                  >
                    {mod ? (
                      <>
                        <p className="text-xs font-bold" style={{ color: RARITY_COLOR[mod.rarity] }}>
                          {mod.name}
                        </p>
                        <p className="text-[10px] text-white/45">{mod.summary}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-white/35">Empty slot</p>
                    )}
                  </button>
                );
              })}
            </div>
            <Button type="button" size="sm" disabled={!canLevel} onClick={() => levelSkill(skill)} className="w-fit">
              <Sparkles className="size-3.5" />
              Level up · {FRAGMENT_LEVEL_COST} fragments ({fragments} held)
            </Button>
            {recipes.length > 0 && (
              <div className="mt-1 border-t border-white/10 pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.22em] text-violet-200/80 uppercase">
                  <Combine className="size-3" /> Fuse
                </p>
                <div className="flex flex-col gap-2">
                  {recipes.map((recipe) => (
                    <Button
                      key={recipe.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-start"
                      onClick={() => fuseRecipe(recipe.id)}
                    >
                      <span style={{ color: recipe.color }}>{recipe.name}</span>
                      <span className="text-xs text-muted-foreground">{recipe.detail}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold tracking-[0.22em] text-white/45 uppercase">Modifiers</p>
            {ownedModifiers.length === 0 ? (
              <p className="text-xs text-white/40">Find modifier shards in the wild.</p>
            ) : (
              ownedModifiers.map((id) => {
                const mod = MODIFIERS[id];
                const fits = modifierFits(mod, def);
                const onSkill = slotted.includes(id);
                const busy = usedElsewhere.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!fits && !onSkill}
                    onClick={() => slotModifier(skill, id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      onSkill
                        ? "border-violet-400/70 bg-violet-950/40"
                        : fits
                          ? "border-border/50 bg-black/30 hover:bg-white/5"
                          : "cursor-not-allowed border-border/30 bg-black/20 opacity-40"
                    )}
                  >
                    <p className="text-xs font-bold" style={{ color: RARITY_COLOR[mod.rarity] }}>
                      {mod.name}
                    </p>
                    <p className="text-[10px] text-white/45">{mod.summary}</p>
                    {busy && !onSkill ? (
                      <p className="text-[10px] text-amber-200/70">On another skill — click to move</p>
                    ) : null}
                    {!fits && !onSkill ? (
                      <p className="text-[10px] text-white/35">Won&apos;t bind to {def.type}</p>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
