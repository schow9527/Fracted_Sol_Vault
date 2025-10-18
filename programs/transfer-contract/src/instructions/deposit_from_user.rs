use anchor_lang::prelude::*;
use anchor_spl::token as token;
use anchor_spl::token::{Mint, TokenAccount, Token, TransferChecked};

use crate::state::{Config, ErrorCode, CONFIG_SEED, VAULT_SEED};

pub fn handler(ctx: Context<DepositFromUser>, amount: u64) -> Result<()> {
    let config = &ctx.accounts.config;

    require!(config.is_allowed_mint(&ctx.accounts.mint.key()), ErrorCode::MintNotAllowed);
    require_keys_eq!(ctx.accounts.user_source_token.mint, ctx.accounts.mint.key(), ErrorCode::SourceMintMismatch);
    require_keys_eq!(ctx.accounts.vault_token_account.mint, ctx.accounts.mint.key(), ErrorCode::VaultMintMismatch);

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.user_source_token.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        amount,
        ctx.accounts.mint.decimals,
    )
}

#[derive(Accounts)]
pub struct DepositFromUser<'info> {
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_source_token: Account<'info, TokenAccount>,

    #[account(
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump = config.vault_authority_bump
    )]
    /// CHECK: PDA used only as signing authority
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}


