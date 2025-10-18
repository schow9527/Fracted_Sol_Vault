/*
LP deposit: user deposits and increases LiquidityPosition for a mint.

Usage:
  ts-node scripts/lpDeposit.ts \
    --program <PROGRAM_ID> \
    --mint <MINT_PUBKEY> \
    --amount <u64> \
    [--user <USER_PUBKEY>] \
    [--rpc <RPC_URL>] [--payer <KEYPAIR_PATH>] [--create-atas]
*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

function loadKeypair(p: string): Keypair {
  const filePath = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
  const bs = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bs));
}

async function main() {
  const argv = process.argv.slice(2);
  const args: any = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--program') args.program = v;
    if (a === '--mint') args.mint = v;
    if (a === '--amount') args.amount = v;
    if (a === '--user') args.user = v;
    if (a === '--rpc') args.rpc = v;
    if (a === '--payer') args.payer = v;
    if (a === '--create-atas') args.createAtas = true;
  }
  if (!args.program || !args.mint || !args.amount) throw new Error('Missing required flags');

  const rpc = args.rpc || process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
  const payerPath = args.payer || process.env.ANCHOR_WALLET || path.join(os.homedir(), 'my_solana_wallet.json');
  const connection = new Connection(rpc, 'confirmed');
  const payer = loadKeypair(payerPath);
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const cliProgramId = new PublicKey(args.program);
  const idlPath = path.resolve(__dirname, '../target/idl/transfer_contract.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as anchor.Idl;
  const idlProgramId = new PublicKey((idl as any).address);
  if (!idlProgramId.equals(cliProgramId)) {
    throw new Error(`Program ID 与 IDL 不匹配：IDL=${idlProgramId.toBase58()} CLI=${cliProgramId.toBase58()}。请运行 anchor build 重新生成 IDL，或用 --program 指定与 IDL.address 相同的 Program ID。`);
  }
  const program = new anchor.Program(idl as anchor.Idl, provider as anchor.Provider);

  const mint = new PublicKey(args.mint);
  const amount = BigInt(args.amount);
  const userPubkey = args.user ? new PublicKey(args.user) : wallet.publicKey;

  const CONFIG_SEED = Buffer.from('config');
  const VAULT_SEED = Buffer.from('vault');
  const LP_SEED = Buffer.from('lp');
  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], idlProgramId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([VAULT_SEED, configPda.toBuffer()], idlProgramId);
  const [lpPda] = PublicKey.findProgramAddressSync([LP_SEED, userPubkey.toBuffer(), mint.toBuffer()], idlProgramId);

  const mintInfo = await connection.getAccountInfo(mint);
  if (!mintInfo) throw new Error(`Mint not found: ${mint.toBase58()}`);
  const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const userAta = getAssociatedTokenAddressSync(mint, userPubkey, false, tokenProgram);
  const vaultAta = getAssociatedTokenAddressSync(mint, vaultAuthority, true, tokenProgram);

  const ixes: any[] = [];
  if (args.createAtas) {
    const userAtaInfo = await connection.getAccountInfo(userAta);
    if (!userAtaInfo) ixes.push(createAssociatedTokenAccountInstruction(wallet.publicKey, userAta, userPubkey, mint, tokenProgram));
    const vaultAtaInfo = await connection.getAccountInfo(vaultAta);
    if (!vaultAtaInfo) ixes.push(createAssociatedTokenAccountInstruction(wallet.publicKey, vaultAta, vaultAuthority, mint, tokenProgram));
  }
  if (ixes.length) {
    const tx = new Transaction().add(...ixes);
    await provider.sendAndConfirm(tx, []);
  }

  const sig = await program.methods
    .lpDeposit(new anchor.BN(amount.toString()))
    .accounts({
      config: configPda,
      user: userPubkey,
      liquidityPosition: lpPda,
      userSourceToken: userAta,
      vaultAuthority,
      vaultTokenAccount: vaultAta,
      mint,
      tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log('lp_deposit tx:', sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



