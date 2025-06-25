import { createSolanaClient, generateKeyPairSigner } from "gill";
import { Connection, PublicKey } from '@solana/web3.js';
import { GillTokenManager } from "../lib/token";
import { logger } from "../utils/logger";
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
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
    logger.info("🚀 Starting pUSD token deployment on devnet...");

    // Create Solana client for devnet
    const client = createSolanaClient({
      urlOrMoniker: "https://api.devnet.solana.com"
    });

    // Create connection for compatibility
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // Generate a new keypair for testing
    const payer = await generateKeyPairSigner();
    
    console.log("\n📋 Wallet Information:");
    console.log("========================");
    console.log(`Address: ${payer.address}`);
    console.log(`Network: Devnet`);
    console.log("\n💰 To get test SOL:");
    console.log("1. Visit: https://faucet.solana.com/");
    console.log("2. Select 'Devnet'");
    console.log("3. Paste your address above");
    console.log("4. Request 2 SOL (recommended)");
    console.log("\n🔗 Alternative faucets:");
    console.log("- https://solfaucet.com/");
    console.log("- https://faucet.solana.com/");
    
    // Check initial balance
    const initialBalance = await checkBalance(connection, payer.address);
    console.log(`\n💳 Current balance: ${initialBalance / 1e9} SOL`);
    
    if (initialBalance < 0.1 * 1e9) { // Less than 0.1 SOL
      console.log("\n⚠️  Insufficient balance. Please fund your wallet first.");
      await question("Press Enter after you've funded your wallet...");
      
      // Check balance again
      let newBalance = await checkBalance(connection, payer.address);
      let attempts = 0;
      
      while (newBalance < 0.1 * 1e9 && attempts < 10) {
        console.log(`\n⏳ Waiting for funds... Current balance: ${newBalance / 1e9} SOL`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        newBalance = await checkBalance(connection, payer.address);
        attempts++;
      }
      
      if (newBalance < 0.1 * 1e9) {
        console.log("❌ Still insufficient balance after waiting. Please try again.");
        rl.close();
        return;
      }
      
      console.log(`✅ Wallet funded! New balance: ${newBalance / 1e9} SOL`);
    }

    // Create token manager
    const tokenManager = new GillTokenManager(client, connection, true);

    // Create pUSD token
    logger.info("🪙 Creating pUSD token...");
    const pusdToken = await tokenManager.createPUSDToken(payer, 'devnet');
    
    logger.info("🎉 pUSD token created successfully!");
    logger.info(`Mint Address: ${pusdToken.mint.address}`);
    logger.info(`Metadata Address: ${pusdToken.metadataAddress}`);
    logger.info(`Transaction Signature: ${pusdToken.signature}`);
    
    // Save token info to file
    const tokenInfo = {
      mint: pusdToken.mint.address,
      metadata: pusdToken.metadataAddress,
      signature: pusdToken.signature,
      network: 'devnet',
      timestamp: new Date().toISOString()
    };

    console.log("\n📋 Token Information:");
    console.log(JSON.stringify(tokenInfo, null, 2));

    logger.info("✅ pUSD token deployment completed!");

  } catch (error) {
    logger.error("❌ Failed to deploy pUSD token:", error);
    console.error("Full error:", error);
  } finally {
    rl.close();
  }
}

// Run the deployment
if (require.main === module) {
  main();
} 