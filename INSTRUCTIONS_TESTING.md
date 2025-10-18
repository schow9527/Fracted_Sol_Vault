## transfer_contract 测试手册（中文）

本手册按顺序指导你在 localnet 或 devnet 上完成部署与测试，并给出每个指令的参数含义与示例命令。

基础信息
- Program ID：`GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1`（来自 `declare_id!`）
- PDA：
  - `config` = PDA(["config"])；`vault_authority` = PDA(["vault", config])
- ATA：
  - 金库 ATA：owner=`vault_authority`，mint=所选稳定币
  - 用户 ATA：owner=`user`，mint=所选稳定币

0. 部署（任选网络）
- 本地：
  - `solana config set --url http://127.0.0.1:8899`
  - `solana-test-validator -r`（另开终端常驻）
  - `anchor build && anchor deploy --provider.cluster localnet`
- devnet：
  - `solana config set --url https://api.devnet.solana.com`
  - `solana airdrop 2`（多试几次，余额>2 SOL）
  - `anchor build && anchor deploy --provider.cluster devnet`

说明：要保持 Program ID 不变，请始终使用 `target/deploy/transfer_contract-keypair.json`。

1) 初始化 initialize（必要）
用途：创建 `Config`，设置管理员（当前付款人）、允许的调用方、白名单币种（1–3 个），并可选创建金库 ATA。

命令（示例：仅 USDC，附带创建 ATA）
```bash
npx ts-node scripts/initVault.ts \
  --program <PROGRAM_ID> \
  --allowed-caller <ALLOWED_CALLER_PUBKEY> \
  --usdc <USDC_MINT> [--usdt <USDT_MINT>] [--xusd <XUSD_MINT>] \
  [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>] \
  --send-atas
```
参数含义：
- `--program`：你部署出的 Program ID
- `--allowed-caller`：被允许调用 `transfer_out` 的公钥（没有“调用方合约”时可先用你的钱包公钥）
- `--usdc/--usdt/--xusd` 或 `--mints`：1–3 个稳定币 mint；脚本会按 mint.owner 选择 SPL 或 Token-2022 程序
- `--rpc`/`--payer`：网络与付款人（默认用当前 Anchor/solana 配置）



2) 用户仅存金 deposit_from_user（不记录 LP）
说明：用户先要有该 mint 的余额。本地可自建测试 mint 并 mint 给用户；devnet 可用已存在测试 mint 或你自有 mint。

```bash
npx ts-node scripts/depositFromUser.ts \
  --program <PROGRAM_ID> \
  --mint <MINT> \
  --amount <MIN_UNITS> \
  [--user <USER_PUBKEY>] \
  [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>] [--create-atas]
```
- `--amount`：最小单位（如 USDC 6 位，1 USDC=1_000_000）
- `--create-atas`：缺失时为用户与金库自动创建 ATA

3) 用户 LP 存入 lp_deposit（会记录 LP 头寸）
```bash
npx ts-node scripts/lpDeposit.ts \
  --program <PROGRAM_ID> \
  --mint <MINT> \
  --amount <MIN_UNITS> \
  [--user <USER_PUBKEY>] \
  [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>] [--create-atas]
```
效果：在 PDA(["lp", user, mint]) 上累计 `amount`，并把代币打入金库。

4) 用户 LP 赎回 lp_withdraw
```bash
npx ts-node scripts/lpWithdraw.ts \
  --program <PROGRAM_ID> \
  --mint <MINT> \
  --amount <MIN_UNITS> \
  [--user <USER_PUBKEY>] \
  [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>] [--create-atas]
```
要求：LP 头寸余额 ≥ 赎回金额；代币从金库转回用户 ATA。

5) 金库对外打款 transfer_out（仅 admin/allowed_caller）
```bash
npx ts-node scripts/transferOut.ts \
  --program <PROGRAM_ID> \
  --mint <MINT> \
  --recipient <RECIPIENT_PUBKEY> \
  --amount <MIN_UNITS> \
  [--authority <KEYPAIR_PATH>] \
  [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>] [--create-atas]
```
- `--authority`：管理员或 `allowed_caller_authority` 的私钥（不传则默认用 `--payer`）。只有这两类能成功。
- `--create-atas`：收款人 ATA 不存在时自动创建。

附：快速检查
- PDA 推导：`config`（["config"]）、`vault_authority`（["vault", config]）、LP 账户（["lp", user, mint]）
- 账户 mint 对齐：所有被传入的 TokenAccount 的 `mint` 必须等于传入的 `mint`
- 余额：用户→存入、金库→打款、LP→赎回均需余额充足



