/*
Initialize the vault Config on-chain.

This calls the program's `initialize(allowed_caller_authority, [USDC,USDT,XUSD])`.

Usage examples:

  ts-node scripts/initVault.ts \
    --program 8cBawDhsqUUrFBgpMwD2BJyU67hvVibXxaoe9MtTTuTT \
    --allowed-caller <ALLOWED_CALLER_AUTHORITY_PUBKEY> \
    --usdc <USDC_MINT> --usdt <USDT_MINT> --xusd <XUSD_MINT>

Or with a comma list (exactly 3):

  ts-node scripts/initVault.ts \
    --program <PROGRAM_ID> \
    --allowed-caller <ALLOWED_CALLER_AUTHORITY_PUBKEY> \
    --mints <USDC_MINT>,<USDT_MINT>,<XUSD_MINT>

Optional:
  --rpc <RPC_URL>   --payer <PATH_TO_KEYPAIR_JSON>
*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
// Load IDL via fs to avoid TS resolveJsonModule requirement
const idlPath = path.resolve(__dirname, '../target/idl/transfer_contract.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as anchor.Idl;
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

type Args = {
  program: string;
  allowedCaller: string;
  mints?: string[];
  usdc?: string;
  usdt?: string;
  xusd?: string;
  rpc?: string;
  payer?: string;
  sendAtas?: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: any = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--program') args.program = v;
    if (a === '--allowed-caller') args.allowedCaller = v;
    if (a === '--mints') args.mints = v.split(',').map((s: string) => s.trim());
    if (a === '--usdc') args.usdc = v;
    if (a === '--usdt') args.usdt = v;
    if (a === '--xusd') args.xusd = v;
    if (a === '--rpc') args.rpc = v;
    if (a === '--payer') args.payer = v;
    // robust boolean flag parsing (supports --send-atas and --send-atas=true)
    if (a === '--send-atas' || a.startsWith('--send-atas=')) {
      args.sendAtas = true;
    }
  }
  if (!args.sendAtas) {
    args.sendAtas = argv.includes('--send-atas') || argv.some((s) => s.startsWith('--send-atas='));
  }
  if (!args.program) throw new Error('Missing --program');
  if (!args.allowedCaller) throw new Error('Missing --allowed-caller');
  const list: string[] = [];
  if (args.usdc) list.push(args.usdc);
  if (args.usdt) list.push(args.usdt);
  if (args.xusd) list.push(args.xusd);
  if (args.mints && args.mints.length > 0) list.push(...args.mints);
  const unique = Array.from(new Set(list));
  if (unique.length < 1 || unique.length > 3) {
    throw new Error('Provide 1-3 mints via --usdc/--usdt/--xusd or --mints <M1>[,<M2>[,<M3>]]');
  }
  return {
    program: args.program,
    allowedCaller: args.allowedCaller,
    mints: unique,
    rpc: args.rpc,
    payer: args.payer,
  } as Args;
}

function loadKeypair(p: string): Keypair {
  const filePath = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
  const bs = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bs));
}

async function main() {
  const args = parseArgs();
  const rpc = args.rpc || process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com';
  const payerPath = args.payer || process.env.ANCHOR_WALLET || path.join(os.homedir(), 'my_solana_wallet.json');

  const connection = new Connection(rpc, 'confirmed');
  const payer = loadKeypair(payerPath);
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const cliProgramId = new PublicKey(args.program);
  const idlProgramId = new PublicKey((idl as any).address);
  if (!idlProgramId.equals(cliProgramId)) {
    throw new Error(`Program ID 与 IDL 不匹配：IDL=${idlProgramId.toBase58()} CLI=${cliProgramId.toBase58()}。请运行 anchor build 重新生成 IDL，或用 --program 指定与 IDL.address 相同的 Program ID。`);
  }
  const program = new anchor.Program(idl as anchor.Idl, provider as anchor.Provider);

  const allowedCaller = new PublicKey(args.allowedCaller);
  const mints = (args.mints as string[]).map((m) => new PublicKey(m));

  const CONFIG_SEED = Buffer.from('config');
  const VAULT_SEED = Buffer.from('vault');

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], idlProgramId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([VAULT_SEED, configPda.toBuffer()], idlProgramId);

  console.log('Program ID:      ', program.programId.toBase58());
  console.log('Admin (payer):   ', wallet.publicKey.toBase58());
  console.log('Allowed caller:  ', allowedCaller.toBase58());
  console.log('Config PDA:      ', configPda.toBase58());
  console.log('Vault authority: ', vaultAuthority.toBase58());
  console.log('Mints:           ', mints.map((x) => x.toBase58()));

  // If config already exists, skip initialize to avoid "account already in use"
  const configInfo = await connection.getAccountInfo(configPda);
  if (!configInfo) {
    const txSig = await program.methods
      .initialize(allowedCaller, mints)
      .accounts({
        config: configPda,
        vaultAuthority: vaultAuthority,
        admin: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log('Initialize tx:', txSig);
  } else {
    console.log('Config already exists. Skipping initialize.');
  }

  // Optionally create ATAs for the provided mints
  const ixes: any[] = [];
  for (const mint of mints) {
    const mintInfo = await connection.getAccountInfo(mint);
    if (!mintInfo) throw new Error(`Mint not found: ${mint.toBase58()}`);
    const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(mint, vaultAuthority, true, tokenProgram);
    const ataInfo = await connection.getAccountInfo(ata);
    if (!ataInfo) {
      ixes.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          ata,
          vaultAuthority,
          mint,
          tokenProgram,
        ),
      );
    }
    console.log(`[ATA] mint=${mint.toBase58()} program=${tokenProgram.toBase58()} ata=${ata.toBase58()} exists=${!!ataInfo}`);
  }

  if (ixes.length === 0) {
    console.log('All ATAs exist. Nothing to create.');
    return;
  }

  // Always create ATAs when missing to avoid flag parsing issues
  const tx = new Transaction().add(...ixes);
  const sig = await provider.sendAndConfirm(tx, []);
  console.log('Created ATAs tx:', sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


