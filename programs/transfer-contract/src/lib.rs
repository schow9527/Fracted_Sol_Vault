use anchor_lang::prelude::*;

declare_id!("GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1");

pub mod state;
pub mod instructions;

// Anchor 宏期望在 crate 根找到每个指令对应的 __client_accounts_* 模块
#[allow(non_snake_case)]
pub mod __client_accounts_initialize { pub use crate::instructions::initialize::__client_accounts_initialize::*; }
#[allow(non_snake_case)]
pub mod __client_accounts_deposit_from_user { pub use crate::instructions::deposit_from_user::__client_accounts_deposit_from_user::*; }
#[allow(non_snake_case)]
pub mod __client_accounts_transfer_out { pub use crate::instructions::transfer_out::__client_accounts_transfer_out::*; }
#[allow(non_snake_case)]
pub mod __client_accounts_lp_deposit { pub use crate::instructions::lp_deposit::__client_accounts_lp_deposit::*; }
#[allow(non_snake_case)]
pub mod __client_accounts_lp_withdraw { pub use crate::instructions::lp_withdraw::__client_accounts_lp_withdraw::*; }
#[allow(non_snake_case)]
pub mod __client_accounts_set_allowed_caller { pub use crate::instructions::set_allowed_caller::__client_accounts_set_allowed_caller::*; }

// (已在上方以 pub mod __client_accounts_* 定义，无需再重导入)

// Re-export account structs at crate root to satisfy Anchor codegen expectations
pub use instructions::initialize::Initialize as Initialize;
pub use instructions::deposit_from_user::DepositFromUser as DepositFromUser;
pub use instructions::transfer_out::TransferOut as TransferOut;
pub use instructions::lp_deposit::LpDeposit as LpDeposit;
pub use instructions::lp_withdraw::LpWithdraw as LpWithdraw;
pub use instructions::set_allowed_caller::SetAllowedCaller as SetAllowedCaller;

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
        post_ix_data: Vec<u8>,
    ) -> Result<()> {
        instructions::deposit_from_user::handler(ctx, amount, post_ix_data)
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

    pub fn set_allowed_caller(
        ctx: Context<SetAllowedCaller>,
        new_allowed_caller: Pubkey,
    ) -> Result<()> {
        instructions::set_allowed_caller::handler(ctx, new_allowed_caller)
    }
}

