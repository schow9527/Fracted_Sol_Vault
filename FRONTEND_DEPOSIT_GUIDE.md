## 前端对接指南：deposit_from_user（已部署并初始化）

你当前的 Program 已部署并完成 initialize。下面直接说明前端如何调用 `deposit_from_user`，以及（可选）在入金成功后原子转发一次外部 CPI 指令（例如跨链发送）。

### 一、方法与参数
- 方法签名：
  - `deposit_from_user(amount: u64, post_ix_data: Vec<u8>)`
- 参数含义：
  - `amount`：最小单位金额（例 USDC 6 位，1 USDC = 1_000_000）
  - `post_ix_data`：外部程序指令的序列化 data（含 discriminator + 参数）。不需要转发时传空字节（前端 TS 用 `Buffer.from([])`）

### 二、必需账户（前端需准备/派生）
- `config`：PDA(["config"], programId)  是这个X6ci3v3wgpFrRvmsFsjeemr1EDeaHaok23UsehuQcvn
- `user`：前端钱包公钥（付款人 signer）
- `userSourceToken`：用户 ATA，`ATA(mint, user)`
- `vaultAuthority`：PDA(["vault", config])（只读）是这个 A9QYh2sTEN3XFFk95WZr2hsLFMC2781oPwKexPySNJrt
- `vaultTokenAccount`：金库 ATA，`ATA(mint, vaultAuthority, allowOffCurve=true)`  这个FbK1BUmHbH3aGeepmg8tUksmfyNTmjqj79cyJBPXWXrL
- `mint`：代币 Mint（必须在白名单）这个 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
- `tokenProgram`：SPL Token 程序ID（等于 `mint.owner`；SPL=Tokenkeg… 或 Token-2022=TokenzQd…）

说明：你已通过 `scripts/initVault.ts` 初始化并创建金库 ATA；若某个 mint 的金库 ATA 仍缺失，脚本（或 `--create-atas` 参数）会自动补齐（会根据 `mint.owner` 选择 SPL/2022）。

### 三、可选账户（需要入金后 CPI 时）
- `postProgram`：外部程序的 programId（不转发时传 `undefined`）
- `remainingAccounts`：外部程序该指令所需的所有账户，严格按对方指令 IDL 的账户顺序传入（Anchor TS 用 `.remainingAccounts([...])` 追加）

示例：若对方为 OApp 的 `RelaySend`，则 remainingAccounts 至少包含 `peer`、`store`（对方签名用 PDA）、`endpoint`、`caller` 以及 `Endpoint::send` 需要的其它账户。

### 四、前端调用范式（Anchor TS）
```ts
// 示例：devnet，USDC 6位小数（1 USDC = 1_000_000）
// Program ID: GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1
const amount = 1_000_000n; // 1 USDC
const sig = await program.methods
  .depositFromUser(new anchor.BN(amount.toString()), Buffer.from([])) // 不转发时传空
  .accounts({
    config: configPda,
    user: wallet.publicKey,
    userSourceToken: userAta,
    vaultAuthority,
    vaultTokenAccount: vaultAta,
    mint,              // 例：devnet USDC 4zMMC9...
    tokenProgram,      // 等于 mint.owner
    postProgram: undefined, // 不需要转发时显式传 undefined
  })
  // 需要转发时：把 post_ix_data 替换为对方指令 data，并在这里追加对方所需账户
  // .remainingAccounts([...])
  .rpc();
```

### 五、入金后 CPI 的约束与建议
- 原子性：外部 CPI 失败则整笔交易回滚，入金不会落地（默认行为，安全）。
- 签名：
  - 你无法替对方程序的 PDA 签名；应当让“对方程序”在其自身内部使用 PDA seeds 调用 `invoke_signed`（例如用 `store` PDA 签 `Endpoint::send`）。
  - `deposit_from_user` 只负责把 `postProgram` 与 `remainingAccounts` 原样转发过去。
- 白名单（建议）：
  - 在后续版本中可在 `Config` 增加 `allowed_post_programs` 并在指令内校验 `postProgram`，以避免被恶意转发。
- 账户一致性校验（建议）：
  - 前端在传入 `remainingAccounts` 前，自查关键账户 owner、mint 一致性，减少失败率。

### 六、快速检查清单
- 金额与小数位正确（amount 用最小单位；USDT 常见为 6 个 0）
- `userSourceToken.mint == mint`，`vaultTokenAccount.mint == mint`，`mint` 在白名单。
- `tokenProgram == mint.owner`。
- 如需转发：`post_ix_data` 为对方指令 data；`postProgram` 为对方 programId；`remainingAccounts` 按对方 IDL 顺序齐全。

