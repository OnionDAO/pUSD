import { createSolanaClient, generateKeyPairSigner } from "gill";
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { GillTokenManager } from "../lib/token";
import { logger } from "../utils/logger";
import * as fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('network', { type: 'string', default: 'devnet', choices: ['devnet', 'mainnet'], describe: 'Solana network' })
  .option('payer', { type: 'string', describe: 'Path to payer keypair JSON' })
  .option('supply', { type: 'number', default: 1000000, describe: 'Initial token supply' })
  .demandOption(['payer'])
  .strict()
  .argv as any;

function loadKeypair(path: string): Keypair {
  const raw = fs.readFileSync(path, 'utf-8');
  const arr = JSON.parse(raw);
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

async function checkBalance(connection: Connection, address: string): Promise<number> {
  try {
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return balance;
  } catch (error) {
    return 0;
  }
}

async function main() {
  try {
    logger.info(`🚀 Starting pUSD token deployment on ${argv.network}...`);
    const endpoint = argv.network === 'mainnet'
      ? 'https://api.mainnet-beta.solana.com'
      : 'https://api.devnet.solana.com';
    const client = createSolanaClient({ urlOrMoniker: endpoint });
    const connection = new Connection(endpoint, 'confirmed');
    const payer = loadKeypair(argv.payer);
    logger.info(`Payer: ${payer.publicKey.toBase58()}`);
    const balance = await checkBalance(connection, payer.publicKey);
    if (balance < 0.1 * 1e9) {
      throw new Error('Insufficient SOL balance for payer');
    }
    const tokenManager = new GillTokenManager(client, connection, true);
    logger.info("🪙 Creating pUSD token...");
    const pusdToken = await tokenManager.createPUSDToken(payer, argv.network);
    logger.info("🎉 pUSD token created successfully!");
    logger.info(`Mint Address: ${pusdToken.mint.address}`);
    logger.info(`Metadata Address: ${pusdToken.metadataAddress}`);
    logger.info(`Transaction Signature: ${pusdToken.signature}`);
    const tokenInfo = {
      mint: pusdToken.mint.address,
      metadata: pusdToken.metadataAddress,
      signature: pusdToken.signature,
      network: argv.network,
      timestamp: new Date().toISOString(),
      supply: argv.supply
    };
    fs.writeFileSync('token-info.json', JSON.stringify(tokenInfo, null, 2));
    logger.info("✅ pUSD token deployment completed!");
  } catch (error) {
    logger.error("❌ Failed to deploy pUSD token:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 