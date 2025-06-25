import { createSolanaClient, generateKeyPairSigner } from "gill";
import { Connection, PublicKey } from '@solana/web3.js';
import { GillTokenManager } from "../lib/token";
import { logger } from "../utils/logger";

// Your deployed pUSD token address
const PUSD_MINT = "8GzpAzmBLSHsNQhGFwhokEDziXJAQm7C9P7x3YQYqf4x";

async function main() {
  try {
    logger.info("🪙 Testing pUSD token minting...");

    // Create Solana client for devnet
    const client = createSolanaClient({
      urlOrMoniker: "https://api.devnet.solana.com"
    });

    // Create connection for compatibility
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Generate a new user wallet (simulating a user)
    const userWallet = await generateKeyPairSigner();
    logger.info(`Generated user wallet: ${userWallet.address}`);

    // Generate authority wallet (you would use your actual authority keypair)
    const authority = await generateKeyPairSigner();
    logger.info(`Generated authority: ${authority.address}`);

    // Create token manager
    const tokenManager = new GillTokenManager(client, connection, true);

    // Airdrop SOL to authority for transaction fees
    logger.info("💰 Airdropping SOL to authority...");
    await tokenManager.airdropSOL(authority, 100_000_000n); // 0.1 SOL

    // Airdrop SOL to user for transaction fees
    logger.info("💰 Airdropping SOL to user...");
    await tokenManager.airdropSOL(userWallet, 50_000_000n); // 0.05 SOL

    logger.info("✅ Airdrops completed successfully!");
    logger.info("📝 Note: To mint tokens, you'll need to implement the minting logic");
    logger.info("🔗 Your pUSD token is ready at: " + PUSD_MINT);
    logger.info("🌐 View on Explorer: https://explorer.solana.com/address/" + PUSD_MINT + "?cluster=devnet");

  } catch (error) {
    logger.error("❌ Failed to test minting:", error);
    console.error("Full error:", error);
  }
}

// Run the test
if (require.main === module) {
  main();
} 