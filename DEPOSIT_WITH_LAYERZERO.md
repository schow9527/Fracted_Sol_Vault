# Deposit From User with LayerZero 跨链功能

## 概述

`deposit_from_user` 指令已经重新实现，现在支持在接收用户存款后自动通过 LayerZero 发送跨链消息到 EVM 链。

## 功能流程

1. **用户存款**：用户将代币从其 ATA 转账到金库的 ATA
2. **编码消息**：将跨链参数按照 EVM ABI 格式编码
3. **调用 LayerZero**：通过 CPI 调用 LayerZero OApp 的 `relay_send` 发送跨链消息
4. **发出事件**：记录存款和跨链信息

## 参数说明

### DepositParams 结构

```rust
pub struct DepositParams {
    /// 转账金额（代币的最小单位）（必填）
    pub amount: u64,
    
    /// 目标链 ID (LayerZero EID)（必填）
    /// 例如：30101 = Ethereum, 30110 = Arbitrum
    pub dst_eid: u32,
    
    /// 目标链的代币地址（EVM 地址，32 字节格式）（必填）
    /// 例如：USDC 在 Ethereum = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
    /// 需要左边补 12 个 0，变成 32 字节
    pub dst_token: [u8; 32],
    
    /// 商户地址（EVM 地址，32 字节格式）（必填）
    /// 需要左边补 12 个 0，变成 32 字节
    pub merchant: [u8; 32],
    
    /// LayerZero 消息选项（可选，前端可以传 null）
    pub options: Option<Vec<u8>>,
    
    /// LayerZero 原生代币手续费（可选，前端可以传 null，默认为 0）
    pub native_fee: Option<u64>,
    
    /// LayerZero 代币手续费（可选，前端可以传 null，默认为 0）
    pub lz_token_fee: Option<u64>,
}
```

**参数说明**：
- ✅ **必填参数**：`amount`, `dst_eid`, `dst_token`, `merchant`
- ⭕ **可选参数**：`options`, `native_fee`, `lz_token_fee` - 前端可以传 `null`，程序会使用默认值

## 消息编码格式

消息按照 Solidity 的 `abi.encode(uint8, address, address, uint256)` 格式编码：

```
总长度：128 字节

字节 0-31:   TAG_TOKEN_PAYOUT (101) - padding 到 32 字节
字节 32-63:  dst_token - EVM 代币地址，左边补 12 个 0
字节 64-95:  merchant - 商户地址，左边补 12 个 0
字节 96-127: amount - 金额，u64 转换为 uint256 格式
```

### 示例

假设：
- TAG_TOKEN_PAYOUT = 101 (0x65)
- dst_token = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
- merchant = 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
- amount = 1000000 (0xF4240)

编码后的消息（hex）：
```
0000000000000000000000000000000000000000000000000000000000000065  // tag
000000000000000000000000A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48  // dst_token
000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f0bEb0  // merchant
00000000000000000000000000000000000000000000000000000000000F4240  // amount
```

## EVM 地址转换

前端需要将 EVM 地址（20 字节）转换为 32 字节格式：

### JavaScript/TypeScript 示例

```typescript
function evmAddressToBytes32(evmAddress: string): number[] {
  // 移除 0x 前缀
  const hex = evmAddress.startsWith('0x') ? evmAddress.slice(2) : evmAddress;
  
  if (hex.length !== 40) {
    throw new Error(`Invalid EVM address length: ${evmAddress}`);
  }
  
  // 转换为字节数组
  const addressBytes = Buffer.from(hex, 'hex');
  
  // 创建 32 字节数组，左边填充 12 个 0
  const result = new Array(32).fill(0);
  addressBytes.forEach((byte, idx) => {
    result[12 + idx] = byte;
  });
  
  return result;
}
```

## 调用示例

### 命令行

```bash
ts-node scripts/depositFromUserWithLayerZero.ts \
  --program GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1 \
  --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 1000000 \
  --dst-eid 30101 \
  --dst-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --merchant 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 \
  --native-fee 100000000
```

### 前端代码

```typescript
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

// 转换 EVM 地址
const dstToken = evmAddressToBytes32('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const merchant = evmAddressToBytes32('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0');

// 准备参数（可选参数可以传 null）
const params = {
  amount: new BN(1000000),      // 必填
  dstEid: 30101,                // 必填：Ethereum
  dstToken,                     // 必填
  merchant,                     // 必填
  options: null,                // 可选：传 null 使用默认空 Vec
  nativeFee: null,              // 可选：传 null 使用默认值 0
  lzTokenFee: null,             // 可选：传 null 使用默认值 0
};

// 或者，如果需要指定 LayerZero 参数：
const paramsWithFee = {
  amount: new BN(1000000),
  dstEid: 30101,
  dstToken,
  merchant,
  options: null,                     // 可选
  nativeFee: new BN(100000000),      // 指定 0.1 SOL 手续费
  lzTokenFee: null,                  // 可选
};

// 调用合约
const tx = await program.methods
  .depositFromUser(params)
  .accounts({
    config: configPda,
    user: userPublicKey,
    userSourceToken: userAta,
    vaultAuthority: vaultAuthorityPda,
    vaultTokenAccount: vaultAta,
    mint: mintPublicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .remainingAccounts([
    // LayerZero 相关账户
    { pubkey: peerPda, isSigner: false, isWritable: false },
    { pubkey: storePda, isSigner: false, isWritable: false },
    { pubkey: endpointPda, isSigner: false, isWritable: false },
    // ... 其他必需的账户
  ])
  .rpc();
```

## LayerZero EID 参考

常见的 LayerZero Endpoint ID (EID)：

- Ethereum: 30101
- BSC: 30102
- Avalanche: 30106
- Polygon: 30109
- Arbitrum: 30110
- Optimism: 30111
- Base: 30184

完整列表：https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts

## 账户要求

### 必需账户
- `config`: Config PDA
- `user`: 用户签名者
- `user_source_token`: 用户的代币账户
- `vault_authority`: 金库权限 PDA
- `vault_token_account`: 金库代币账户
- `mint`: 代币 mint
- `token_program`: SPL Token 程序

### Remaining Accounts (LayerZero)
- `peer`: LayerZero peer 配置 PDA
- `store`: LayerZero store PDA
- `endpoint`: LayerZero endpoint PDA
- 其他根据 LayerZero OApp 实现需要的账户

## 注意事项

1. **EVM 地址格式**：必须将 20 字节的 EVM 地址转换为 32 字节格式（左边补 12 个 0）

2. **手续费**：`native_fee` 需要足够支付 LayerZero 跨链消息费用，可以通过 LayerZero SDK 预估

3. **Remaining Accounts**：必须正确传递 LayerZero 所需的所有账户，否则 CPI 调用会失败

4. **金额精度**：`amount` 使用代币的最小单位（如 USDC 使用 6 位小数，1 USDC = 1000000）

5. **消息编码**：确保消息编码格式与 EVM 端的解码逻辑完全匹配

## 事件

成功存款后会发出 `DepositEvent`：

```rust
pub struct DepositEvent {
    pub user: Pubkey,          // 存款用户
    pub mint: Pubkey,          // 代币 mint
    pub amount: u64,           // 存款金额
    pub dst_eid: u32,          // 目标链 ID
    pub dst_token: [u8; 32],   // 目标代币地址
    pub merchant: [u8; 32],    // 商户地址
}
```

可以监听此事件来跟踪存款和跨链状态。

## 故障排除

### CPI 调用失败
- 检查 remaining_accounts 是否包含所有必需的 LayerZero 账户
- 确认 vault_authority PDA 有权限调用 LayerZero OApp

### 消息格式错误
- 确认 EVM 地址转换正确（32 字节，左边补 0）
- 验证消息编码格式与 EVM 端解码逻辑匹配

### 手续费不足
- 增加 `native_fee` 参数
- 使用 LayerZero SDK 预估实际需要的手续费

