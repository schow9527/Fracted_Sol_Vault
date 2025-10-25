/*
用户存款并通过 LayerZero 发送跨链消息

Usage:
  ts-node scripts/depositFromUserWithLayerZero.ts \
    --program <PROGRAM_ID> \
    --mint <MINT_PUBKEY> \
    --amount <u64> \
    --dst-eid <DST_EID> \
    --dst-token <EVM_TOKEN_ADDRESS> \
    --merchant <EVM_MERCHANT_ADDRESS> \
    --native-fee <LAMPORTS> \
    [--lz-token-fee <u64>] \
    [--user <USER_KEYPAIR>] \
    [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>]

Example:
  ts-node scripts/depositFromUserWithLayerZero.ts \
    --program GSPmsxkxd5qR5HG4fhUd5cBrVkWNJWi6pWUFQnYmTEc1 \
    --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
    --amount 1000000 \
    --dst-eid 30101 \
    --dst-token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
    --merchant 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0 \
    --native-fee 100000000
*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

type Args = {
  program: string;
  mint: string;
  amount: string;
  dstEid: string;
  dstToken: string;  // EVM 地址，如 0x...
  merchant: string;  // EVM 地址，如 0x...
  nativeFee: string;
  lzTokenFee?: string;
  user?: string;
  rpc?: string;
  payer?: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: any = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--program') args.program = v;
    if (a === '--mint') args.mint = v;
    if (a === '--amount') args.amount = v;
    if (a === '--dst-eid') args.dstEid = v;
    if (a === '--dst-token') args.dstToken = v;
    if (a === '--merchant') args.merchant = v;
    if (a === '--native-fee') args.nativeFee = v;
    if (a === '--lz-token-fee') args.lzTokenFee = v;
    if (a === '--user') args.user = v;
    if (a === '--rpc') args.rpc = v;
    if (a === '--payer') args.payer = v;
  }
  if (!args.program) throw new Error('Missing --program');
  if (!args.mint) throw new Error('Missing --mint');
  if (!args.amount) throw new Error('Missing --amount');
  if (!args.dstEid) throw new Error('Missing --dst-eid');
  if (!args.dstToken) throw new Error('Missing --dst-token');
  if (!args.merchant) throw new Error('Missing --merchant');
  // native-fee 是可选的，不传则使用默认值
  return args as Args;
}

function loadKeypair(p: string): Keypair {
  const filePath = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
  const bs = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bs));
}

/**
 * 将 EVM 地址（20 字节）转换为 32 字节数组（左边补 12 个 0）
 * @param evmAddress 以 0x 开头的 EVM 地址
 */
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

async function main() {
  const args = parseArgs();
  const rpc = args.rpc || process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
  const payerPath = args.payer || process.env.ANCHOR_WALLET || path.join(os.homedir(), 'my_solana_wallet.json');

  const connection = new Connection(rpc, 'confirmed');
  const payer = loadKeypair(payerPath);
  const user = args.user ? loadKeypair(args.user) : payer;
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const cliProgramId = new PublicKey(args.program);
  const idlPath = path.resolve(__dirname, '../target/idl/transfer_contract.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as anchor.Idl;
  const idlProgramId = new PublicKey((idl as any).address);
  if (!idlProgramId.equals(cliProgramId)) {
    throw new Error(`Program ID 与 IDL 不匹配：IDL=${idlProgramId.toBase58()} CLI=${cliProgramId.toBase58()}`);
  }
  const program = new anchor.Program(idl as anchor.Idl, provider as anchor.Provider);

  const mint = new PublicKey(args.mint);
  const amount = BigInt(args.amount);
  const dstEid = parseInt(args.dstEid);
  // 如果不传 native-fee，程序会使用默认值 0.001 SOL (1,000,000 lamports)
  const nativeFee = args.nativeFee ? BigInt(args.nativeFee) : BigInt(0);
  const lzTokenFee = args.lzTokenFee ? BigInt(args.lzTokenFee) : BigInt(0);

  // 转换 EVM 地址为 32 字节数组
  const dstToken = evmAddressToBytes32(args.dstToken);
  const merchant = evmAddressToBytes32(args.merchant);

  const CONFIG_SEED = Buffer.from('config');
  const VAULT_SEED = Buffer.from('vault');
  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], idlProgramId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([VAULT_SEED, configPda.toBuffer()], idlProgramId);

  const mintInfo = await connection.getAccountInfo(mint);
  if (!mintInfo) throw new Error(`Mint not found: ${mint.toBase58()}`);
  const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const userAta = getAssociatedTokenAddressSync(mint, user.publicKey, false, tokenProgram);
  const vaultAta = getAssociatedTokenAddressSync(mint, vaultAuthority, true, tokenProgram);

  // LayerZero OApp 相关账户
  const LAYERZERO_OAPP_PROGRAM_ID = new PublicKey('CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH');
  const ENDPOINT_PROGRAM_ID = new PublicKey('76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6'); // LayerZero Endpoint
  
  // 注意：seeds 必须与 OApp 合约完全一致（大小写）
  const PEER_SEED = Buffer.from('Peer');     // 大写 P
  const STORE_SEED = Buffer.from('Store');   // 大写 S

  const [storePda] = PublicKey.findProgramAddressSync([STORE_SEED], LAYERZERO_OAPP_PROGRAM_ID);
  
  // dst_eid 需要大端序（与 Rust 的 to_be_bytes() 一致）
  const dstEidBuffer = Buffer.alloc(4);
  dstEidBuffer.writeUInt32BE(dstEid, 0);
  
  const [peerPda] = PublicKey.findProgramAddressSync(
    [PEER_SEED, storePda.toBuffer(), dstEidBuffer],
    LAYERZERO_OAPP_PROGRAM_ID
  );

  // ========== endpoint::send 需要的额外账户（作为 remaining_accounts） ==========
  
  // 1. Send Library Program (devnet 默认的消息库程序)
  const SEND_LIBRARY_PROGRAM = new PublicKey('2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ');
  
  // 2. Send Library Config (针对 store + dst_eid 的配置)
  const SEND_LIBRARY_CONFIG_SEED = Buffer.from('SendLibraryConfig');
  const [sendLibraryConfigPda] = PublicKey.findProgramAddressSync(
    [SEND_LIBRARY_CONFIG_SEED, storePda.toBuffer(), dstEidBuffer],
    ENDPOINT_PROGRAM_ID
  );
  
  // 3. Default Send Library Config (针对 dst_eid 的默认配置)
  const [defaultSendLibraryConfigPda] = PublicKey.findProgramAddressSync(
    [SEND_LIBRARY_CONFIG_SEED, dstEidBuffer],
    ENDPOINT_PROGRAM_ID
  );
  
  // 4. Send Library Info (消息库的元信息)
  const MESSAGE_LIB_SEED = Buffer.from('MessageLib');
  const [sendLibraryInfoPda] = PublicKey.findProgramAddressSync(
    [MESSAGE_LIB_SEED, SEND_LIBRARY_PROGRAM.toBuffer()],
    ENDPOINT_PROGRAM_ID
  );
  
  // 5. Nonce (发送序号账户)
  // receiver 是 peer.peer_address，但我们暂时用 32 字节的零（需要从链上读取 peer 配置）
  // 为了简化，我们先尝试推导，或者从链上读取 peer 配置
  const NONCE_SEED = Buffer.from('Nonce');
  // receiver 应该从 peer 配置中读取，这里暂时用占位符
  // 实际应该先查询 peer 账户获取 peer_address
  const peerAccount = await connection.getAccountInfo(peerPda);
  if (!peerAccount) {
    throw new Error(`Peer account not initialized: ${peerPda.toBase58()}`);
  }
  
  // Peer 账户结构（简化版，只取 peer_address）：
  // - 8 bytes: discriminator
  // - 32 bytes: peer_address
  const peerAddressBytes = peerAccount.data.slice(8, 40);
  
  const [noncePda] = PublicKey.findProgramAddressSync(
    [NONCE_SEED, storePda.toBuffer(), dstEidBuffer, peerAddressBytes],
    ENDPOINT_PROGRAM_ID
  );

  // 准备参数
  // options, nativeFee, lzTokenFee 都是可选的，前端可以不传（传 null）
  const params = {
    amount: new anchor.BN(amount.toString()),
    dstEid,
    dstToken,
    merchant,
    options: null, // 可选，默认为空
    nativeFee: nativeFee > 0 ? new anchor.BN(nativeFee.toString()) : null,  // 可选，默认为 0
    lzTokenFee: lzTokenFee > 0 ? new anchor.BN(lzTokenFee.toString()) : null, // 可选，默认为 0
  };

  console.log('调用 deposit_from_user with LayerZero...');
  console.log('参数:');
  console.log('  amount:', amount.toString());
  console.log('  dst_eid:', dstEid);
  console.log('  dst_token:', args.dstToken);
  console.log('  merchant:', args.merchant);
  console.log('  native_fee:', nativeFee.toString());
  console.log('\nLayerZero 账户:');
  console.log('  OApp Program:', LAYERZERO_OAPP_PROGRAM_ID.toBase58());
  console.log('  Peer PDA:', peerPda.toBase58());
  console.log('  Store PDA:', storePda.toBase58());
  console.log('\nEndpoint::Send 额外账户 (remaining_accounts):');
  console.log('  [0] Send Library Program:', SEND_LIBRARY_PROGRAM.toBase58());
  console.log('  [1] Send Library Config:', sendLibraryConfigPda.toBase58());
  console.log('  [2] Default Send Library Config:', defaultSendLibraryConfigPda.toBase58());
  console.log('  [3] Send Library Info:', sendLibraryInfoPda.toBase58());
  console.log('  [4] Nonce:', noncePda.toBase58());

  try {
    const sig = await program.methods
      .depositFromUser(params)
      .accounts({
        config: configPda,
        user: user.publicKey,
        userSourceToken: userAta,
        vaultAuthority,
        vaultTokenAccount: vaultAta,
        mint,
        tokenProgram,
        // LayerZero 相关账户（只需 3 个：oapp_program, peer, store）
        layerzeroOappProgram: LAYERZERO_OAPP_PROGRAM_ID,
        peer: peerPda,
        store: storePda,
      })
      .remainingAccounts([
        // endpoint::send 需要的额外账户（会被转发给 OApp，再转发给 Endpoint）
        { pubkey: SEND_LIBRARY_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: sendLibraryConfigPda, isSigner: false, isWritable: false },
        { pubkey: defaultSendLibraryConfigPda, isSigner: false, isWritable: false },
        { pubkey: sendLibraryInfoPda, isSigner: false, isWritable: false },
        { pubkey: noncePda, isSigner: false, isWritable: true }, // nonce 需要可写（会递增）
      ])
      .signers([user])
      .rpc();

    console.log('✅ deposit_from_user 成功!');
    console.log('交易签名:', sig);
  } catch (error) {
    console.error('❌ 调用失败:', error);
    throw error;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

