use anchor_lang::prelude::*;
use anchor_spl::token as token;
use anchor_spl::token::{Mint, TokenAccount, Token, TransferChecked};

use crate::state::{Config, LiquidityPosition, ErrorCode, CONFIG_SEED, VAULT_SEED, LP_SEED};

pub fn handler(ctx: Context<LpWithdraw>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;

    require!(config.is_allowed_mint(&ctx.accounts.mint.key()), ErrorCode::MintNotAllowed);
    require_keys_eq!(ctx.accounts.user_destination_token.mint, ctx.accounts.mint.key(), ErrorCode::RecipientMintMismatch);
    require_keys_eq!(ctx.accounts.vault_token_account.mint, ctx.accounts.mint.key(), ErrorCode::VaultMintMismatch);

    // check LP balance
    let lp = &mut ctx.accounts.liquidity_position;
    require!(lp.amount >= amount, ErrorCode::InsufficientLiquidity);
    lp.amount = lp.amount - amount;

    // transfer vault -> user using vault_authority signer
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_destination_token.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();

    let bump = config.vault_authority_bump;
    let config_key = ctx.accounts.config.key();
    let seeds: &[&[u8]] = &[VAULT_SEED, config_key.as_ref(), &[bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, &[seeds]),
        amount,
        ctx.accounts.mint.decimals,
    )
}

#[derive(Accounts)]
pub struct LpWithdraw<'info> {
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [LP_SEED, user.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub liquidity_position: Account<'info, LiquidityPosition>,

    #[account(
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.vault_authority_bump
    )]
    /// CHECK: PDA used only as signing authority
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_destination_token: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}


