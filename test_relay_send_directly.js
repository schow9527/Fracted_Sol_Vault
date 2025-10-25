// 直接测试调用 OApp 的 relay_send，用于调试
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

function loadKeypair(p) {
  const filePath = p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
  const bs = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(bs));
}

async function main() {
  // Setup
  const rpc = 'https://api.devnet.solana.com';
  const payer = loadKeypair('~/my_solana_wallet.json');
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(rpc, 'confirmed'),
    new anchor.Wallet(payer),
    { commitment: 'confirmed' }
  );
  anchor.setProvider(provider);

  // Load OApp IDL
  const LAYERZERO_OAPP_PROGRAM_ID = new PublicKey('CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH');
  const idl = JSON.parse(fs.readFileSync('layerzero_oapp.json', 'utf-8'));
  const oappProgram = new anchor.Program(idl, LAYERZERO_OAPP_PROGRAM_ID, provider);

  // Constants
  const PEER_SEED = Buffer.from('Peer');
  const STORE_SEED = Buffer.from('Store');
  const ENDPOINT_PROGRAM_ID = new PublicKey('76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6');

  const dstEid = 40245;
  const dstEidBuffer = Buffer.alloc(4);
  dstEidBuffer.writeUInt32BE(dstEid, 0);

  const [storePda] = PublicKey.findProgramAddressSync([STORE_SEED], LAYERZERO_OAPP_PROGRAM_ID);
  const [peerPda] = PublicKey.findProgramAddressSync(
    [PEER_SEED, storePda.toBuffer(), dstEidBuffer],
    LAYERZERO_OAPP_PROGRAM_ID
  );

  console.log('Testing direct relay_send call...');
  console.log('Store PDA:', storePda.toBase58());
  console.log('Peer PDA:', peerPda.toBase58());
  console.log('Caller:', payer.publicKey.toBase58());

  // Prepare LayerZero accounts (same as in deposit script)
  const SEND_LIBRARY_PROGRAM = new PublicKey('2XgGZG4oP29U3w5h4nTk1V2LFHL23zKDPJjs3psGzLKQ');
  const SEND_LIBRARY_CONFIG_SEED = Buffer.from('SendLibraryConfig');
  const MESSAGE_LIB_SEED = Buffer.from('MessageLib');
  const NONCE_SEED = Buffer.from('Nonce');

  const [sendLibraryConfigPda] = PublicKey.findProgramAddressSync(
    [SEND_LIBRARY_CONFIG_SEED, storePda.toBuffer(), dstEidBuffer],
    ENDPOINT_PROGRAM_ID
  );
  const [defaultSendLibraryConfigPda] = PublicKey.findProgramAddressSync(
    [SEND_LIBRARY_CONFIG_SEED, dstEidBuffer],
    ENDPOINT_PROGRAM_ID
  );
  const [sendLibraryInfoPda] = PublicKey.findProgramAddressSync(
    [MESSAGE_LIB_SEED, SEND_LIBRARY_PROGRAM.toBuffer()],
    ENDPOINT_PROGRAM_ID
  );

  const peerAccount = await provider.connection.getAccountInfo(peerPda);
  const peerAddressBytes = peerAccount.data.slice(8, 40);
  const [noncePda] = PublicKey.findProgramAddressSync(
    [NONCE_SEED, storePda.toBuffer(), dstEidBuffer, peerAddressBytes],
    ENDPOINT_PROGRAM_ID
  );

  // Test message
  const testMessage = '0x0000000000000000000000000000000000000000000000000000000000000065';

  try {
    const tx = await oappProgram.methods
      .relaySend({
        dstEid,
        message: testMessage,
        options: [],
        nativeFee: new anchor.BN(0),
        lzTokenFee: new anchor.BN(0),
      })
      .accounts({
        peer: peerPda,
        store: storePda,
        caller: payer.publicKey,
      })
      .remainingAccounts([
        { pubkey: SEND_LIBRARY_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: sendLibraryConfigPda, isSigner: false, isWritable: false },
        { pubkey: defaultSendLibraryConfigPda, isSigner: false, isWritable: false },
        { pubkey: sendLibraryInfoPda, isSigner: false, isWritable: false },
        { pubkey: noncePda, isSigner: false, isWritable: true },
      ])
      .rpc();

    console.log('✅ relay_send 成功!');
    console.log('交易签名:', tx);
  } catch (error) {
    console.error('❌ relay_send 失败:', error.message);
    if (error.logs) {
      console.log('Logs:', error.logs.join('\n'));
    }
  }
}

main().catch(console.error);

