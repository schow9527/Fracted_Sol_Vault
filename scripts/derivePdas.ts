/*
Print config PDA and vault_authority PDA for the transfer_contract program.

Usage:
  ts-node scripts/derivePdas.ts [--program <PROGRAM_ID>] [--json]

If --program is omitted, uses IDL.address from target/idl/transfer_contract.json.
*/

import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';

type Args = { program?: string; json?: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: any = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--program') args.program = v;
    if (a === '--json' || a.startsWith('--json=')) args.json = true;
  }
  if (!args.json) {
    args.json = argv.includes('--json') || argv.some((s) => s.startsWith('--json='));
  }
  return args as Args;
}

function main() {
  const args = parseArgs();
  const idlPath = path.resolve(__dirname, '../target/idl/transfer_contract.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as { address: string };
  const programId = new PublicKey(args.program ?? idl.address);

  const CONFIG_SEED = Buffer.from('config');
  const VAULT_SEED = Buffer.from('vault');

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  const [vaultAuthority] = PublicKey.findProgramAddressSync([VAULT_SEED, configPda.toBuffer()], programId);

  if (args.json) {
    console.log(JSON.stringify({
      programId: programId.toBase58(),
      configPda: configPda.toBase58(),
      vaultAuthority: vaultAuthority.toBase58(),
    }));
  } else {
    console.log('Program ID:      ', programId.toBase58());
    console.log('Config PDA:      ', configPda.toBase58());
    console.log('Vault authority: ', vaultAuthority.toBase58());
  }
}

main();


