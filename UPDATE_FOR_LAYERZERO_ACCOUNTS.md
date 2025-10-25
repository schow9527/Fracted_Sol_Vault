# ✅ 已修复：LayerZero 账户传递方式

## 问题原因

之前的错误：`An account required by the instruction is missing`

**原因**：LayerZero 相关账户通过 `remaining_accounts` 传递，但程序无法正确处理。

## 解决方案

现在 **LayerZero 账户直接定义在 `DepositFromUser` 结构中**，不再使用 `remaining_accounts`。

## 改动内容

### 1. **程序端（deposit_from_user.rs）**

添加了明确的 LayerZero 账户字段：

```rust
#[derive(Accounts)]
#[instruction(params: DepositParams)]
pub struct DepositFromUser<'info> {
    // ... 原有账户 ...
    
    // ===== LayerZero OApp 相关账户 =====
    
    /// CHECK: LayerZero OApp 程序
    #[account(address = Pubkey::try_from(LAYERZERO_OAPP_PROGRAM_ID).unwrap())]
    pub layerzero_oapp_program: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Peer 配置 PDA
    pub peer: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Store PDA
    pub store: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Endpoint PDA
    pub endpoint: UncheckedAccount<'info>,
    
    /// CHECK: LayerZero Endpoint 程序
    pub endpoint_program: UncheckedAccount<'info>,
}
```

### 2. **脚本端（depositFromUserWithLayerZero.ts）**

现在直接在 `.accounts()` 中传递，而不是 `.remainingAccounts()`：

```typescript
await program.methods
  .depositFromUser(params)
  .accounts({
    config: configPda,
    user: user.publicKey,
    userSourceToken: userAta,
    vaultAuthority,
    vaultTokenAccount: vaultAta,
    mint,
    tokenProgram,
    // LayerZero 账户 - 直接传递
    layerzeroOappProgram: LAYERZERO_OAPP_PROGRAM_ID,
    peer: peerPda,
    store: storePda,
    endpoint: endpointPda,
    endpointProgram: ENDPOINT_PROGRAM_ID,
  })
  .signers([user])
  .rpc();
```

## 如何测试

### 步骤 1：重新编译

```bash
anchor build
```

### 步骤 2：重新部署（如果需要）

```bash
anchor deploy --provider.cluster devnet
```

### 步骤 3：运行测试脚本

```bash
npx ts-node scripts/depositFromUserWithLayerZero.ts \
  --program GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1 \
  --mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
  --amount 2000000 \
  --dst-eid 84532 \
  --dst-token 0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673 \
  --merchant 0xD332d77BA77e4c793D92Ece36e2D28905E622cA7 \
  --rpc https://api.devnet.solana.com
```

## LayerZero 账户说明

### 必需的账户

1. **layerzeroOappProgram**: `CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH`
   - LayerZero OApp 程序 ID

2. **peer**: PDA
   - Seeds: `["peer", store_key, dst_eid (big-endian)]`
   - Program: LayerZero OApp

3. **store**: PDA
   - Seeds: `["store"]`
   - Program: LayerZero OApp

4. **endpoint**: PDA
   - Seeds: `["endpoint"]`
   - Program: LayerZero Endpoint (`76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6`)

5. **endpointProgram**: `76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6`
   - LayerZero Endpoint 程序 ID

### PDA 计算示例

脚本会自动计算这些 PDA：

```typescript
const LAYERZERO_OAPP_PROGRAM_ID = new PublicKey('CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH');
const ENDPOINT_PROGRAM_ID = new PublicKey('76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6');

// Store PDA
const [storePda] = PublicKey.findProgramAddressSync(
  [Buffer.from('store')],
  LAYERZERO_OAPP_PROGRAM_ID
);

// Peer PDA
const [peerPda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('peer'),
    storePda.toBuffer(),
    Buffer.from(new Uint32Array([dstEid]).buffer)
  ],
  LAYERZERO_OAPP_PROGRAM_ID
);

// Endpoint PDA
const [endpointPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('endpoint')],
  ENDPOINT_PROGRAM_ID
);
```

## 预期结果

### 成功时

```
调用 deposit_from_user with LayerZero...
参数:
  amount: 2000000
  dst_eid: 84532
  dst_token: 0x323e78f944A9a1FcF3a10efcC5319DBb0bB6e673
  merchant: 0xD332d77BA77e4c793D92Ece36e2D28905E622cA7
  native_fee: 0

LayerZero 账户:
  OApp Program: CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH
  Peer PDA: <PEER_PDA_ADDRESS>
  Store PDA: <STORE_PDA_ADDRESS>
  Endpoint PDA: <ENDPOINT_PDA_ADDRESS>
  Endpoint Program: 76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6

✅ deposit_from_user 成功!
交易签名: <SIGNATURE>
```

### 可能的错误

1. **账户不存在**
   - 确保 LayerZero OApp 已经初始化
   - 确保 peer 配置已经设置（针对目标链）

2. **Discriminator 不匹配**
   - 需要从 LayerZero OApp IDL 获取正确的 discriminator
   - 参考 `IMPORTANT_DISCRIMINATOR_NOTE.md`

3. **签名验证失败**
   - 确保 vault_authority PDA 地址正确
   - LayerZero OApp 需要授权你的合约作为 caller

## 下一步

如果测试成功：
1. ✅ 验证跨链消息是否发送到 EVM 链
2. ✅ 在 EVM 链验证消息解码是否正确
3. ✅ 测试不同的金额和目标链

如果测试失败：
1. 查看交易日志确定具体错误
2. 验证 discriminator 是否正确
3. 检查 LayerZero OApp 的授权配置


