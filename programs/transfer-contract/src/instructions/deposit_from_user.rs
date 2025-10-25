use anchor_lang::prelude::*;
use anchor_spl::token as token;
use anchor_spl::token::{Mint, TokenAccount, Token, TransferChecked};
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::invoke_signed;

use crate::state::{Config, ErrorCode, CONFIG_SEED, VAULT_SEED};

// LayerZero 相关常量
const LAYERZERO_OAPP_PROGRAM_ID: &str = "CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH";
const LAYERZERO_ENDPOINT_PROGRAM_ID: &str = "76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6";
const TAG_TOKEN_PAYOUT: u8 = 101;
const PEER_SEED: &[u8] = b"Peer";
const STORE_SEED: &[u8] = b"Store";
const ENDPOINT_SEED: &[u8] = b"Endpoint";

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, DepositFromUser<'info>>, params: DepositParams) -> Result<()> {
    let config = &ctx.accounts.config;

    // 验证 mint 是否在允许列表中
    require!(config.is_allowed_mint(&ctx.accounts.mint.key()), ErrorCode::MintNotAllowed);
    require_keys_eq!(ctx.accounts.user_source_token.mint, ctx.accounts.mint.key(), ErrorCode::SourceMintMismatch);
    require_keys_eq!(ctx.accounts.vault_token_account.mint, ctx.accounts.mint.key(), ErrorCode::VaultMintMismatch);

    // 执行代币转账：从用户账户到金库
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.user_source_token.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token::transfer_checked(
        CpiContext::new(cpi_program, cpi_accounts),
        params.amount,
        ctx.accounts.mint.decimals,
    )?;

    // 编码跨链消息：模拟 EVM 的 abi.encode(TAG_TOKEN_PAYOUT, dst_token, merchant, amount)
    let message = encode_evm_message(
        TAG_TOKEN_PAYOUT,
        &params.dst_token,
        &params.merchant,
        params.amount,
    );

    // 调用 LayerZero OApp 的 relay_send
    // 如果前端没有传递这些参数，使用默认值
    let options = params.options.unwrap_or_default(); // 空 Vec
    let native_fee = params.native_fee.unwrap_or(1_000_000); //0.001 SOL
    let lz_token_fee = params.lz_token_fee.unwrap_or(0);
    
    call_relay_send(
        &ctx.accounts.layerzero_oapp_program,
        &ctx.accounts.peer,
        &ctx.accounts.store,
        &ctx.accounts.endpoint,
        &ctx.accounts.endpoint_program,
        &ctx.accounts.vault_authority,
        params.dst_eid,
        message,
        options,
        native_fee,
        lz_token_fee,
        config.vault_authority_bump,
        config.key(),
    )?;

    // 发出事件
    emit!(DepositEvent {
        user: ctx.accounts.user.key(),
        mint: ctx.accounts.mint.key(),
        amount: params.amount,
        dst_eid: params.dst_eid,
        dst_token: params.dst_token,
        merchant: params.merchant,
    });

    Ok(())
}

/// 编码消息，模拟 Solidity 的 abi.encode(uint8, address, address, uint256)
/// Solidity abi.encode 会将每个参数 padding 到 32 字节
fn encode_evm_message(tag: u8, dst_token: &[u8; 32], merchant: &[u8; 32], amount: u64) -> Vec<u8> {
    let mut message = Vec::with_capacity(128);
    
    // uint8 tag: padding 到 32 字节（左边补 0）
    let mut tag_bytes = [0u8; 32];
    tag_bytes[31] = tag;
    message.extend_from_slice(&tag_bytes);
    
    // address dst_token: 32 字节（EVM 地址 20 字节，左边补 12 个 0）
    message.extend_from_slice(dst_token);
    
    // address merchant: 32 字节（EVM 地址 20 字节，左边补 12 个 0）
    message.extend_from_slice(merchant);
    
    // uint256 amount: 将 u64 转换为 32 字节大端序
    let mut amount_bytes = [0u8; 32];
    amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());
    message.extend_from_slice(&amount_bytes);
    
    message
}

/// 调用 LayerZero OApp 的 relay_send
fn call_relay_send<'info>(
    layerzero_oapp_program: &AccountInfo<'info>,
    peer: &AccountInfo<'info>,
    store: &AccountInfo<'info>,
    endpoint: &AccountInfo<'info>,
    endpoint_program: &AccountInfo<'info>,
    vault_authority: &AccountInfo<'info>,
    dst_eid: u32,
    message: Vec<u8>,
    options: Vec<u8>,
    native_fee: u64,
    lz_token_fee: u64,
    vault_bump: u8,
    config_key: Pubkey,
) -> Result<()> {
    // relay_send 的参数结构
    #[derive(AnchorSerialize)]
    struct RelaySendParams {
        dst_eid: u32,
        message: String,
        options: Vec<u8>,
        native_fee: u64,
        lz_token_fee: u64,
    }

    // 将字节转换为 hex 字符串（EVM 格式）
    let message_hex = format!("0x{}", hex::encode(&message));
    
    let relay_params = RelaySendParams {
        dst_eid,
        message: message_hex,
        options,
        native_fee,
        lz_token_fee,
    };

    // 序列化参数
    let mut data = Vec::new();
    // 添加 relay_send 的方法标识符（8 字节的 Anchor discriminator）
    // 注意：这个值需要从 LayerZero OApp 的 IDL 中验证
    let discriminator: [u8; 8] = [
        152,242,87,43,84,188,143,155
    ]; // sighash("global:relay_send")
    data.extend_from_slice(&discriminator);
    relay_params.serialize(&mut data)?;

    // 构建账户列表 - 对应 RelaySend 结构
    let account_metas = vec![
        // peer - 需要验证的 PDA
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
            peer.key(),
            false,
        ),
        // store - 需要验证的 PDA
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
            store.key(),
            false,
        ),
        // endpoint - 跨程序 PDA
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
            endpoint.key(),
            false,
        ),
        // caller (vault_authority) - 作为签名者
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
            vault_authority.key(),
            true, // is_signer = true
        ),
        // 可能还需要 endpoint_program 和其他账户，具体看 relay_send 的实现
        // 这里先只传递基本的 4 个账户
    ];

    // 构建 CPI 指令
    let ix = Instruction {
        program_id: layerzero_oapp_program.key(),
        accounts: account_metas,
        data,
    };

    // 准备 account_infos
    let account_infos = vec![
        peer.clone(),
        store.clone(),
        endpoint.clone(),
        vault_authority.clone(),
        endpoint_program.clone(), // 可能需要
    ];

    // 使用 vault_authority PDA 签名进行 CPI 调用
    let seeds: &[&[u8]] = &[VAULT_SEED, config_key.as_ref(), &[vault_bump]];
    let signer_seeds = &[seeds];
    
    invoke_signed(
        &ix,
        &account_infos,
        signer_seeds,
    )?;

    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DepositParams {
    /// 转账金额（必填）
    pub amount: u64,
    /// 目标链 ID (LayerZero EID)（必填）
    pub dst_eid: u32,
    /// 目标链的代币地址（EVM 地址，32 字节，左边补 12 个 0）（必填）
    pub dst_token: [u8; 32],
    /// 商户地址（EVM 地址，32 字节，左边补 12 个 0）（必填）
    pub merchant: [u8; 32],
    /// LayerZero 消息选项（可选，默认为空）
    pub options: Option<Vec<u8>>,
    /// LayerZero 原生代币手续费（可选，默认为 0）
    pub native_fee: Option<u64>,
    /// LayerZero 代币手续费（可选，默认为 0）
    pub lz_token_fee: Option<u64>,
}

#[derive(Accounts)]
#[instruction(params: DepositParams)]
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
    /// CHECK: PDA used only as signing authority for both token transfers and LayerZero CPI
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    
    // ===== LayerZero OApp 相关账户 =====
    
    /// CHECK: LayerZero OApp 程序
    #[account(address = Pubkey::try_from(LAYERZERO_OAPP_PROGRAM_ID).unwrap())]
    pub layerzero_oapp_program: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Peer 配置 PDA - 由 LayerZero OApp 程序验证
    pub peer: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Store PDA - 由 LayerZero OApp 程序验证
    pub store: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Endpoint PDA - 由 Endpoint 程序验证
    pub endpoint: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Endpoint 程序
    pub endpoint_program: UncheckedAccount<'info>,
}

#[event]
pub struct DepositEvent {
    pub user: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub dst_eid: u32,
    pub dst_token: [u8; 32],
    pub merchant: [u8; 32],
}


