use anchor_lang::prelude::*;

use crate::state::{Config, ErrorCode, CONFIG_SEED};

pub fn handler(ctx: Context<SetAllowedCaller>, new_allowed_caller: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    // only admin can update
    require_keys_eq!(ctx.accounts.admin.key(), config.admin, ErrorCode::NotAuthorized);
    config.allowed_caller_authority = new_allowed_caller;
    Ok(())
}

#[derive(Accounts)]
pub struct SetAllowedCaller<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,
}


