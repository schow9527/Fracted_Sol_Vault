# ⚠️ 重要：relay_send Discriminator 验证

## 关键说明

在实际部署和使用前，**必须验证** `relay_send` 的 discriminator 是否正确！

## 当前状态

代码中使用了硬编码的 discriminator：
```rust
let discriminator: [u8; 8] = [
    175, 175, 109, 31, 13, 152, 155, 237
]; // sighash("global:relay_send")
```

**这个值是理论计算值，需要从实际的 LayerZero OApp IDL 中验证！**

## 如何获取正确的 Discriminator

### 方法 1：从 IDL 文件获取（推荐）

1. 获取 LayerZero OApp 的 IDL 文件：
   ```bash
   # 从链上获取
   anchor idl fetch CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH -o layerzero_oapp.json
   ```

2. 在 IDL 中查找 `relay_send` 方法的 discriminator：
   ```json
   {
     "name": "relaySend",
     "discriminator": [175, 175, 109, 31, 13, 152, 155, 237]
   }
   ```

3. 将正确的值更新到代码中（`deposit_from_user.rs` 第 137-139 行）

### 方法 2：使用 TypeScript 计算

```typescript
import { sha256 } from '@noble/hashes/sha256';

function getDiscriminator(methodName: string): number[] {
  const hash = sha256(Buffer.from(`global:${methodName}`));
  return Array.from(hash.slice(0, 8));
}

const discriminator = getDiscriminator('relay_send');
console.log('Discriminator:', discriminator);
// 输出：[175, 175, 109, 31, 13, 152, 155, 237]
```

### 方法 3：使用 Rust 计算（离线）

```rust
use anchor_lang::solana_program::hash::hash;

fn main() {
    let discriminator = hash(b"global:relay_send").to_bytes();
    println!("Discriminator: {:?}", &discriminator[..8]);
}
```

## 验证步骤

### 测试前验证

1. **获取正确的 discriminator**（使用上述方法之一）

2. **更新代码**：
   修改 `programs/transfer-contract/src/instructions/deposit_from_user.rs` 第 137-139 行

3. **重新编译**：
   ```bash
   anchor build
   ```

4. **部署到 devnet 测试**

### 测试时验证

如果调用失败并出现以下错误，说明 discriminator 不正确：
- "Invalid instruction data"
- "Unknown instruction"
- 程序执行失败但没有明确错误信息

## 备选方案：使用 Anchor CPI

如果可以获取到 LayerZero OApp 的 Anchor 程序接口，可以使用 Anchor 的 CPI 宏：

```rust
// 添加 LayerZero OApp 为依赖
// Cargo.toml:
// layerzero-oapp = { path = "../layerzero-oapp", features = ["cpi"] }

use layerzero_oapp::cpi::accounts::RelaySend;
use layerzero_oapp::cpi::relay_send;
use layerzero_oapp::program::LayerzeroOapp;

// 在代码中使用
let cpi_program = ctx.accounts.layerzero_oapp_program.to_account_info();
let cpi_accounts = RelaySend {
    peer: ctx.accounts.peer.to_account_info(),
    store: ctx.accounts.store.to_account_info(),
    endpoint: ctx.accounts.endpoint.to_account_info(),
    caller: ctx.accounts.vault_authority.to_account_info(),
};

let cpi_ctx = CpiContext::new_with_signer(
    cpi_program,
    cpi_accounts,
    &[seeds]
);

relay_send(cpi_ctx, params)?;
```

这种方式会自动使用正确的 discriminator，但需要 LayerZero OApp 的源代码或 crate。

## 联系方式

如果无法获取 LayerZero OApp 的 IDL：
1. 联系 LayerZero 团队获取 IDL
2. 查看 LayerZero 文档：https://docs.layerzero.network/
3. 在 Solana Explorer 上查看程序：https://explorer.solana.com/address/CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH

## 检查清单

在部署到生产环境前：
- [ ] 已从 LayerZero OApp IDL 获取正确的 discriminator
- [ ] 已更新代码中的 discriminator 值
- [ ] 已在 devnet 上成功测试 deposit_from_user 调用
- [ ] 已验证跨链消息成功发送到 EVM 链
- [ ] 已验证 EVM 链成功接收并解码消息

## 总结

⚠️ **当前的 discriminator 是理论值，必须在实际使用前验证！**

建议的工作流程：
1. 在 devnet 部署并测试
2. 如果失败，从 IDL 获取正确的 discriminator
3. 更新代码并重新测试
4. 验证成功后再部署到 mainnet

