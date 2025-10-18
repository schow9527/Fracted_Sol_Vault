use anchor_lang::prelude::*;

declare_id!("GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1");

pub mod state;
pub mod instructions;

// Re-export each generated client accounts module at crate root
// so the #[program] macro can find them under `crate::__client_accounts_<ix>`.
#[allow(unused_imports)]
use instructions::initialize::__client_accounts_initialize as __client_accounts_initialize;
#[allow(unused_imports)]
use instructions::deposit_from_user::__client_accounts_deposit_from_user as __client_accounts_deposit_from_user;
#[allow(unused_imports)]
use instructions::transfer_out::__client_accounts_transfer_out as __client_accounts_transfer_out;
#[allow(unused_imports)]
use instructions::lp_deposit::__client_accounts_lp_deposit as __client_accounts_lp_deposit;
#[allow(unused_imports)]
use instructions::lp_withdraw::__client_accounts_lp_withdraw as __client_accounts_lp_withdraw;

// Re-export account structs at crate root to satisfy Anchor codegen expectations
pub use instructions::initialize::Initialize as Initialize;
pub use instructions::deposit_from_user::DepositFromUser as DepositFromUser;
pub use instructions::transfer_out::TransferOut as TransferOut;
pub use instructions::lp_deposit::LpDeposit as LpDeposit;
pub use instructions::lp_withdraw::LpWithdraw as LpWithdraw;

#[program]
pub mod transfer_contract {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        allowed_caller_authority: Pubkey,
        allowed_mints: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, allowed_caller_authority, allowed_mints)
    }

    pub fn deposit_from_user(
        ctx: Context<DepositFromUser>,
        amount: u64,
    ) -> Result<()> {
        instructions::deposit_from_user::handler(ctx, amount)
    }

    pub fn transfer_out(
        ctx: Context<TransferOut>,
        amount: u64,
    ) -> Result<()> {
        instructions::transfer_out::handler(ctx, amount)
    }

    pub fn lp_deposit(
        ctx: Context<LpDeposit>,
        amount: u64,
    ) -> Result<()> {
        instructions::lp_deposit::handler(ctx, amount)
    }

    pub fn lp_withdraw(
        ctx: Context<LpWithdraw>,
        amount: u64,
    ) -> Result<()> {
        instructions::lp_withdraw::handler(ctx, amount)
    }
}

