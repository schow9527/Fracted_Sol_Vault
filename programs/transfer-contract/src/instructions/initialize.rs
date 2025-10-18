use anchor_lang::prelude::*;
use crate::state::{Config, ErrorCode, CONFIG_SEED, VAULT_SEED, MAX_ALLOWED_MINTS};

pub fn handler(
    ctx: Context<Initialize>,
    allowed_caller_authority: Pubkey,
    allowed_mints: Vec<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.allowed_caller_authority = allowed_caller_authority;
    require!(allowed_mints.len() >= 1 && allowed_mints.len() <= MAX_ALLOWED_MINTS, ErrorCode::MintNotAllowed);
    config.allowed_mints = allowed_mints;
    // Anchor 0.32: bumps is a generated struct with fields per account
    config.vault_authority_bump = ctx.bumps.vault_authority;
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 4 + (32 * MAX_ALLOWED_MINTS) + 1,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        seeds = [VAULT_SEED, config.key().as_ref()],
        bump
    )]
    /// CHECK: PDA used only as signing authority
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}


