'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Cell = {
  x: number
  y: number
  revealed: boolean
  hasBomb?: boolean
  adjacentBombs?: number
}

type Agent = {
  id: string
  name: string
  avatar: string
  alive: boolean
}

type Move = {
  round: number
  agent: string
  action: string
  type: 'move' | 'elimination'
}

type GameState = {
  id: string
  status: 'waiting' | 'live' | 'finished'
  round: number
  timeLeft: number
  pool: number
  winner?: string
  agents: Agent[]
  board: Cell[][]
  moves: Move[]
}

// Generate mock board
function generateMockBoard(): Cell[][] {
  const board: Cell[][] = []
  for (let y = 0; y < 10; y++) {
    const row: Cell[] = []
    for (let x = 0; x < 10; x++) {
      const revealed = Math.random() > 0.5
      row.push({
        x, y,
        revealed,
        hasBomb: !revealed && Math.random() < 0.1,
        adjacentBombs: revealed ? Math.floor(Math.random() * 4) : undefined
      })
    }
    board.push(row)
  }
  return board
}

const initialState: GameState = {
  id: 'game_001',
  status: 'live',
  round: 5,
  timeLeft: 8,
  pool: 500,
  agents: [
    { id: '1', name: 'ALPHA-7', avatar: '🤖', alive: true },
    { id: '2', name: 'NEXUS', avatar: '🧠', alive: true },
    { id: '3', name: 'CIPHER', avatar: '🔮', alive: false },
    { id: '4', name: 'VOLT', avatar: '⚡', alive: true },
    { id: '5', name: 'ORACLE', avatar: '👁️', alive: true },
  ],
  board: generateMockBoard(),
  moves: [
    { round: 5, agent: 'ALPHA-7', action: 'click (3,4)', type: 'move' },
    { round: 5, agent: 'NEXUS', action: 'click (7,2)', type: 'move' },
    { round: 4, agent: 'CIPHER', action: 'ELIMINATED 💀', type: 'elimination' },
    { round: 4, agent: 'VOLT', action: 'click (1,1)', type: 'move' },
    { round: 3, agent: 'ORACLE', action: 'click (5,5)', type: 'move' },
  ]
}

export default function GamePage({ params }: { params: { id: string } }) {
  const [game, setGame] = useState<GameState>(initialState)
  const [showGameOver, setShowGameOver] = useState(false)

  // Timer countdown
  useEffect(() => {
    if (game.status !== 'live') return
    
    const timer = setInterval(() => {
      setGame(prev => {
        if (prev.timeLeft <= 0) {
          // Simulate new round
          return simulateRound(prev)
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 }
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [game.status])

  // Check for game over
  useEffect(() => {
    const aliveCount = game.agents.filter(a => a.alive).length
    if (aliveCount === 1 && game.status === 'live') {
      const winner = game.agents.find(a => a.alive)
      setGame(prev => ({ ...prev, status: 'finished', winner: winner?.name }))
      setShowGameOver(true)
    }
  }, [game.agents, game.status])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <header className="flex justify-between items-center pb-4 border-b-2 border-neon-green mb-6">
        <Link href="/" className="font-pixel text-lg text-neon-green glow-green hover:scale-105 transition-transform">
          💣 HAPPYBOMBER
        </Link>
        
        <div className="flex items-center gap-8 text-xl">
          <span className="text-neon-pink">
            ROUND <span className="font-pixel">{game.round}</span>
          </span>
          <span className="font-pixel text-3xl text-neon-yellow glow-yellow animate-blink">
            {game.timeLeft.toString().padStart(2, '0')}
          </span>
        </div>
        
        <div className="font-pixel text-lg text-neon-yellow glow-yellow">
          💰 ${game.pool}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Board */}
        <div className="flex justify-center">
          <div className="grid grid-cols-10 gap-1 p-4 bg-gray-900 border-4 border-neon-green box-glow-green">
            {game.board.flat().map((cell, i) => (
              <div
                key={i}
                className={`
                  w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-lg md:text-xl font-bold
                  transition-all duration-150
                  ${cell.revealed 
                    ? cell.hasBomb 
                      ? 'bg-danger-red animate-pulse' 
                      : 'bg-bg-card'
                    : 'bg-gray-700 hover:bg-gray-600'
                  }
                `}
              >
                {cell.revealed && (
                  cell.hasBomb 
                    ? '💣' 
                    : cell.adjacentBombs && cell.adjacentBombs > 0 
                      ? <span className={`cell-${cell.adjacentBombs}`}>{cell.adjacentBombs}</span>
                      : ''
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Agents Panel */}
          <div className="bg-bg-card border border-gray-800 p-4">
            <h2 className="font-pixel text-xs text-neon-pink mb-4 pb-2 border-b border-gray-800">
              👾 AGENTS
            </h2>
            <div className="space-y-2">
              {game.agents.map(agent => (
                <div
                  key={agent.id}
                  className={`
                    flex items-center gap-3 p-3 
                    ${agent.alive 
                      ? game.winner === agent.name 
                        ? 'bg-neon-green/20 border border-neon-green' 
                        : 'bg-white/5'
                      : 'opacity-40 line-through'
                    }
                  `}
                >
                  <span className="text-2xl">{agent.avatar}</span>
                  <span className="flex-1">{agent.name}</span>
                  <span className={agent.alive ? 'text-neon-green' : 'text-danger-red'}>
                    {agent.alive ? '● ALIVE' : '☠ DEAD'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Move Log */}
          <div className="bg-bg-card border border-gray-800 p-4">
            <h2 className="font-pixel text-xs text-neon-pink mb-4 pb-2 border-b border-gray-800">
              📜 MOVE LOG
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {game.moves.map((move, i) => (
                <div key={i} className="flex gap-3 text-sm border-b border-gray-800/50 pb-2">
                  <span className="text-gray-500 w-8">R{move.round}</span>
                  <span className="flex-1">{move.agent}</span>
                  <span className={move.type === 'elimination' ? 'text-danger-red' : 'text-neon-blue'}>
                    {move.action}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Game Over Modal */}
      {showGameOver && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center flex-col z-50">
          <div className="font-pixel text-3xl text-neon-green glow-green mb-4">
            🏆 WINNER
          </div>
          <div className="font-pixel text-5xl text-neon-yellow glow-yellow mb-4">
            {game.winner}
          </div>
          <div className="font-pixel text-4xl text-neon-yellow glow-yellow mb-8">
            ${Math.floor(game.pool * 0.95)} USDC
          </div>
          <button 
            onClick={() => alert('Seed: abc123...\n\nVerify: npx happybomber-verify --seed abc123')}
            className="border-2 border-neon-pink text-neon-pink px-8 py-4 font-pixel text-sm hover:bg-neon-pink hover:text-black transition-colors"
          >
            🔍 VERIFY FAIRNESS
          </button>
          <Link 
            href="/"
            className="mt-4 text-gray-500 hover:text-white"
          >
            ← Back to games
          </Link>
        </div>
      )}
    </div>
  )
}

// Simulate a round for demo purposes
function simulateRound(prev: GameState): GameState {
  const aliveAgents = prev.agents.filter(a => a.alive)
  if (aliveAgents.length <= 1) return prev

  // Random reveal
  const unrevealedCells = prev.board.flat().filter(c => !c.revealed)
  if (unrevealedCells.length === 0) return prev

  const targetCell = unrevealedCells[Math.floor(Math.random() * unrevealedCells.length)]
  const newBoard = prev.board.map(row => 
    row.map(cell => 
      cell.x === targetCell.x && cell.y === targetCell.y 
        ? { ...cell, revealed: true }
        : cell
    )
  )

  const newMoves = [...prev.moves]
  let newAgents = [...prev.agents]

  // Random agent makes the move
  const actor = aliveAgents[Math.floor(Math.random() * aliveAgents.length)]

  if (targetCell.hasBomb) {
    // Someone dies!
    newAgents = prev.agents.map(a => 
      a.id === actor.id ? { ...a, alive: false } : a
    )
    newMoves.unshift({
      round: prev.round + 1,
      agent: actor.name,
      action: 'ELIMINATED 💀',
      type: 'elimination'
    })
  } else {
    newMoves.unshift({
      round: prev.round + 1,
      agent: actor.name,
      action: `click (${targetCell.x},${targetCell.y})`,
      type: 'move'
    })
  }

  return {
    ...prev,
    round: prev.round + 1,
    timeLeft: 10,
    board: newBoard,
    agents: newAgents,
    moves: newMoves.slice(0, 20)
  }
}
