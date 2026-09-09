# Nightfall

A 3D third-person survival horror game that runs in the browser. Something is
hunting you in a dead forest — collect all 7 talismans to unseal the ancient
gate and escape before The Hollow One catches you.

## How to play

- Choose your survivor: **Maya** (girl) or **Eli** (boy)
- **WASD / arrow keys** — move
- **Shift** — sprint (drains stamina)
- **Mouse** — orbit the third-person camera
- **Esc** — release the mouse (pauses the game)
- Walk into the glowing purple talismans to collect them
- When all 7 are collected, the stone gate opens — run to it to escape

The Hollow One stalks the forest and gives chase when it senses you. Sprinting
makes you easier to detect, and every talisman you take makes it faster and
more perceptive. Your heartbeat tells you how close it is.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router, TypeScript)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [drei](https://github.com/pmndrs/drei) — 3D rendering
- [Three.js](https://threejs.org/) — engine
- [zustand](https://github.com/pmndrs/zustand) — game state
- [ShadCN UI](https://ui.shadcn.com/) + Tailwind CSS — menus and HUD
- [Lucide](https://lucide.dev/) — icons
- Web Audio API — fully procedural sound (drone, wind, dynamic heartbeat, stingers); no audio files

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Best played on desktop
with headphones.

## Production build

```bash
npm run build
npm start
```
