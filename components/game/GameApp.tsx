"use client";

import dynamic from "next/dynamic";
import { DoorOpen, Home, RotateCcw, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUD } from "@/components/game/HUD";
import { MainMenu } from "@/components/game/MainMenu";
import { audio } from "@/lib/audio";
import { resetRuntime, useGameStore } from "@/lib/store";

const GameCanvas = dynamic(
  () => import("@/components/game/GameCanvas").then((mod) => mod.GameCanvas),
  {
    ssr: false,
    loading: () => <div className="absolute inset-0 bg-[#0a101c]" />,
  }
);

export function GameApp() {
  const phase = useGameStore((s) => s.phase);
  const character = useGameStore((s) => s.character);
  const session = useGameStore((s) => s.session);

  if (phase === "menu") {
    return <MainMenu />;
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {phase === "playing" && (
        <>
          <GameCanvas key={session} character={character} />
          <HUD />
        </>
      )}
      {(phase === "dead" || phase === "won") && <EndScreen />}
    </div>
  );
}

function EndScreen() {
  const phase = useGameStore((s) => s.phase);
  const collected = useGameStore((s) => s.collected.length);
  const total = useGameStore((s) => s.totalTalismans);
  const start = useGameStore((s) => s.start);
  const toMenu = useGameStore((s) => s.toMenu);

  const retry = () => {
    audio.init();
    audio.startAmbient();
    resetRuntime();
    start();
  };

  if (phase === "dead") {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
        <div className="nf-jumpscare pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="flex gap-16">
              <JumpscareEye />
              <JumpscareEye />
            </div>
            <div
              className="mx-auto mt-10 h-24 w-40 rounded-b-full bg-black"
              style={{
                boxShadow:
                  "0 0 80px 30px rgba(160,10,10,0.55) inset, 0 0 120px rgba(255,30,10,0.35)",
              }}
            />
          </div>
        </div>
        <div
          className="nf-pulse-red pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(120,0,0,0.55) 100%)",
          }}
        />
        <div className="nf-shake relative z-10 mt-72 flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-3">
            <Skull className="size-8 text-red-500" />
            <h2
              className="text-5xl font-black tracking-[0.2em] text-red-500"
              style={{ textShadow: "0 0 30px rgba(255,20,10,0.8)" }}
            >
              IT FOUND YOU
            </h2>
            <Skull className="size-8 text-red-500" />
          </div>
          <p className="text-sm text-white/50">
            Talismans recovered: {collected} / {total}
          </p>
          <div className="flex gap-3">
            <Button size="lg" onClick={retry} className="gap-2">
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button size="lg" variant="outline" onClick={toMenu} className="gap-2">
              <Home className="size-4" /> Main menu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#03070c]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(70,160,255,0.18), transparent 70%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        <DoorOpen className="size-14 text-sky-300" />
        <h2
          className="text-5xl font-black tracking-[0.2em] text-sky-200"
          style={{ textShadow: "0 0 40px rgba(80,180,255,0.6)" }}
        >
          YOU ESCAPED
        </h2>
        <p className="max-w-md text-sm text-white/55">
          You slipped through the gate as the forest screamed behind you. All {total}{" "}
          talismans recovered. The Hollow One hunts alone tonight.
        </p>
        <div className="flex gap-3">
          <Button size="lg" onClick={retry} className="gap-2">
            <RotateCcw className="size-4" /> Play again
          </Button>
          <Button size="lg" variant="outline" onClick={toMenu} className="gap-2">
            <Home className="size-4" /> Main menu
          </Button>
        </div>
      </div>
    </div>
  );
}

function JumpscareEye() {
  return (
    <div
      className="h-20 w-14 rotate-6 rounded-[50%] bg-red-500 first:-rotate-6"
      style={{
        boxShadow:
          "0 0 60px 20px rgba(255,30,10,0.8), 0 0 140px 60px rgba(255,30,10,0.35)",
        clipPath: "polygon(50% 0%, 100% 45%, 78% 100%, 22% 100%, 0% 45%)",
      }}
    />
  );
}
