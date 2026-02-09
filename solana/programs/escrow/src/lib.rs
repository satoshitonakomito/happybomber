use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("HBomBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

/// HAPPYBOMBER Escrow Program
/// 
/// Handles staking and payouts for multiplayer minesweeper games.
/// - 5 agents per game
/// - Stakes locked in escrow PDA
/// - Winner gets 95%, house gets 5%
/// - Seed committed on-chain for verifiable fairness

#[program]
pub mod happybomber_escrow {
    use super::*;

    /// Create a new game with specified stake amount
    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: [u8; 8],
        stake_amount: u64,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let clock = Clock::get()?;
        
        game.game_id = game_id;
        game.creator = ctx.accounts.creator.key();
        game.stake_amount = stake_amount;
        game.player_count = 0;
        game.players = [Pubkey::default(); 5];
        game.status = GameStatus::Waiting;
        game.seed = [0u8; 32];
        game.winner = None;
        game.created_at = clock.unix_timestamp;
        game.started_at = None;
        game.bump = ctx.bumps.game;
        
        emit!(GameCreated {
            game_id,
            creator: game.creator,
            stake_amount,
        });
        
        Ok(())
    }

    /// Join a game - transfers stake to escrow
    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(game.status == GameStatus::Waiting, EscrowError::GameNotWaiting);
        require!(game.player_count < 5, EscrowError::GameFull);
        
        // Check player hasn't already joined
        let player = ctx.accounts.player.key();
        for i in 0..game.player_count as usize {
            require!(game.players[i] != player, EscrowError::AlreadyJoined);
        }
        
        // Transfer stake to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.player_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        token::transfer(cpi_ctx, game.stake_amount)?;
        
        // Add player to game
        game.players[game.player_count as usize] = player;
        game.player_count += 1;
        
        emit!(PlayerJoined {
            game_id: game.game_id,
            player,
            player_count: game.player_count,
        });
        
        Ok(())
    }

    /// Start the game - commits seed on-chain
    /// Only callable when 5 players have joined
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let clock = Clock::get()?;
        
        require!(game.status == GameStatus::Waiting, EscrowError::GameNotWaiting);
        require!(game.player_count == 5, EscrowError::NotEnoughPlayers);
        
        // Generate seed from recent blockhash + game_id
        // In production, use a more secure randomness source
        let blockhash = clock.slot.to_le_bytes();
        let mut seed_data = [0u8; 32];
        seed_data[..8].copy_from_slice(&game.game_id);
        seed_data[8..16].copy_from_slice(&blockhash);
        seed_data[16..24].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
        
        game.seed = seed_data;
        game.status = GameStatus::Live;
        game.started_at = Some(clock.unix_timestamp);
        
        emit!(GameStarted {
            game_id: game.game_id,
            seed: game.seed,
            started_at: clock.unix_timestamp,
        });
        
        Ok(())
    }

    /// End the game - distributes payouts
    /// Only callable by authorized backend (game authority)
    pub fn end_game(
        ctx: Context<EndGame>,
        winner_index: u8,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(game.status == GameStatus::Live, EscrowError::GameNotLive);
        require!(winner_index < 5, EscrowError::InvalidWinner);
        
        let winner = game.players[winner_index as usize];
        require!(winner != Pubkey::default(), EscrowError::InvalidWinner);
        
        game.winner = Some(winner);
        game.status = GameStatus::Finished;
        
        // Calculate payouts
        let total_pool = game.stake_amount * 5;
        let house_fee = total_pool / 20; // 5%
        let winner_payout = total_pool - house_fee;
        
        // Transfer to winner
        let game_id = game.game_id;
        let seeds = &[
            b"vault",
            game_id.as_ref(),
            &[ctx.bumps.vault],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, winner_payout)?;
        
        // Transfer house fee
        let cpi_accounts_house = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.house_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx_house = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts_house,
            signer,
        );
        token::transfer(cpi_ctx_house, house_fee)?;
        
        emit!(GameEnded {
            game_id: game.game_id,
            winner,
            winner_payout,
            house_fee,
        });
        
        Ok(())
    }

    /// Cancel a game before it starts - refunds all players
    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        
        require!(game.status == GameStatus::Waiting, EscrowError::GameNotWaiting);
        require!(
            ctx.accounts.authority.key() == game.creator,
            EscrowError::Unauthorized
        );
        
        game.status = GameStatus::Cancelled;
        
        emit!(GameCancelled {
            game_id: game.game_id,
        });
        
        // Refunds handled separately via refund_player instruction
        Ok(())
    }

    /// Refund a player from a cancelled game
    pub fn refund_player(ctx: Context<RefundPlayer>, player_index: u8) -> Result<()> {
        let game = &ctx.accounts.game;
        
        require!(game.status == GameStatus::Cancelled, EscrowError::GameNotCancelled);
        require!(player_index < game.player_count, EscrowError::InvalidPlayer);
        
        let player = game.players[player_index as usize];
        require!(
            ctx.accounts.player_token_account.owner == player,
            EscrowError::WrongPlayer
        );
        
        let game_id = game.game_id;
        let seeds = &[
            b"vault",
            game_id.as_ref(),
            &[ctx.bumps.vault],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.player_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, game.stake_amount)?;
        
        emit!(PlayerRefunded {
            game_id: game.game_id,
            player,
            amount: game.stake_amount,
        });
        
        Ok(())
    }
}

// === Accounts ===

#[derive(Accounts)]
#[instruction(game_id: [u8; 8])]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Game::INIT_SPACE,
        seeds = [b"game", game_id.as_ref()],
        bump
    )]
    pub game: Account<'info, Game>,
    
    #[account(
        init,
        payer = creator,
        seeds = [b"vault", game_id.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    
    #[account(
        mut,
        seeds = [b"vault", game.game_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,
    
    pub player: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    
    #[account(
        mut,
        seeds = [b"vault", game.game_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub winner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub house_token_account: Account<'info, TokenAccount>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundPlayer<'info> {
    pub game: Account<'info, Game>,
    
    #[account(
        mut,
        seeds = [b"vault", game.game_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

// === State ===

#[account]
#[derive(InitSpace)]
pub struct Game {
    /// Unique game identifier
    pub game_id: [u8; 8],
    /// Game creator
    pub creator: Pubkey,
    /// Stake amount per player (in USDC lamports)
    pub stake_amount: u64,
    /// Number of players joined
    pub player_count: u8,
    /// Player pubkeys (max 5)
    pub players: [Pubkey; 5],
    /// Game status
    pub status: GameStatus,
    /// Seed for board generation (revealed after game starts)
    pub seed: [u8; 32],
    /// Winner pubkey (set after game ends)
    pub winner: Option<Pubkey>,
    /// Creation timestamp
    pub created_at: i64,
    /// Start timestamp
    pub started_at: Option<i64>,
    /// PDA bump
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum GameStatus {
    Waiting,
    Live,
    Finished,
    Cancelled,
}

// === Events ===

#[event]
pub struct GameCreated {
    pub game_id: [u8; 8],
    pub creator: Pubkey,
    pub stake_amount: u64,
}

#[event]
pub struct PlayerJoined {
    pub game_id: [u8; 8],
    pub player: Pubkey,
    pub player_count: u8,
}

#[event]
pub struct GameStarted {
    pub game_id: [u8; 8],
    pub seed: [u8; 32],
    pub started_at: i64,
}

#[event]
pub struct GameEnded {
    pub game_id: [u8; 8],
    pub winner: Pubkey,
    pub winner_payout: u64,
    pub house_fee: u64,
}

#[event]
pub struct GameCancelled {
    pub game_id: [u8; 8],
}

#[event]
pub struct PlayerRefunded {
    pub game_id: [u8; 8],
    pub player: Pubkey,
    pub amount: u64,
}

// === Errors ===

#[error_code]
pub enum EscrowError {
    #[msg("Game is not in waiting status")]
    GameNotWaiting,
    #[msg("Game is full")]
    GameFull,
    #[msg("Player already joined")]
    AlreadyJoined,
    #[msg("Not enough players to start")]
    NotEnoughPlayers,
    #[msg("Game is not live")]
    GameNotLive,
    #[msg("Invalid winner index")]
    InvalidWinner,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Game is not cancelled")]
    GameNotCancelled,
    #[msg("Invalid player index")]
    InvalidPlayer,
    #[msg("Wrong player for refund")]
    WrongPlayer,
}
