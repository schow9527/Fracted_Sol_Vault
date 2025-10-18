## 远程程序如何调用本合约（transfer_contract）

本合约提供金库转账与流动性（LP）相关指令。远程程序最常用的是通过 CPI 调用 `transfer_out` 从金库打款给指定收款人。

### 基本信息
- Program ID：见 `declare_id!` 或 `target/deploy/transfer_contract-keypair.json`
- PDA
  - `config` = PDA(["config"])（全局配置）
  - `vault_authority` = PDA(["vault", config])（金库签名人）
- 金库 ATA：mint 对应的 ATA，owner=`vault_authority`


#### 允许你的程序调用（allowed_caller_authority）
在初始化脚本initVault.ts时：
    ----allowed-caller <使用你程序能签名的 PDA 地址（固定 seeds）>


如果已经初始化完毕，需要更换允许的调用方，可选择：
- 重新部署并用新的 `allowed_caller_authority` 初始化；
- 或添加一条 `set_allowed_caller(new_pubkey)` 指令（当前仓库未实现，若需要可补充）。

### 你的程序如何通过 CPI 调用 transfer_out
安全要点：
- 你的程序需使用它自己的 PDA 作为 `authority` 传入，并在发起 CPI 时用 `invoke_signed`（Anchor: `new_with_signer`）让该 PDA 成为 signer。
- 本合约会校验 `authority` 是否等于 `config.allowed_caller_authority`，并且是 signer。

依赖（在你的 on-chain 程序 `Cargo.toml`）：
```toml
[dependencies]
anchor-lang = "0.32.1"
# 引用本合约 crate（建议使用 git 或 path 依赖），并启用 cpi feature
transfer-contract = { package = "transfer-contract", path = "../transfer-contract/programs/transfer-contract", features = ["cpi"] }
```

示例（你程序的指令内，使用 Anchor CPI）：
```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed; // 仅示意
use transfer_contract::{self, program::transfer_contract as transfer_program};

#[derive(Accounts)]
pub struct PayViaVault<'info> {
    // 来自对方（vault）合约的账户
    /// CHECK: config PDA（seeds=["config"])
    pub config: AccountInfo<'info>,
    /// CHECK: vault_authority PDA（seeds=["vault", config]）
    pub vault_authority: AccountInfo<'info>,
    #[account(mut)]
    pub vault_token_account: AccountInfo<'info>,
    #[account(mut)]
    pub recipient_token_account: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,

    // 你自己程序的 PDA，作为 authority 传入并由你签名（invoke_signed）
    /// CHECK: your caller PDA, must match allowed_caller_authority
    pub caller_pda: AccountInfo<'info>,

    // 程序引用
    pub transfer_program: Program<'info, transfer_contract::program::TransferContract>,
}

pub fn handler(ctx: Context<PayViaVault>, amount: u64, caller_bump: u8) -> Result<()> {
    // 你的 PDA seeds（示例）
    let seeds: &[&[u8]] = &[b"caller_auth", /* 其它约定字段 */ &[caller_bump]];
    let signer = &[seeds];

    let cpi_accounts = transfer_contract::cpi::accounts::TransferOut {
        config: ctx.accounts.config.clone(),
        authority: ctx.accounts.caller_pda.clone(),
        vault_authority: ctx.accounts.vault_authority.clone(),
        vault_token_account: ctx.accounts.vault_token_account.clone(),
        recipient_token_account: ctx.accounts.recipient_token_account.clone(),
        mint: ctx.accounts.mint.clone(),
        token_program: ctx.accounts.token_program.clone(),
    };

    transfer_contract::cpi::transfer_out(
        CpiContext::new_with_signer(
            ctx.accounts.transfer_program.to_account_info(),
            cpi_accounts,
            signer,
        ),
        amount,
    )
}
```

注意：
- 请确保 `recipient_token_account.mint == mint`，`vault_token_account.mint == mint`；
- `mint` 必须在 `config.allowed_mints` 里；
- 金库对应的 ATA 需要已创建（本仓库的 `scripts/initVault.ts` 可自动创建）。

### deposit_from_user 的说明（用户入金）
`deposit_from_user` 要求“用户本人 signer”，从 `user_source_token` 转账到金库。
- 最简单：让客户端直接调用本合约的 `deposit_from_user`（或用本仓库提供的脚本）。
- 如果必须由你的程序发起：外层交易需要同时包含用户签名；或者改造为“delegate 代扣”模型（需要在本合约中增加 via delegate 的专用指令）。

### Token 程序兼容
- 本合约当前使用 `anchor_spl::token`（SPL Token）进行转账；
- 金库 ATA 创建脚本会根据 `mint.owner` 自动选择 SPL Token 或 Token-2022 作为 `token_program`。

### 常见错误与排查
- NotAuthorized：`authority` 不是 admin 且不等于 `allowed_caller_authority`；
- MintNotAllowed / MintMismatch：传入的 `mint` 不在白名单，或代币账户的 `mint` 不一致；
- InsufficientLiquidity（LP 赎回）：LP 头寸不足；
- “account already in use”：重复初始化 `config`；
- “recent blockhash fetch failed”：RPC 不可用或指向了未开启的本地节点。

### 附：如何准备 allowed_caller_authority
1) 在你的程序内约定 PDA seeds（例如 `[b"caller_auth"]` + 业务字段）；
2) 计算 PDA 地址，把它作为 `allowed_caller_authority` 写入本合约的初始化；
3) 发起 CPI 调用 `transfer_out` 时，用相同 seeds 调用 `new_with_signer`，让该 PDA 成为 signer。


