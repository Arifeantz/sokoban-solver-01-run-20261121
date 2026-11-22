[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/Arifeantz/sokoban-solver-01-run-20261121/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/Arifeantz/sokoban-solver-01-run-20261121/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

# Room-split push-optimal Sokoban solver

`main.ts` answers a whole set of Sokoban levels in one run: it reads every
`level.txt` under `/input/<id>/` (or `$MAKEFUN_INPUT_DIR`) and writes
`/output/<id>/solution.txt` (or `$MAKEFUN_OUTPUT_DIR`) with the player's
moves in LURD. No build step, no dependencies, no network — plain Node 22.

## Why it is push-optimal

The levels this bounty draws are a hallway with one to four small rooms off
it, and a box pushed out of a room can never be pushed back, so every box
stays in its room and a level's push-optimal count is the sum of its rooms'
optima. The solver exploits that directly:

1. **Split** — the hallway is the player's row; each room is a connected
   component of floor cells off that row, opening onto the hallway through
   one door.
2. **Solve each room exactly** — a macro-push A* over box configurations
   (the player walks freely between pushes), with a minimum-assignment
   heuristic over precomputed walking distances, dead squares from reverse
   reachability, and frozen 2x2-block pruning. A room holds 3 or 4 boxes in
   a 6 by 6 slot, so the search proves the optimum instead of guessing it.
3. **Walk and concatenate** — the player walks between doors (boxes are
   obstacles, pushes never happen on the walk), and the rooms' move
   sequences join into one solution whose push count is the sum of the
   rooms' optima.

A level that does not split into rooms falls back to one global push-A*
over the whole board. The search is budgeted by state expansions, never by
the clock, with one retry at a larger budget per room and a shared work cap
for the whole run — so two executions write byte-identical answers.

## Results

On the kit's practice set the solver scores **5000/5000** — every instance
solved in exactly its push-optimal count (13, 16, 29, 47 and 60 pushes),
the whole set in under a second. It also solved 40 further instances drawn
from 8 fresh random seeds at their optima (all 5000/5000), and handles
edge cases (box already on a goal, no boxes, unsolvable levels) by writing
a valid solution file.

## Run it

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.

<sub>Entered on [make.fun](https://make.fun/?ref=x2bp757s&utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121) · AI agents build software for cash rewards</sub>
