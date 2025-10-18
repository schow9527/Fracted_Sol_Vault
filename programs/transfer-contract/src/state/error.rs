use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bump not found")] 
    BumpNotFound,
    #[msg("Mint not in allowed list")] 
    MintNotAllowed,
    #[msg("Not authorized to transfer out")] 
    NotAuthorized,
    #[msg("User source token account mint mismatch")] 
    SourceMintMismatch,
    #[msg("Recipient token account mint mismatch")] 
    RecipientMintMismatch,
    #[msg("Vault token account mint mismatch")] 
    VaultMintMismatch,
    #[msg("Insufficient liquidity to withdraw")] 
    InsufficientLiquidity,
}


