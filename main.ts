// Room-split push-optimal Sokoban solver.
//
// The levels this bounty draws are a hallway with one to four small rooms
// off it (see the competition rules): every box stays in its room, so a
// level's push-optimal count is the sum of its rooms' optima. This program
// therefore splits each level into its rooms and solves every room
// push-optimally on its own, then walks the player between the doors and
// concatenates the rooms' move sequences. A room holds 3 or 4 boxes in a
// 6 by 6 slot, so a macro-push A* with a min-assignment heuristic, dead
// squares and frozen-block pruning solves each room exactly.
//
// The search is budgeted by expansions, never by the clock, so two runs
// write the same bytes. No randomness, no wall clock, no environment.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Work budgets, in state expansions. Rooms are tiny (at most 4 boxes in
// about 36 floor cells), so these caps are far above what the search needs;
// they exist only so a pathological level cannot blow the 60 second wall.
// A room that exhausts its first budget gets one retry with a larger one,
// and a shared cap bounds the whole run's work across all five instances,
// so one hard room can never starve the rest of the set.
const ROOM_MAX_EXPANSIONS = 400000;
const ROOM_RETRY_EXPANSIONS = 1500000;
const GLOBAL_MAX_EXPANSIONS = 2000000;
const GLOBAL_WORK_CAP = 5000000;

// The four steps, in a fixed order so every run behaves identically.
const DIRS = [
  [0, -1, 'u'],
  [0, 1, 'd'],
  [-1, 0, 'l'],
  [1, 0, 'r'],
];

// ---------------------------------------------------------------- parsing

function parseLevel(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '#';
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  boxes.sort((a, b) => a - b);
  goals.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

// ------------------------------------------------------- walking distances

// Shortest walking distances from `src` over the cells of `floor` (a
// Uint8Array of 1s), ignoring boxes. -1 where unreachable.
function bfsDistances(w, floor, src) {
  const dist = new Int32Array(floor.length).fill(-1);
  const queue = [src];
  dist[src] = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    const d = dist[cell] + 1;
    for (const [dx, dy] of DIRS) {
      const q = cell + dy * w + dx;
      if (q < 0 || q >= floor.length) continue;
      if (floor[q] && dist[q] < 0) {
        dist[q] = d;
        queue.push(q);
      }
    }
  }
  return dist;
}

// The squares the player reaches from `from`, walking around walls and the
// boxes in `boxSet` (a Set of cell indices).
function playerRegion(w, wall, boxSet, from) {
  const seen = new Uint8Array(wall.length);
  const out = [from];
  seen[from] = 1;
  for (let i = 0; i < out.length; i++) {
    for (const [dx, dy] of DIRS) {
      const q = out[i] + dy * w + dx;
      if (q < 0 || q >= wall.length) continue;
      if (!wall[q] && !boxSet.has(q) && !seen[q]) {
        seen[q] = 1;
        out.push(q);
      }
    }
  }
  return out;
}

// A walk from `from` to `to` over floor cells, treating `boxSet` as walls.
// Returns the move string, or null when no walk exists.
function walkMoves(w, wall, boxSet, from, to) {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-2);
  const prevStep = new Array(wall.length).fill('');
  const queue = [from];
  prev[from] = -1;
  for (let qi = 0; qi < queue.length; qi++) {
    const cell = queue[qi];
    for (const [dx, dy, letter] of DIRS) {
      const q = cell + dy * w + dx;
      if (q < 0 || q >= wall.length) continue;
      if (wall[q] || boxSet.has(q) || prev[q] !== -2) continue;
      prev[q] = cell;
      prevStep[q] = letter;
      if (q === to) {
        let moves = '';
        for (let c = q; c !== from; c = prev[c]) moves = prevStep[c] + moves;
        return moves;
      }
      queue.push(q);
    }
  }
  return null;
}

// ------------------------------------------------------------ dead squares

// Cells a box can never leave towards a goal: reverse reachability from the
// goals. A cell p is live when a box on p can be pushed onto a live cell:
// for a live cell q and a direction d, p = q - d is live when p is floor
// and the player can stand on p - d = q - 2d. Cells never reached are dead,
// and pruning them is sound: no real push sequence can rescue a box there,
// since every real sequence is also a sequence in this approximation (the
// player is assumed able to reach any floor cell).
function deadSquares(w, floor, goals) {
  const live = new Uint8Array(floor.length);
  const queue = [];
  for (const g of goals) {
    live[g] = 1;
    queue.push(g);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const q = queue[qi];
    for (const [dx, dy] of DIRS) {
      const d = dy * w + dx;
      const p = q - d;
      const stand = q - 2 * d;
      if (p < 0 || p >= floor.length || stand < 0 || stand >= floor.length) continue;
      if (floor[p] && floor[stand] && !live[p]) {
        live[p] = 1;
        queue.push(p);
      }
    }
  }
  const dead = new Uint8Array(floor.length);
  for (let i = 0; i < floor.length; i++) if (floor[i] && !live[i]) dead[i] = 1;
  return dead;
}

// ------------------------------------------------------- the room A* search

// Push-optimal A* over macro pushes for one room. `floor` marks every cell
// the player may stand on (the room's cells plus the hallway square outside
// its door); `boxCells` marks where a box may sit (the room's cells only —
// a box pushed onto the hallway square outside the door is lost, so that
// cell is never a box target). `budget` is the run's shared work account
// { used, cap }; the search stops when either its own cap or the shared one
// runs out. Returns { moves, pushes, finalPlayer, finalBoxes } or null when
// the budget runs out.
function solveRoom(w, wall, floor, boxCells, goals, boxes0, player0, maxExpansions, budget) {
  const n = boxes0.length;
  if (n === 0) return { moves: '', pushes: 0, finalPlayer: player0, finalBoxes: [] };
  const goalSet = new Set(goals);
  const dead = deadSquares(w, floor, goals);
  // Distance from each goal to every cell, for the assignment heuristic.
  const distToGoal = goals.map((g) => bfsDistances(w, floor, g));
  for (const b of boxes0) {
    if (dead[b] && !goalSet.has(b)) return null;
  }

  // Minimum-assignment heuristic: the cheapest way to match boxes to goals
  // by walking distance, over all bijections (permutations of goal indices).
  // Admissible — one push moves one box one cell, so the sum can drop by at
  // most one per push — and Infinity when a box can reach no goal.
  const permutations = [];
  const permute = (arr, k) => {
    if (k === n) {
      permutations.push(arr.slice());
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      permute(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  permute(
    goals.map((_, i) => i),
    0,
  );

  const heuristic = (boxes) => {
    let best = Infinity;
    for (const perm of permutations) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const d = distToGoal[perm[i]][boxes[i]];
        if (d < 0) {
          sum = Infinity;
          break;
        }
        sum += d;
      }
      if (sum < best) best = sum;
    }
    return best;
  };

  const isGoalState = (boxes) => boxes.every((b) => goalSet.has(b));

  // A 2x2 block of boxes with a box off its goal can never move again.
  const frozenBlock = (boxSet) => {
    for (const b of boxSet) {
      const x = b % w;
      const y = Math.floor(b / w);
      for (const [ox, oy] of [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ]) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx + 1 >= w) continue;
        const tl = ty * w + tx;
        const cells = [tl, tl + 1, tl + w, tl + w + 1];
        if (cells.some((c) => c < 0 || c >= wall.length)) continue;
        if (cells.every((c) => boxSet.has(c)) && !cells.every((c) => goalSet.has(c))) return true;
      }
    }
    return false;
  };

  const keyOf = (boxes, player) => boxes.join(',') + '|' + player;

  // State storage: parallel arrays, parent-linked for reconstruction.
  const stBoxes = [boxes0.slice()];
  const stPlayer = [player0];
  const stG = [0];
  const stParent = [-1];
  const stAction = [null]; // { from, box, dir } — the push that made the state
  const closed = new Map([[keyOf(boxes0, player0), 0]]);

  // Binary heap on (f, h, sequence): smallest f, then smallest h (deepest),
  // then earliest inserted — fully deterministic.
  const heap = [];
  let seq = 0;
  const h0 = heuristic(boxes0);
  if (h0 === Infinity) return null;
  heap.push([h0, h0, seq++, 0]);
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  const heapPush = (e) => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
        if (!less(heap[c], heap[i])) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    return top;
  };

  let expanded = 0;
  while (heap.length > 0) {
    const [, , , s] = heapPop();
    if (closed.get(keyOf(stBoxes[s], stPlayer[s])) !== s) continue; // superseded
    const boxes = stBoxes[s];
    const player = stPlayer[s];
    if (isGoalState(boxes)) {
      // Rebuild the move string from the parent chain.
      const chain = [];
      for (let t = s; t > 0; t = stParent[t]) chain.push(t);
      chain.reverse();
      let moves = '';
      let curPlayer = player0;
      let curBoxes = boxes0;
      for (const t of chain) {
        const action = stAction[t];
        const boxSet = new Set(curBoxes);
        const walk = walkMoves(w, wall, boxSet, curPlayer, action.from);
        if (walk === null) return null; // cannot happen: the region allowed it
        moves += walk + action.letter;
        curPlayer = action.box;
        const next = curBoxes.slice();
        next[next.indexOf(action.box)] = action.box + action.d;
        next.sort((a, b) => a - b);
        curBoxes = next;
      }
      return { moves, pushes: stG[s], finalPlayer: curPlayer, finalBoxes: curBoxes };
    }
    if (expanded >= maxExpansions || budget.used >= budget.cap) return null;
    expanded++;
    budget.used++;
    const g = stG[s];
    const boxSet = new Set(boxes);
    const region = playerRegion(w, wall, boxSet, player);
    const regionSet = new Set(region);
    for (let bi = 0; bi < n; bi++) {
      const b = boxes[bi];
      for (const [dx, dy, letter] of DIRS) {
        const d = dy * w + dx;
        const from = b - d;
        const target = b + d;
        if (!regionSet.has(from)) continue;
        if (target < 0 || target >= wall.length) continue;
        if (!floor[target] || !boxCells[target] || boxSet.has(target)) continue;
        const nb = boxes.slice();
        nb[bi] = target;
        nb.sort((a, b) => a - b);
        if (nb.some((x) => dead[x] && !goalSet.has(x))) continue;
        const nbSet = new Set(nb);
        if (frozenBlock(nbSet)) continue;
        const h = heuristic(nb);
        if (h === Infinity) continue;
        const k = keyOf(nb, b);
        const seen = closed.get(k);
        if (seen !== undefined && stG[seen] <= g + 1) continue;
        const t = stBoxes.length;
        stBoxes.push(nb);
        stPlayer.push(b);
        stG.push(g + 1);
        stParent.push(s);
        stAction.push({ from, box: b, d, letter });
        closed.set(k, t);
        heapPush([g + 1 + h, h, seq++, t]);
      }
    }
  }
  return null;
}

// ------------------------------------------------------------- whole levels

// Split a level into its rooms. The hallway is the player's row; each room
// is a connected component of floor cells off that row, opening onto it
// through one door cell.
function splitRooms(level) {
  const { w, h, wall, goals, boxes, player } = level;
  const hallRow = Math.floor(player / w);
  const isHall = (i) => Math.floor(i / w) === hallRow;
  const seen = new Uint8Array(w * h);
  const rooms = [];
  for (let start = 0; start < w * h; start++) {
    if (wall[start] || isHall(start) || seen[start]) continue;
    // Flood-fill one component.
    const cells = [];
    const queue = [start];
    seen[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const cell = queue[qi];
      cells.push(cell);
      for (const [dx, dy] of DIRS) {
        const q = cell + dy * w + dx;
        if (q < 0 || q >= w * h || wall[q] || isHall(q) || seen[q]) continue;
        seen[q] = 1;
        queue.push(q);
      }
    }
    const cellSet = new Set(cells);
    const roomBoxes = boxes.filter((b) => cellSet.has(b));
    const roomGoals = goals.filter((g) => cellSet.has(g));
    // The door: the room cell beside a hallway floor cell.
    let door = -1;
    let entry = -1;
    for (const cell of cells) {
      for (const [dx, dy] of DIRS) {
        const q = cell + dy * w + dx;
        if (q >= 0 && q < w * h && isHall(q) && !wall[q]) {
          door = cell;
          entry = q;
          break;
        }
      }
      if (door >= 0) break;
    }
    rooms.push({ cells: cellSet, boxes: roomBoxes, goals: roomGoals, door, entry });
  }
  return { rooms, hallRow };
}

function solveLevel(text, budget) {
  const level = parseLevel(text);
  const { w, wall, goals, boxes, player } = level;
  if (boxes.length === 0) return '';
  const { rooms } = splitRooms(level);
  // Every box must belong to exactly one room with as many goals as boxes.
  const usable =
    rooms.length > 0 &&
    rooms.every((r) => r.door >= 0 && r.entry >= 0 && r.boxes.length === r.goals.length && r.boxes.length > 0) &&
    rooms.reduce((a, r) => a + r.boxes.length, 0) === boxes.length;
  if (!usable) {
    // Fallback: one global push-A* over the whole level.
    const floor = new Uint8Array(wall.length);
    const boxCells = new Uint8Array(wall.length);
    for (let i = 0; i < wall.length; i++) {
      floor[i] = wall[i] ? 0 : 1;
      boxCells[i] = wall[i] ? 0 : 1;
    }
    const sol = solveRoom(level.w, wall, floor, boxCells, goals, boxes, player, GLOBAL_MAX_EXPANSIONS, budget);
    return sol ? sol.moves : '';
  }

  // Solve the rooms left to right by door column; the order only affects
  // the walk, never the push count.
  rooms.sort((a, b) => a.entry - b.entry);
  let moves = '';
  let curPlayer = player;
  const curBoxes = boxes.slice();
  for (const room of rooms) {
    const boxSet = new Set(curBoxes);
    const walk = walkMoves(w, wall, boxSet, curPlayer, room.entry);
    if (walk === null) return '';
    moves += walk;
    curPlayer = room.entry;
    const floor = new Uint8Array(wall.length);
    const boxCells = new Uint8Array(wall.length);
    for (const c of room.cells) {
      floor[c] = 1;
      boxCells[c] = 1;
    }
    floor[room.entry] = 1; // the player may stand on the hallway square
    let sol = solveRoom(w, wall, floor, boxCells, room.goals, room.boxes, room.entry, ROOM_MAX_EXPANSIONS, budget);
    if (sol === null && budget.used < budget.cap) {
      // One retry with a larger budget: a room that only just missed the
      // first cap is worth a second attempt, and the shared cap still
      // protects the rest of the set.
      sol = solveRoom(w, wall, floor, boxCells, room.goals, room.boxes, room.entry, ROOM_RETRY_EXPANSIONS, budget);
    }
    if (sol === null) return '';
    moves += sol.moves;
    curPlayer = sol.finalPlayer;
    // The room's boxes are on its goals now: remap each of the room's
    // initial boxes (sorted order) to its final position (sorted order).
    const remap = new Map(room.boxes.map((b, i) => [b, sol.finalBoxes[i]]));
    for (let i = 0; i < curBoxes.length; i++) {
      if (remap.has(curBoxes[i])) curBoxes[i] = remap.get(curBoxes[i]);
    }
  }
  return moves;
}

// --------------------------------------------------------------------- main

// One shared work account for the whole run: the search is budgeted by
// expansions, never by the clock, so two executions write the same bytes.
const budget = { used: 0, cap: GLOBAL_WORK_CAP };
for (const id of readdirSync(INPUT).sort()) {
  const moves = solveLevel(readFileSync(join(INPUT, id, 'level.txt'), 'utf8'), budget);
  mkdirSync(join(OUTPUT, id), { recursive: true });
  writeFileSync(join(OUTPUT, id, 'solution.txt'), `${moves}\n`);
}
