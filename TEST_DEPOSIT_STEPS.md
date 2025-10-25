# 测试 depositFromUser 完整步骤

## 前置条件

1. **确保有测试钱包和 SOL**
   ```bash
   # 查看钱包地址
   solana address
   
   # 在 devnet 上获取空投（如果余额不足）
   solana airdrop 2 --url devnet
   ```

2. **确保有测试代币（如 USDC）**
   - 需要一个 SPL token mint
   - 钱包中需要有该代币的余额

## 步骤 1：编译项目

```bash
anchor build
```

如果编译成功，继续下一步。

## 步骤 2：部署到 Devnet

```bash
# 切换到 devnet
solana config set --url devnet

# 部署程序
anchor deploy
```

部署后会显示 Program ID，记录下来。

## 步骤 3：初始化配置（如果还没初始化）

```bash
# 查看 address.md 文件中的地址信息
cat address.md

# 使用 initialize 脚本初始化
ts-node scripts/initialize.ts \
  --program <YOUR_PROGRAM_ID> \
  --allowed-caller <ALLOWED_CALLER_ADDRESS> \
  --mint1 <MINT_ADDRESS_1> \
  --rpc https://api.devnet.solana.com
```

## 步骤 4：测试 depositFromUser

### 方式 1：使用脚本（最简单）

```bash
ts-node scripts/depositFromUserWithLayerZero.ts \
  --program <YOUR_PROGRAM_ID> \
  --mint <MINT_PUBKEY> \
  --amount 1000000 \
  --dst-eid 30101 \
  --dst-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --merchant 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 \
  --native-fee 100000000 \
  --rpc https://api.devnet.solana.com
```

**参数说明**：
- `--program`: 你的程序 ID
- `--mint`: 代币 mint 地址（必须在 allowed_mints 中）
- `--amount`: 存款金额（代币最小单位，如 1 USDC = 1000000）
- `--dst-eid`: 目标链 ID（30101 = Ethereum）
- `--dst-token`: 目标链代币地址（EVM 格式）
- `--merchant`: 商户地址（EVM 格式）
- `--native-fee`: LayerZero 手续费（lamports，可选，不传则使用默认值 0.001 SOL）

### 方式 2：最简调用（使用默认 LayerZero 参数）

前端只需传 4 个必填参数，其他传 null：

```bash
ts-node scripts/depositFromUserWithLayerZero.ts \
  --program <YOUR_PROGRAM_ID> \
  --mint <MINT_PUBKEY> \
  --amount 1000000 \
  --dst-eid 30101 \
  --dst-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --merchant 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 \
  --rpc https://api.devnet.solana.com
```

**注意**：如果不传 `--native-fee`，程序会使用默认值 0.001 SOL (1,000,000 lamports)

## 示例命令（使用实际地址）

假设：
- Program ID: `GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1`
- USDC Devnet Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- 存款 1 USDC (1000000)

```bash
ts-node scripts/depositFromUserWithLayerZero.ts \
  --program GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1 \
  --mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU \
  --amount 1000000 \
  --dst-eid 30101 \
  --dst-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --merchant 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 \
  --rpc https://api.devnet.solana.com
```

## 预期结果

成功执行后会看到：
```
调用 deposit_from_user with LayerZero...
参数:
  amount: 1000000
  dst_eid: 30101
  dst_token: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  merchant: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
  native_fee: 1000000
✅ deposit_from_user 成功!
交易签名: <TRANSACTION_SIGNATURE>
```

可以在 Solana Explorer 查看交易：
```
https://explorer.solana.com/tx/<TRANSACTION_SIGNATURE>?cluster=devnet
```

## 故障排查

### 错误 1：账户未初始化
```
Error: Account does not exist
```
**解决**：运行 initialize 脚本初始化配置

### 错误 2：Mint 不在允许列表
```
Error: Mint not in allowed list
```
**解决**：确保 mint 地址在初始化时添加到 allowed_mints

### 错误 3：余额不足
```
Error: Insufficient funds
```
**解决**：
- 检查 SOL 余额（需要支付交易费和 LayerZero 手续费）
- 检查代币余额

### 错误 4：LayerZero CPI 失败
```
Error: Invalid instruction data / Unknown instruction
```
**可能原因**：
- discriminator 不正确（参考 `IMPORTANT_DISCRIMINATOR_NOTE.md`）
- remaining_accounts 账户列表不正确
- LayerZero OApp 程序 ID 错误

**调试步骤**：
1. 验证 LayerZero OApp 程序 ID：`CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH`
2. 从 IDL 获取正确的 discriminator
3. 检查 remaining_accounts 是否包含所有必需账户

### 错误 5：EVM 地址格式错误
```
Error: Invalid EVM address
```
**解决**：确保 EVM 地址格式正确（0x + 40 个十六进制字符）

## 监控和验证

### 1. 查看交易日志
```bash
solana confirm -v <TRANSACTION_SIGNATURE> --url devnet
```

### 2. 查看程序日志
在交易详情中查看 Program Log，确认：
- ✅ 代币转账成功
- ✅ DepositEvent 事件发出
- ✅ LayerZero CPI 调用成功

### 3. 查看账户余额变化
```bash
# 查看用户代币余额
spl-token balance <MINT_ADDRESS> --owner <USER_ADDRESS> --url devnet

# 查看金库余额
spl-token balance <MINT_ADDRESS> --owner <VAULT_AUTHORITY_PDA> --url devnet
```

## 目标链 EID 参考

常用的 LayerZero Endpoint ID：
- Ethereum: `30101`
- BSC: `30102`
- Avalanche: `30106`
- Polygon: `30109`
- Arbitrum: `30110`
- Optimism: `30111`
- Base: `30184`

完整列表：https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts

## 下一步

测试成功后：
1. ✅ 验证 discriminator 是否正确
2. ✅ 在 EVM 链验证是否收到跨链消息
3. ✅ 测试不同的金额和目标链
4. ✅ 测试错误情况（余额不足、mint 不允许等）
5. ✅ 准备部署到 mainnet

## 快速测试脚本

创建一个快速测试脚本 `test-deposit.sh`：

```bash
#!/bin/bash

PROGRAM_ID="你的程序ID"
MINT="你的Mint地址"
AMOUNT=1000000
DST_EID=30101
DST_TOKEN="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
MERCHANT="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"

echo "🚀 测试 depositFromUser..."
ts-node scripts/depositFromUserWithLayerZero.ts \
  --program $PROGRAM_ID \
  --mint $MINT \
  --amount $AMOUNT \
  --dst-eid $DST_EID \
  --dst-token $DST_TOKEN \
  --merchant $MERCHANT \
  --rpc https://api.devnet.solana.com

if [ $? -eq 0 ]; then
  echo "✅ 测试成功!"
else
  echo "❌ 测试失败!"
fi
```

运行：
```bash
chmod +x test-deposit.sh
./test-deposit.sh
```


