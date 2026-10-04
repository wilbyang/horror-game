# Labyrinth of the Dread Walker

A 3D First-Person Atmospheric Survival Horror Game built with **Three.js** and procedural **Web Audio API**.

---

## 🎮 Objective
You are trapped inside a vast, pitch-black subterranean labyrinth stalked by **The Dread Walker** — an eldritch creature that hunts in the dark.
To survive, you must:
1. Navigate the sprawling maze and locate all **3 Ancient Keys**:
   - **Blood Ruby Key** (Northwest Crypt)
   - **Void Sapphire Key** (Northeast Chamber)
   - **Elder Sun Key** (Deep Southeast Hall)
2. Locate the fortified **South Exit Gate**.
3. Insert all 3 keys to raise the iron portcullis and escape before the monster corners you!

---

## 🕹️ Controls

| Control | Action |
| :--- | :--- |
| **W, A, S, D** / Arrows | Walk through the maze corridors |
| **SHIFT** | Sprint *(Consumes stamina; footstep noise alerts the monster!)* |
| **MOUSE** | Look around / Aim flashlight |
| **F** or **Left Click** | Toggle Flashlight *(Point directly at the monster's face at close range to stun it!)* |
| **M** or **TAB** | Echolocation Sonar Scan *(Temporarily scans nearby maze layout & detects monster location)* |
| **ESC** | Pause game / Release mouse cursor |

---

## 💀 Monster AI: "The Dread Walker"
- **Patrol State**: Roams unpredictable paths throughout the maze.
- **Investigate State**: Triggered by loud player sounds (sprinting nearby, key pickup, or flashlight beams). Moves rapidly toward the disturbance.
- **Chase State**: Enters an aggressive frenzy with blood-curdling screeches when it establishes line of sight or gets within close detection radius. Moves faster than the player's walk, but slower than sprinting!
- **Flashlight Stun**: Shining your flashlight directly into the monster's face within 12 meters blinds it for 2.4 seconds, shivering and shielding its eyes — giving you a clutch window to escape!

---

## 🔊 Procedural Web Audio Engine
The game features a 100% self-contained Web Audio synthesis engine with zero external asset dependencies:
- **Sub-Bass Horror Drone & Wind**: Organic ambient rumble and howling air currents.
- **Dynamic Proximity Heartbeat**: Accelerates in tempo (60 bpm up to 160 bpm) and volume as the monster gets closer.
- **Spatial 3D Monster Footsteps**: Heavy bone-cracking stomps and dragging sounds with stereo panning.
- **Monster Screeches & Growls**: Chaotic frequency-modulated distortion when aggroed.
- **Player Footsteps & Exhaustion**: Distinct stone scuffs, sprint footfalls, and panting when out of stamina.
- **Interactive Stings**: Key chime chords, gate chain grinding, visceral jumpscare dissonance, and victory fanfare.

---

## 🚀 Running the Game

1. Install dependencies:
```bash
npm install
```

2. Start the local development server:
```bash
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:5175/
```
