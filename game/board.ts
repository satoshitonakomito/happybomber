/**
 * HAPPYBOMBER — Board Generation & Logic
 * 
 * Deterministic board generation from on-chain seed.
 * Anyone can verify: same seed = same board.
 */

import { createHash } from 'crypto';

export const GRID_SIZE = 10;
export const BOMB_COUNT = 25;

export type Cell = {
  x: number;
  y: number;
  hasBomb: boolean;
  adjacentBombs: number;
  revealed: boolean;
  flaggedBy: string[]; // agent IDs who flagged this cell (private per agent)
};

export type Board = Cell[][];

/**
 * Seeded random number generator (Mulberry32)
 * Deterministic: same seed = same sequence
 */
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Convert 32-byte seed to number for RNG
 */
function seedToNumber(seed: Buffer | string): number {
  const hash = typeof seed === 'string' 
    ? createHash('sha256').update(seed).digest()
    : seed;
  
  // Use first 4 bytes as seed number
  return hash.readUInt32BE(0);
}

/**
 * Generate bomb positions deterministically from seed
 */
export function generateBombPositions(
  seed: Buffer | string,
  gridSize: number = GRID_SIZE,
  bombCount: number = BOMB_COUNT
): Set<string> {
  const rng = mulberry32(seedToNumber(seed));
  const bombs = new Set<string>();
  const totalCells = gridSize * gridSize;
  
  // Fisher-Yates shuffle of all cell indices
  const indices = Array.from({ length: totalCells }, (_, i) => i);
  
  for (let i = totalCells - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  // Take first bombCount indices as bomb positions
  for (let i = 0; i < bombCount; i++) {
    const idx = indices[i];
    const x = idx % gridSize;
    const y = Math.floor(idx / gridSize);
    bombs.add(`${x},${y}`);
  }
  
  return bombs;
}

/**
 * Count adjacent bombs for a cell
 */
function countAdjacentBombs(x: number, y: number, bombs: Set<string>, gridSize: number): number {
  let count = 0;
  
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        if (bombs.has(`${nx},${ny}`)) {
          count++;
        }
      }
    }
  }
  
  return count;
}

/**
 * Generate full board from seed
 */
export function generateBoard(
  seed: Buffer | string,
  gridSize: number = GRID_SIZE,
  bombCount: number = BOMB_COUNT
): Board {
  const bombs = generateBombPositions(seed, gridSize, bombCount);
  const board: Board = [];
  
  for (let y = 0; y < gridSize; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < gridSize; x++) {
      const hasBomb = bombs.has(`${x},${y}`);
      row.push({
        x,
        y,
        hasBomb,
        adjacentBombs: hasBomb ? -1 : countAdjacentBombs(x, y, bombs, gridSize),
        revealed: false,
        flaggedBy: [],
      });
    }
    board.push(row);
  }
  
  return board;
}

/**
 * Get neighbors of a cell
 */
export function getNeighbors(x: number, y: number, gridSize: number = GRID_SIZE): [number, number][] {
  const neighbors: [number, number][] = [];
  
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      
      const nx = x + dx;
      const ny = y + dy;
      
      if (nx >= 0 && nx < gridSize && ny >= 0 && ny < gridSize) {
        neighbors.push([nx, ny]);
      }
    }
  }
  
  return neighbors;
}

/**
 * Reveal a cell and cascade if empty (0 adjacent bombs)
 * Returns list of revealed cells
 */
export function revealCell(board: Board, x: number, y: number): Cell[] {
  const revealed: Cell[] = [];
  const toReveal: [number, number][] = [[x, y]];
  const visited = new Set<string>();
  
  while (toReveal.length > 0) {
    const [cx, cy] = toReveal.pop()!;
    const key = `${cx},${cy}`;
    
    if (visited.has(key)) continue;
    visited.add(key);
    
    const cell = board[cy][cx];
    if (cell.revealed) continue;
    
    cell.revealed = true;
    revealed.push(cell);
    
    // Cascade: if cell has 0 adjacent bombs, reveal neighbors
    if (!cell.hasBomb && cell.adjacentBombs === 0) {
      const neighbors = getNeighbors(cx, cy);
      for (const [nx, ny] of neighbors) {
        if (!visited.has(`${nx},${ny}`)) {
          toReveal.push([nx, ny]);
        }
      }
    }
  }
  
  return revealed;
}

/**
 * Toggle flag on a cell (private per agent)
 */
export function toggleFlag(board: Board, x: number, y: number, agentId: string): boolean {
  const cell = board[y][x];
  
  if (cell.revealed) return false;
  
  const idx = cell.flaggedBy.indexOf(agentId);
  if (idx >= 0) {
    cell.flaggedBy.splice(idx, 1);
    return false; // Unflagged
  } else {
    cell.flaggedBy.push(agentId);
    return true; // Flagged
  }
}

/**
 * Count unrevealed safe cells
 */
export function countUnrevealedSafe(board: Board): number {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell.revealed && !cell.hasBomb) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Check if board is cleared (all safe cells revealed)
 */
export function isBoardCleared(board: Board): boolean {
  return countUnrevealedSafe(board) === 0;
}

/**
 * Get all unrevealed cells
 */
export function getUnrevealedCells(board: Board): Cell[] {
  const cells: Cell[] = [];
  for (const row of board) {
    for (const cell of row) {
      if (!cell.revealed) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

/**
 * Serialize board for client (hides bombs on unrevealed cells)
 */
export function serializeBoardForClient(board: Board, agentId?: string): any[][] {
  return board.map(row =>
    row.map(cell => {
      if (!cell.revealed) {
        return {
          x: cell.x,
          y: cell.y,
          revealed: false,
          flagged: agentId ? cell.flaggedBy.includes(agentId) : false,
        };
      }
      
      return {
        x: cell.x,
        y: cell.y,
        revealed: true,
        hasBomb: cell.hasBomb,
        adjacentBombs: cell.adjacentBombs,
      };
    })
  );
}

/**
 * Verification: Generate board and return bomb positions for verification
 */
export function verifyBoard(seed: string): { bombs: string[]; gridSize: number; bombCount: number } {
  const bombs = generateBombPositions(seed);
  return {
    bombs: Array.from(bombs).sort(),
    gridSize: GRID_SIZE,
    bombCount: BOMB_COUNT,
  };
}

// CLI verification
if (require.main === module) {
  const seed = process.argv[2] || 'test-seed-12345';
  console.log(`\n🎮 HAPPYBOMBER Board Verification`);
  console.log(`Seed: ${seed}\n`);
  
  const result = verifyBoard(seed);
  console.log(`Grid: ${result.gridSize}x${result.gridSize}`);
  console.log(`Bombs: ${result.bombCount}`);
  console.log(`\nBomb positions:`);
  result.bombs.forEach(pos => console.log(`  💣 ${pos}`));
  
  // Visual board
  const board = generateBoard(seed);
  console.log('\nBoard (X = bomb, . = safe):');
  for (const row of board) {
    console.log(row.map(c => c.hasBomb ? 'X' : '.').join(' '));
  }
}
