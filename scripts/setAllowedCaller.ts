/*
Update allowed_caller_authority (admin only).

Usage:
  ts-node scripts/setAllowedCaller.ts \
    --program <PROGRAM_ID> \
    --new-allowed <NEW_ALLOWED_CALLER_PUBKEY> \
    [--rpc https://api.devnet.solana.com] \
    [--payer ~/my_solana_wallet.json]
*/

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

type Args = {
  program: string;
  newAllowed: string;
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
    if (a === '--new-allowed') args.newAllowed = v;
    if (a === '--rpc') args.rpc = v;
    if (a === '--payer') args.payer = v;
  }
  if (!args.program) throw new Error('Missing --program');
  if (!args.newAllowed) throw new Error('Missing --new-allowed');
  return args as Args;
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
  const idlPath = path.resolve(__dirname, '../target/idl/transfer_contract.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as anchor.Idl;
  const idlProgramId = new PublicKey((idl as any).address);
  if (!idlProgramId.equals(cliProgramId)) {
    throw new Error(
      `Program ID 与 IDL 不匹配：IDL=${idlProgramId.toBase58()} CLI=${cliProgramId.toBase58()}。请运行 anchor build 重新生成 IDL，或用 --program 指定与 IDL.address 相同的 Program ID。`
    );
  }
  const program = new anchor.Program(idl as anchor.Idl, provider as anchor.Provider);

  const CONFIG_SEED = Buffer.from('config');
  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], idlProgramId);
  const newAllowed = new PublicKey(args.newAllowed);

  console.log('Program ID:     ', idlProgramId.toBase58());
  console.log('Admin (payer):  ', wallet.publicKey.toBase58());
  console.log('Config PDA:     ', configPda.toBase58());
  console.log('New allowed:    ', newAllowed.toBase58());

  const sig = await program.methods
    .setAllowedCaller(newAllowed)
    .accounts({
      config: configPda,
      admin: wallet.publicKey,
    })
    .rpc();

  console.log('set_allowed_caller tx:', sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


