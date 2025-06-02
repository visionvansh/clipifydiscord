const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

let DiscordClient = null;

async function initializeDiscordClient() {
  if (DiscordClient) {
    console.log('Discord client already initialized');
    return DiscordClient;
  }

  try {
    DiscordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
      ],
    });

    await DiscordClient.login(process.env.DISCORD_BOT_TOKEN);
    console.log('Discord client initialized successfully');
    return DiscordClient;
  } catch (error) {
    console.error('Failed to initialize Discord client:', error);
    throw error;
  }
}

module.exports = { initializeDiscordClient, getDiscordClient: () => DiscordClient };