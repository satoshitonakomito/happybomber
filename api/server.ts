/**
 * HAPPYBOMBER — API Server
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { v4 as uuid } from 'uuid';
import {
  Game,
  createGame,
  joinGame,
  startGame,
  submitMove,
  processRound,
  getPublicGameState,
  calculatePayouts,
  ROUND_TIME_MS,
} from '../game/state';
import { serializeBoardForClient } from '../game/board';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage (use DB in production)
const games = new Map<string, Game>();
const agents = new Map<string, { id: string; wallet: string }>();
const gameSubscribers = new Map<string, Set<WebSocket>>();

// Create HTTP server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const gameId = url.searchParams.get('gameId');
  
  if (gameId) {
    if (!gameSubscribers.has(gameId)) {
      gameSubscribers.set(gameId, new Set());
    }
    gameSubscribers.get(gameId)!.add(ws);
    
    ws.on('close', () => {
      gameSubscribers.get(gameId)?.delete(ws);
    });
  }
});

function broadcastToGame(gameId: string, event: string, data: any) {
  const subscribers = gameSubscribers.get(gameId);
  if (subscribers) {
    const message = JSON.stringify({ event, data });
    subscribers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// === API Routes ===

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Register agent
app.post('/api/agents/register', (req, res) => {
  const { wallet } = req.body;
  
  if (!wallet) {
    return res.status(400).json({ error: 'Wallet required' });
  }
  
  const agentId = `agent_${uuid().slice(0, 8)}`;
  agents.set(agentId, { id: agentId, wallet });
  
  res.json({
    agent_id: agentId,
    watch_url: `https://happybomber.fun/agent/${agentId}`,
  });
});

// List games
app.get('/api/games', (req, res) => {
  const { status } = req.query;
  
  let gamesList = Array.from(games.values());
  
  if (status) {
    gamesList = gamesList.filter(g => g.status === status);
  }
  
  // Sort by pool size (descending)
  gamesList.sort((a, b) => 
    (b.stakeAmount * b.agents.length) - (a.stakeAmount * a.agents.length)
  );
  
  res.json(gamesList.map(g => getPublicGameState(g)));
});

// Create game
app.post('/api/games', (req, res) => {
  const { stake, wallet } = req.body;
  
  if (!stake || stake <= 0) {
    return res.status(400).json({ error: 'Invalid stake amount' });
  }
  
  if (!wallet) {
    return res.status(400).json({ error: 'Wallet required' });
  }
  
  const gameId = `game_${uuid().slice(0, 8)}`;
  const game = createGame(gameId, wallet, stake);
  games.set(gameId, game);
  
  res.json(getPublicGameState(game));
});

// Get game
app.get('/api/games/:id', (req, res) => {
  const game = games.get(req.params.id);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  res.json(getPublicGameState(game));
});

// Get game state (with board)
app.get('/api/games/:id/state', (req, res) => {
  const { agentId } = req.query;
  const game = games.get(req.params.id);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const state = getPublicGameState(game);
  
  if (game.board) {
    (state as any).board = {
      revealed: serializeBoardForClient(game.board, agentId as string),
    };
  }
  
  res.json(state);
});

// Get game seed (for verification)
app.get('/api/games/:id/seed', (req, res) => {
  const game = games.get(req.params.id);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  if (game.status !== 'finished') {
    return res.status(403).json({ error: 'Seed only available after game ends' });
  }
  
  res.json({
    seed: game.seed,
    gridSize: 10,
    bombCount: 25,
  });
});

// Join game
app.post('/api/games/:id/join', (req, res) => {
  const { agentId, wallet } = req.body;
  const game = games.get(req.params.id);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  if (!agentId || !wallet) {
    return res.status(400).json({ error: 'agentId and wallet required' });
  }
  
  const result = joinGame(game, agentId, wallet);
  
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  
  broadcastToGame(game.id, 'player_joined', {
    agentId,
    playerCount: game.agents.length,
  });
  
  // Auto-start when full
  if (game.agents.length === 5) {
    const startResult = startGame(game);
    if (startResult.success) {
      broadcastToGame(game.id, 'game_started', {
        round: 1,
        deadline: game.roundDeadline,
      });
      
      // Schedule round processing
      scheduleRoundProcessing(game);
    }
  }
  
  res.json(getPublicGameState(game));
});

// Submit move
app.post('/api/games/:id/move', (req, res) => {
  const { agentId, action, x, y } = req.body;
  const game = games.get(req.params.id);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const result = submitMove(game, agentId, action, x, y);
  
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  
  res.json({ success: true });
});

// Round processing loop
function scheduleRoundProcessing(game: Game) {
  if (game.status !== 'live') return;
  
  const timeUntilDeadline = (game.roundDeadline || Date.now()) - Date.now();
  
  setTimeout(() => {
    if (game.status !== 'live') return;
    
    const result = processRound(game);
    
    broadcastToGame(game.id, 'round_result', {
      round: result.round,
      moves: result.moves,
      eliminations: result.eliminations,
      revealedCells: result.revealedCells.map(c => ({
        x: c.x,
        y: c.y,
        hasBomb: c.hasBomb,
        adjacentBombs: c.adjacentBombs,
      })),
    });
    
    if (game.status === 'finished') {
      const payouts = calculatePayouts(game);
      broadcastToGame(game.id, 'game_finished', {
        winner: game.winner,
        payouts,
        seed: game.seed,
      });
    } else {
      broadcastToGame(game.id, 'new_round', {
        round: game.currentRound,
        deadline: game.roundDeadline,
      });
      
      scheduleRoundProcessing(game);
    }
  }, Math.max(0, timeUntilDeadline));
}

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🎮 HAPPYBOMBER API running on port ${PORT}`);
});

export { app, server };
