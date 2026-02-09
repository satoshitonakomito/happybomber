/**
 * HAPPYBOMBER — Game State Machine
 */

import { Board, generateBoard, revealCell, isBoardCleared, getUnrevealedCells, Cell } from './board';
import { createHash, randomBytes } from 'crypto';

export type GameStatus = 'waiting' | 'live' | 'finished';

export type Agent = {
  id: string;
  wallet: string;
  alive: boolean;
  joinedAt: number;
};

export type Move = {
  agentId: string;
  action: 'click' | 'flag';
  x: number;
  y: number;
  timestamp: number;
};

export type RoundResult = {
  round: number;
  moves: Move[];
  eliminations: string[]; // agent IDs eliminated this round
  revealedCells: Cell[];
};

export type Game = {
  id: string;
  status: GameStatus;
  stakeAmount: number; // USDC
  creator: string;
  agents: Agent[];
  board: Board | null;
  seed: string | null;
  currentRound: number;
  roundDeadline: number | null;
  pendingMoves: Map<string, Move>;
  roundHistory: RoundResult[];
  winner: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export const MAX_AGENTS = 5;
export const ROUND_TIME_MS = 10000; // 10 seconds per round
export const HOUSE_FEE = 0.05; // 5%

/**
 * Create a new game
 */
export function createGame(id: string, creatorWallet: string, stakeAmount: number): Game {
  return {
    id,
    status: 'waiting',
    stakeAmount,
    creator: creatorWallet,
    agents: [],
    board: null,
    seed: null,
    currentRound: 0,
    roundDeadline: null,
    pendingMoves: new Map(),
    roundHistory: [],
    winner: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
}

/**
 * Join a game
 */
export function joinGame(game: Game, agentId: string, wallet: string): { success: boolean; error?: string } {
  if (game.status !== 'waiting') {
    return { success: false, error: 'Game already started' };
  }
  
  if (game.agents.length >= MAX_AGENTS) {
    return { success: false, error: 'Game is full' };
  }
  
  if (game.agents.some(a => a.id === agentId)) {
    return { success: false, error: 'Already joined' };
  }
  
  game.agents.push({
    id: agentId,
    wallet,
    alive: true,
    joinedAt: Date.now(),
  });
  
  return { success: true };
}

/**
 * Generate verifiable seed from blockhash + game ID
 * In production: blockhash comes from Solana
 */
export function generateSeed(gameId: string, blockhash?: string): string {
  const hash = blockhash || randomBytes(32).toString('hex');
  return createHash('sha256')
    .update(hash + gameId)
    .digest('hex');
}

/**
 * Start the game (when 5 agents have joined)
 */
export function startGame(game: Game, blockhash?: string): { success: boolean; error?: string } {
  if (game.status !== 'waiting') {
    return { success: false, error: 'Game not in waiting status' };
  }
  
  if (game.agents.length < MAX_AGENTS) {
    return { success: false, error: `Need ${MAX_AGENTS} agents to start` };
  }
  
  // Generate seed and board
  game.seed = generateSeed(game.id, blockhash);
  game.board = generateBoard(game.seed);
  game.status = 'live';
  game.currentRound = 1;
  game.roundDeadline = Date.now() + ROUND_TIME_MS;
  game.startedAt = Date.now();
  
  return { success: true };
}

/**
 * Submit a move for an agent
 */
export function submitMove(
  game: Game,
  agentId: string,
  action: 'click' | 'flag',
  x: number,
  y: number
): { success: boolean; error?: string } {
  if (game.status !== 'live') {
    return { success: false, error: 'Game not live' };
  }
  
  const agent = game.agents.find(a => a.id === agentId);
  if (!agent) {
    return { success: false, error: 'Agent not in game' };
  }
  
  if (!agent.alive) {
    return { success: false, error: 'Agent is eliminated' };
  }
  
  if (game.pendingMoves.has(agentId)) {
    return { success: false, error: 'Already submitted move this round' };
  }
  
  // Validate coordinates
  if (x < 0 || x >= 10 || y < 0 || y >= 10) {
    return { success: false, error: 'Invalid coordinates' };
  }
  
  // Can't click revealed cells
  if (action === 'click' && game.board![y][x].revealed) {
    return { success: false, error: 'Cell already revealed' };
  }
  
  game.pendingMoves.set(agentId, {
    agentId,
    action,
    x,
    y,
    timestamp: Date.now(),
  });
  
  return { success: true };
}

/**
 * Process end of round
 * - Apply all moves
 * - Check eliminations
 * - Check win conditions
 */
export function processRound(game: Game): RoundResult {
  if (game.status !== 'live' || !game.board) {
    throw new Error('Game not live');
  }
  
  const result: RoundResult = {
    round: game.currentRound,
    moves: [],
    eliminations: [],
    revealedCells: [],
  };
  
  const aliveAgents = game.agents.filter(a => a.alive);
  
  // Collect all moves (add random move for agents who didn't submit)
  for (const agent of aliveAgents) {
    let move = game.pendingMoves.get(agent.id);
    
    if (!move) {
      // Agent didn't submit - random safe cell if possible
      const unrevealed = getUnrevealedCells(game.board);
      const safeCells = unrevealed.filter(c => !c.hasBomb);
      
      if (safeCells.length > 0) {
        const randomCell = safeCells[Math.floor(Math.random() * safeCells.length)];
        move = {
          agentId: agent.id,
          action: 'click',
          x: randomCell.x,
          y: randomCell.y,
          timestamp: Date.now(),
        };
      } else {
        // No safe cells - must click random unrevealed
        if (unrevealed.length > 0) {
          const randomCell = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          move = {
            agentId: agent.id,
            action: 'click',
            x: randomCell.x,
            y: randomCell.y,
            timestamp: Date.now(),
          };
        }
      }
    }
    
    if (move) {
      result.moves.push(move);
    }
  }
  
  // Process all click moves
  for (const move of result.moves) {
    if (move.action !== 'click') continue;
    
    const cell = game.board[move.y][move.x];
    
    if (cell.revealed) continue; // Already revealed by another agent this round
    
    if (cell.hasBomb) {
      // Agent clicked a bomb - eliminated!
      const agent = game.agents.find(a => a.id === move.agentId);
      if (agent) {
        agent.alive = false;
        result.eliminations.push(agent.id);
      }
      cell.revealed = true;
      result.revealedCells.push(cell);
    } else {
      // Safe cell - reveal and cascade
      const revealed = revealCell(game.board, move.x, move.y);
      result.revealedCells.push(...revealed);
    }
  }
  
  // Process flag moves (after clicks)
  for (const move of result.moves) {
    if (move.action === 'flag') {
      const cell = game.board[move.y][move.x];
      if (!cell.revealed) {
        if (!cell.flaggedBy.includes(move.agentId)) {
          cell.flaggedBy.push(move.agentId);
        }
      }
    }
  }
  
  // Save round history
  game.roundHistory.push(result);
  
  // Check win conditions
  const stillAlive = game.agents.filter(a => a.alive);
  
  if (stillAlive.length === 0) {
    // All dead - last to die wins
    const lastEliminated = result.eliminations[result.eliminations.length - 1];
    game.winner = lastEliminated || game.agents[0].id;
    game.status = 'finished';
    game.finishedAt = Date.now();
  } else if (stillAlive.length === 1) {
    // One survivor - they win
    game.winner = stillAlive[0].id;
    game.status = 'finished';
    game.finishedAt = Date.now();
  } else if (isBoardCleared(game.board)) {
    // Board cleared - last clicker wins
    const lastClickMove = [...result.moves].reverse().find(m => m.action === 'click');
    game.winner = lastClickMove?.agentId || stillAlive[0].id;
    game.status = 'finished';
    game.finishedAt = Date.now();
  } else {
    // Continue to next round
    game.currentRound++;
    game.roundDeadline = Date.now() + ROUND_TIME_MS;
  }
  
  // Clear pending moves for next round
  game.pendingMoves.clear();
  
  return result;
}

/**
 * Calculate payouts
 */
export function calculatePayouts(game: Game): { winner: number; house: number } {
  const totalPool = game.stakeAmount * game.agents.length;
  const houseFee = Math.floor(totalPool * HOUSE_FEE);
  const winnerPayout = totalPool - houseFee;
  
  return {
    winner: winnerPayout,
    house: houseFee,
  };
}

/**
 * Get public game state (for API responses)
 */
export function getPublicGameState(game: Game, agentId?: string) {
  return {
    id: game.id,
    status: game.status,
    stakeAmount: game.stakeAmount,
    pool: game.stakeAmount * game.agents.length,
    agents: game.agents.map(a => ({
      id: a.id,
      alive: a.alive,
    })),
    currentRound: game.currentRound,
    roundDeadline: game.roundDeadline,
    timeRemaining: game.roundDeadline ? Math.max(0, game.roundDeadline - Date.now()) : null,
    winner: game.winner,
    seed: game.status === 'finished' ? game.seed : null, // Only reveal after game ends
  };
}
