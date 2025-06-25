import { createSolanaClient } from "gill";
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { GillTokenManager, GillTokenManagerConf } from "../lib/token";
import { logger } from "../utils/logger";
import * as fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('mint', { type: 'string', demandOption: true, describe: 'Token mint address' })
  .option('payer', { type: 'string', demandOption: true, describe: 'Path to payer keypair JSON' })
  .option('user', { type: 'string', demandOption: true, describe: 'Path to user keypair JSON' })
  .option('amount', { type: 'number', default: 1, describe: 'Amount to mint' })
  .option('confidential', { type: 'boolean', default: false, describe: 'Use confidential transfer' })
  .option('network', { type: 'string', default: 'devnet', choices: ['devnet', 'mainnet'], describe: 'Solana network' })
  .strict()
  .argv as any;

function loadKeypair(path: string): Keypair {
  const raw = fs.readFileSync(path, 'utf-8');
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

async function main() {
  try {
    logger.info("🪙 Minting pUSD tokens...");
    const endpoint = argv.network === 'mainnet'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com';
    const client = createSolanaClient({ urlOrMoniker: endpoint });
    const connection = new Connection(endpoint, 'confirmed');
    const payer = loadKeypair(argv.payer);
    const user = loadKeypair(argv.user);
    const mint = new PublicKey(argv.mint);
    const tokenManager = new GillTokenManager(client, connection, true);
    if (argv.confidential) {
      logger.info('🔒 Using confidential transfer for minting');
      // Create confidential account for user if needed
      const ata = await GillTokenManagerConf.createConfAccount(connection, user.publicKey, mint, payer);
      // Deposit confidential amount
      const sig = await GillTokenManagerConf.depositConfidential(connection, user.publicKey, ata, BigInt(argv.amount), payer);
      logger.info(`Confidential deposit signature: ${sig}`);
      // Apply pending balance
      const sig2 = await GillTokenManagerConf.applyPending(connection, user.publicKey, ata, payer);
      logger.info(`Apply pending signature: ${sig2}`);
    } else {
      logger.info('Minting not implemented for non-confidential mode in this script.');
    }
    logger.info('✅ Minting process completed.');
  } catch (error) {
    logger.error('❌ Failed to mint tokens:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 