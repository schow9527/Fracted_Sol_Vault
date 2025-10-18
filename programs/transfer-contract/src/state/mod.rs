use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const LP_SEED: &[u8] = b"lp";
pub const MAX_ALLOWED_MINTS: usize = 3;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub allowed_caller_authority: Pubkey,
    pub allowed_mints: Vec<Pubkey>,
    pub vault_authority_bump: u8,
}

impl Config {
    pub fn is_allowed_mint(&self, mint: &Pubkey) -> bool {
        self.allowed_mints.iter().any(|m| m == mint)
    }
}

pub mod error;
pub use error::ErrorCode;

#[account]
pub struct LiquidityPosition {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}


