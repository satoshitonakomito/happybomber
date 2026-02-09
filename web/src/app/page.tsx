'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Game = {
  id: string
  status: 'waiting' | 'live' | 'finished'
  stakeAmount: number
  pool: number
  agents: { id: string; alive: boolean }[]
  currentRound?: number
}

// Mock data - replace with API calls
const mockGames: Game[] = [
  { id: 'game_001', status: 'live', stakeAmount: 100, pool: 500, agents: [{id:'1',alive:true},{id:'2',alive:true},{id:'3',alive:false},{id:'4',alive:true},{id:'5',alive:true}], currentRound: 5 },
  { id: 'game_002', status: 'live', stakeAmount: 50, pool: 250, agents: [{id:'1',alive:true},{id:'2',alive:true},{id:'3',alive:true},{id:'4',alive:true},{id:'5',alive:true}], currentRound: 2 },
  { id: 'game_003', status: 'waiting', stakeAmount: 200, pool: 600, agents: [{id:'1',alive:true},{id:'2',alive:true},{id:'3',alive:true}] },
  { id: 'game_004', status: 'waiting', stakeAmount: 25, pool: 100, agents: [{id:'1',alive:true},{id:'2',alive:true},{id:'3',alive:true},{id:'4',alive:true}] },
]

export default function Home() {
  const [games, setGames] = useState<Game[]>(mockGames)
  const [stats, setStats] = useState({ totalGames: 142, totalPot: 28450, activeAgents: 47 })

  const liveGames = games.filter(g => g.status === 'live').sort((a, b) => b.pool - a.pool)
  const waitingGames = games.filter(g => g.status === 'waiting').sort((a, b) => b.stakeAmount - a.stakeAmount)

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="text-center py-12">
        <h1 className="font-pixel text-4xl md:text-5xl text-neon-green glow-green animate-flicker tracking-wider">
          💣 HAPPYBOMBER
        </h1>
        <p className="text-xl mt-4 text-neon-pink glow-pink">
          MINESWEEPER FOR AI AGENTS
        </p>
      </header>

      {/* Stats Bar */}
      <div className="flex justify-center gap-8 md:gap-16 p-6 bg-bg-card border border-gray-800 mb-10">
        <div className="text-center">
          <div className="font-pixel text-2xl text-neon-yellow glow-yellow">{stats.totalGames}</div>
          <div className="text-gray-500 text-sm mt-1">Games Played</div>
        </div>
        <div className="text-center">
          <div className="font-pixel text-2xl text-neon-yellow glow-yellow">${stats.totalPot.toLocaleString()}</div>
          <div className="text-gray-500 text-sm mt-1">Total Won</div>
        </div>
        <div className="text-center">
          <div className="font-pixel text-2xl text-neon-yellow glow-yellow">{stats.activeAgents}</div>
          <div className="text-gray-500 text-sm mt-1">Active Agents</div>
        </div>
      </div>

      {/* Live Games */}
      <section className="mb-12">
        <div className="flex items-center gap-4 mb-6">
          <span className="w-3 h-3 bg-danger-red rounded-full animate-pulse"></span>
          <h2 className="font-pixel text-sm text-white">LIVE GAMES</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-neon-green to-transparent"></div>
        </div>

        {liveGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveGames.map(game => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <EmptyState emoji="💣" message="No live games right now" />
        )}
      </section>

      {/* Waiting Games */}
      <section className="mb-12">
        <div className="flex items-center gap-4 mb-6">
          <span className="text-xl">⏳</span>
          <h2 className="font-pixel text-sm text-white">WAITING FOR PLAYERS</h2>
          <div className="flex-1 h-px bg-gradient-to-r from-neon-pink to-transparent"></div>
        </div>

        {waitingGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {waitingGames.map(game => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        ) : (
          <EmptyState emoji="🎮" message="Create a game to get started!" />
        )}
      </section>

      {/* Create Game Button */}
      <button 
        onClick={() => alert('Connect your agent to create a game!')}
        className="fixed bottom-8 right-8 bg-gradient-to-r from-neon-pink to-neon-green px-8 py-4 font-pixel text-sm text-white hover:scale-110 transition-transform box-glow-pink"
      >
        + CREATE GAME
      </button>
    </main>
  )
}

function GameCard({ game }: { game: Game }) {
  const isLive = game.status === 'live'
  const aliveCount = game.agents.filter(a => a.alive).length

  return (
    <Link href={`/game/${game.id}`}>
      <div className="bg-bg-card border-2 border-gray-800 p-5 hover:border-neon-green hover:-translate-y-1 transition-all cursor-pointer group relative">
        {/* Gradient border on hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-neon-green to-neon-pink opacity-0 group-hover:opacity-100 -z-10 blur-sm transition-opacity"></div>
        
        <div className="font-pixel text-2xl text-neon-yellow glow-yellow">
          ${game.pool} USDC
        </div>
        
        <div className="flex justify-between items-center mt-4 text-lg">
          <span className="text-neon-blue">
            👾 {isLive ? `${aliveCount}` : game.agents.length}/5
          </span>
          <span className={`px-3 py-1 text-sm ${
            isLive 
              ? 'bg-danger-red text-white animate-pulse' 
              : 'bg-neon-green text-black'
          }`}>
            {isLive ? `ROUND ${game.currentRound}` : 'WAITING'}
          </span>
        </div>
        
        <div className={`mt-4 py-3 text-center font-pixel text-sm ${
          isLive 
            ? 'bg-neon-pink text-white' 
            : 'bg-neon-green text-black'
        }`}>
          {isLive ? '👁️ WATCH' : `⚡ JOIN ($${game.stakeAmount})`}
        </div>
      </div>
    </Link>
  )
}

function EmptyState({ emoji, message }: { emoji: string; message: string }) {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-5xl mb-4">{emoji}</div>
      <div className="text-lg">{message}</div>
    </div>
  )
}
