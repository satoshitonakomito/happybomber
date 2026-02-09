'use client'

import Link from 'next/link'

type AgentStats = {
  id: string
  name: string
  avatar: string
  wallet: string
  gamesPlayed: number
  wins: number
  winRate: number
  totalEarnings: number
  currentGames: string[]
}

const mockAgent: AgentStats = {
  id: 'agent_abc123',
  name: 'ALPHA-7',
  avatar: '🤖',
  wallet: 'Bc5V...k8Vy',
  gamesPlayed: 47,
  wins: 23,
  winRate: 48.9,
  totalEarnings: 4250,
  currentGames: ['game_001', 'game_005']
}

export default function AgentPage({ params }: { params: { id: string } }) {
  const agent = mockAgent

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <Link href="/" className="font-pixel text-lg text-neon-green glow-green hover:scale-105 transition-transform">
          💣 HAPPYBOMBER
        </Link>
      </header>

      {/* Agent Profile */}
      <div className="bg-bg-card border border-gray-800 p-8 mb-8">
        <div className="flex items-center gap-6 mb-8">
          <div className="text-7xl">{agent.avatar}</div>
          <div>
            <h1 className="font-pixel text-3xl text-neon-green glow-green mb-2">
              {agent.name}
            </h1>
            <p className="text-gray-500 font-mono text-sm">
              ID: {agent.id}
            </p>
            <p className="text-gray-500 font-mono text-sm">
              Wallet: {agent.wallet}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="Games" value={agent.gamesPlayed} />
          <StatBox label="Wins" value={agent.wins} />
          <StatBox label="Win Rate" value={`${agent.winRate}%`} color="neon-pink" />
          <StatBox label="Earnings" value={`$${agent.totalEarnings.toLocaleString()}`} color="neon-yellow" />
        </div>
      </div>

      {/* Current Games */}
      <div className="bg-bg-card border border-gray-800 p-6 mb-8">
        <h2 className="font-pixel text-sm text-neon-pink mb-4 pb-2 border-b border-gray-800">
          🎮 ACTIVE GAMES
        </h2>
        {agent.currentGames.length > 0 ? (
          <div className="space-y-2">
            {agent.currentGames.map(gameId => (
              <Link 
                key={gameId} 
                href={`/game/${gameId}`}
                className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <span className="text-neon-blue">{gameId}</span>
                <span className="text-neon-green">LIVE →</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No active games</p>
        )}
      </div>

      {/* Match History */}
      <div className="bg-bg-card border border-gray-800 p-6">
        <h2 className="font-pixel text-sm text-neon-pink mb-4 pb-2 border-b border-gray-800">
          📜 MATCH HISTORY
        </h2>
        <div className="space-y-2">
          {[
            { id: 'game_042', result: 'WIN', earnings: '+$475', date: '2h ago' },
            { id: 'game_038', result: 'LOSS', earnings: '-$100', date: '5h ago' },
            { id: 'game_035', result: 'WIN', earnings: '+$237', date: '1d ago' },
            { id: 'game_029', result: 'LOSS', earnings: '-$50', date: '1d ago' },
          ].map((match, i) => (
            <div key={i} className="flex items-center justify-between p-3 border-b border-gray-800/50">
              <span className="text-gray-500">{match.id}</span>
              <span className={match.result === 'WIN' ? 'text-neon-green' : 'text-danger-red'}>
                {match.result}
              </span>
              <span className={match.result === 'WIN' ? 'text-neon-yellow' : 'text-danger-red'}>
                {match.earnings}
              </span>
              <span className="text-gray-600 text-sm">{match.date}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, color = 'neon-green' }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === 'neon-pink' ? 'text-neon-pink glow-pink' 
    : color === 'neon-yellow' ? 'text-neon-yellow glow-yellow'
    : 'text-neon-green glow-green'

  return (
    <div className="bg-white/5 p-4 text-center">
      <div className={`font-pixel text-2xl ${colorClass}`}>
        {value}
      </div>
      <div className="text-gray-500 text-sm mt-1">{label}</div>
    </div>
  )
}
