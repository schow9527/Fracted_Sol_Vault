const {Connection, PublicKey} = require('@solana/web3.js');

async function main() {
  const conn = new Connection('https://api.devnet.solana.com');
  const peerAddr = new PublicKey('Cmp4Km31bJte3EfQAa32eavAHDoKjNp5JCLNZiVMvwv8');
  const peerInfo = await conn.getAccountInfo(peerAddr);
  
  if (!peerInfo) {
    console.log('❌ Peer account not found!');
    return;
  }
  
  console.log('Peer account data length:', peerInfo.data.length);
  console.log('Owner:', peerInfo.owner.toBase58());
  
  // PeerConfig 结构（根据 IDL）：
  // - 8 bytes: discriminator
  // - 32 bytes: peer_address ([u8; 32])
  // - EnforcedOptions: send (4 + vec) + send_and_call (4 + vec)
  // - 1 byte: bump
  
  const discriminator = peerInfo.data.slice(0, 8);
  console.log('Discriminator:', Array.from(discriminator));
  
  const peerAddress = peerInfo.data.slice(8, 40);
  console.log('Peer address (32 bytes):', Buffer.from(peerAddress).toString('hex'));
  
  // EnforcedOptions 是动态大小的，所以 bump 在最后一个字节
  const bump = peerInfo.data[peerInfo.data.length - 1];
  console.log('Bump (last byte):', bump);
  
  // 验证 PDA
  const PEER_SEED = Buffer.from('Peer');
  const STORE = new PublicKey('2shV4AoGNput9NqaKrcyHXHhwzsksXgJ4LC25FtbJsSy');
  const dstEid = 40245;
  const dstEidBuf = Buffer.alloc(4);
  dstEidBuf.writeUInt32BE(dstEid);
  
  const [calculated, calcBump] = PublicKey.findProgramAddressSync(
    [PEER_SEED, STORE.toBuffer(), dstEidBuf],
    new PublicKey('CV1qjq8phMMpxv62TExA9PpvTyZx58TNCqkFB2QQgJXH')
  );
  
  console.log('\nPDA Verification:');
  console.log('Calculated PDA:', calculated.toBase58());
  console.log('Calculated bump:', calcBump);
  console.log('Stored bump in account:', bump);
  console.log('Match:', calculated.equals(peerAddr) && calcBump === bump);
  
  if (calcBump !== bump) {
    console.log('\n❌ PROBLEM: Stored bump does not match calculated bump!');
    console.log('This will cause ConstraintAddress error in Anchor validation.');
  }
}

main().catch(console.error);
