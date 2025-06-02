const { initializeDiscordClient, getDiscordClient } = require('./discordClient');
const axios = require('axios');
require('dotenv').config();

const inviteCache = new Map();
const processedMembers = new Set();

async function setupBot() {
  try {
    await initializeDiscordClient();
    const DiscordClient = getDiscordClient();

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await DiscordClient.guilds.fetch(guildId);
    const invites = await guild.invites.fetch();
    invites.forEach((invite) => {
      inviteCache.set(invite.code, invite.uses || 0);
    });
    console.log('Cached invites:', Array.from(inviteCache.entries()));

    DiscordClient.on('guildMemberAdd', async (member) => {
      try {
        console.log(`guildMemberAdd: ${member.id}, Username: ${member.user.username}`);
        // Add your existing guildMemberAdd logic here
      } catch (error) {
        console.error('Error in guildMemberAdd:', error);
      }
    });

    DiscordClient.on('threadCreate', async (thread) => {
      try {
        console.log(`Thread created: ${thread.id}, name: ${thread.name}`);
      } catch (error) {
        console.error('Error handling threadCreate event:', error);
      }
    });
  } catch (error) {
    console.error('Failed to setup bot:', error);
  }
}

setupBot();