# deposit_from_user 所需账户清单

## 📋 账户列表

### 1. 基本账户（在 `.accounts()` 中传递）

| 账户名 | 类型 | 说明 |
|--------|------|------|
| `config` | PDA | 程序配置账户 |
| `user` | Signer | 用户账户 |
| `userSourceToken` | Token Account | 用户的代币账户 |
| `vaultAuthority` | PDA | 金库权限 PDA |
| `vaultTokenAccount` | Token Account | 金库代币账户 |
| `mint` | Mint | 代币 mint |
| `tokenProgram` | Program | SPL Token 程序 |
| `layerzeroOappProgram` | Program | LayerZero OApp 程序 |
| `peer` | PDA | LayerZero Peer 配置 |
| `store` | PDA | LayerZero Store |
| `endpoint` | PDA | LayerZero Endpoint |
| `endpointProgram` | Program | LayerZero Endpoint 程序 |

### 2. 额外账户（在 `.remainingAccounts()` 中传递）

这些账户会被 `relay_send` 传递给 `endpoint::send`：

| 索引 | 账户名 | 类型 | PDA Seeds | 可写 | 说明 |
|------|--------|------|-----------|------|------|
| 0 | Send Library Program | Program | N/A | ❌ | 消息库程序<br>`2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ` (devnet) |
| 1 | Send Library Config | PDA | `[b"SendLibraryConfig", store.key(), dst_eid.to_be_bytes()]` | ❌ | OApp 的发送库配置 |
| 2 | Default Send Library Config | PDA | `[b"SendLibraryConfig", dst_eid.to_be_bytes()]` | ❌ | 默认发送库配置<br>`3pjEgRJGvng2roQF4F59gHD27QRjmdZb4SfBD4NorzoL` (devnet, dst_eid=40245) |
| 3 | Send Library Info | PDA | `[b"MessageLib", send_library_program.key()]` | ❌ | 消息库元信息 |
| 4 | Nonce | PDA | `[b"Nonce", store.key(), dst_eid.to_be_bytes(), peer_address]` | ✅ | 发送序号（会递增） |

**注意**：
- 所有 PDA 的 `seeds::program` 都是 **Endpoint Program** (`76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6`)
- `dst_eid` 必须使用**大端序**（`writeUInt32BE`）
- `peer_address` 需要从链上查询 `peer` 账户获取（前 8 字节是 discriminator，接下来 32 字节是 peer_address）

## 🚀 TypeScript 示例

```typescript
// 1. 计算基本 LayerZero PDAs
const LAYERZERO_OAPP_PROGRAM_ID = new PublicKey('CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH');
const ENDPOINT_PROGRAM_ID = new PublicKey('76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6');

const [storePda] = PublicKey.findProgramAddressSync(
  [Buffer.from('Store')],
  LAYERZERO_OAPP_PROGRAM_ID
);

const dstEidBuffer = Buffer.alloc(4);
dstEidBuffer.writeUInt32BE(dstEid, 0); // 大端序！

const [peerPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('Peer'), storePda.toBuffer(), dstEidBuffer],
  LAYERZERO_OAPP_PROGRAM_ID
);

const [endpointPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('Endpoint')],
  ENDPOINT_PROGRAM_ID
);

// 2. 计算 endpoint::send 需要的额外账户
const SEND_LIBRARY_PROGRAM = new PublicKey('2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ');

const [sendLibraryConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('SendLibraryConfig'), storePda.toBuffer(), dstEidBuffer],
  ENDPOINT_PROGRAM_ID
);

const [defaultSendLibraryConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('SendLibraryConfig'), dstEidBuffer],
  ENDPOINT_PROGRAM_ID
);

const [sendLibraryInfoPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('MessageLib'), SEND_LIBRARY_PROGRAM.toBuffer()],
  ENDPOINT_PROGRAM_ID
);

// 从链上读取 peer_address
const peerAccount = await connection.getAccountInfo(peerPda);
const peerAddressBytes = peerAccount.data.slice(8, 40);

const [noncePda] = PublicKey.findProgramAddressSync(
  [Buffer.from('Nonce'), storePda.toBuffer(), dstEidBuffer, peerAddressBytes],
  ENDPOINT_PROGRAM_ID
);

// 3. 调用指令
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
    layerzeroOappProgram: LAYERZERO_OAPP_PROGRAM_ID,
    peer: peerPda,
    store: storePda,
    endpoint: endpointPda,
    endpointProgram: ENDPOINT_PROGRAM_ID,
  })
  .remainingAccounts([
    { pubkey: SEND_LIBRARY_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: sendLibraryConfigPda, isSigner: false, isWritable: false },
    { pubkey: defaultSendLibraryConfigPda, isSigner: false, isWritable: false },
    { pubkey: sendLibraryInfoPda, isSigner: false, isWritable: false },
    { pubkey: noncePda, isSigner: false, isWritable: true },
  ])
  .signers([user])
  .rpc();
```

## ❓ 能不能省略某些账户？

**不能！** 所有账户都是必需的，原因：

1. **Anchor 会验证 PDA seeds** - 如果账户缺失，程序会 panic (`index out of bounds`)
2. **Endpoint 程序需要这些账户** - 用于：
   - 查询发送库配置
   - 读取/更新 nonce
   - 验证权限
   - 计算费用

## 🔍 调试提示

如果遇到 `index out of bounds` 错误：
- 检查 `remainingAccounts` 的**顺序**是否正确
- 检查 PDA seeds 是否**精确匹配**（大小写、字节序）
- 检查所有账户是否**已初始化**（尤其是 peer 和 nonce）

如果遇到 `AccountNotInitialized` 错误：
- 确认 LayerZero OApp 已在目标链上配置 peer
- 确认 nonce 账户是否存在（首次发送时需要初始化）
- 检查 `dst_eid` 是否正确

## 📚 相关文档

- `scripts/depositFromUserWithLayerZero.ts` - 完整示例脚本
- `DEPOSIT_WITH_LAYERZERO.md` - 功能说明文档
- `programs/transfer-contract/src/instructions/deposit_from_user.rs` - Rust 实现

