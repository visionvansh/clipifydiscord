const express = require('express');
const { Client, GatewayIntentBits, REST } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

let DiscordClient = null;
const inviteCache = new Map();
const processedMembers = new Set();

// Discord Client Initialize Karo
async function initializeDiscordClient() {
  if (DiscordClient) return DiscordClient;
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
    console.log('Discord client initialized');
    return DiscordClient;
  } catch (error) {
    console.error('Failed to initialize Discord client:', error);
    throw error;
  }
}

// Bot Setup Karo
async function setupBot() {
  try {
    await initializeDiscordClient();
    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await DiscordClient.guilds.fetch(guildId);
    const invites = await guild.invites.fetch();
    invites.forEach((invite) => inviteCache.set(invite.code, invite.uses || 0));
    console.log('Cached invites:', Array.from(inviteCache.entries()));

    DiscordClient.on('guildMemberAdd', async (member) => {
      try {
        console.log(`guildMemberAdd: ${member.id}, Username: ${member.user.username}`);

        if (processedMembers.has(member.id)) {
          console.log(`Member ${member.id} already processed, allowing rejoin`);
          processedMembers.delete(member.id);
        }
        processedMembers.add(member.id);

        const guild = member.guild;
        const channelId = process.env.DISCORD_TEXT_CHANNEL_ID;
        const channel = await guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) {
          console.error('Invalid text channel:', channelId);
          return;
        }

        const newInvites = await guild.invites.fetch();
        let usedInvite = null;
        for (const invite of newInvites.values()) {
          const cachedUses = inviteCache.get(invite.code) || 0;
          if ((invite.uses || 0) > cachedUses) {
            usedInvite = invite;
            inviteCache.set(invite.code, invite.uses || 0);
            break;
          }
        }

        let welcomeMessage = `Welcome ${member.user.tag} to ${guild.name}!`;
        if (usedInvite) {
          console.log(`Used invite: ${usedInvite.code}, Uses: ${usedInvite.uses}`);
          welcomeMessage += ` Joined via invite code ${usedInvite.code}.`;
        } else {
          console.warn('No used invite detected for member:', member.id);
          welcomeMessage += ' No invite details available.';
        }

        await channel.send(welcomeMessage);
        console.log(`Sent welcome message for ${member.user.tag}`);

        // Vercel ke /api/update-students ko call karo
        await axios.post(
          `${process.env.VERCEL_API_URL}/api/update-students`,
          {
            discordId: member.id,
            username: member.user.username,
            inviteCode: usedInvite ? usedInvite.code : null,
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log('Called Vercel API to update student and invite');
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

// API Endpoint for /generate-invite
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
app.post('/generate-invite', async (req, res) => {
  const { discordId, discordUsername } = req.body;
  try {
    if (!DiscordClient) await initializeDiscordClient();
    if (!DiscordClient) return res.status(500).json({ error: 'Discord client not initialized' });

    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_TEXT_CHANNEL_ID;
    const guild = await DiscordClient.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) return res.status(400).json({ error: 'Invalid text channel' });

    const inviteData = { max_age: 0, max_uses: 0, temporary: false, unique: true };
    const inviteResponse = await rest.post(`/channels/${channel.id}/invites`, { body: inviteData });
    const inviteUrl = `https://discord.gg/${inviteResponse.code}`;

    const threadData = {
      name: `referral-${discordUsername}-${discordId}`,
      type: 12,
      auto_archive_duration: 1440,
      invitable: false,
    };
    const threadResponse = await rest.post(`/channels/${channel.id}/threads`, { body: threadData });
    const threadId = threadResponse.id;

    await rest.put(`/channels/${threadId}/thread-members/${discordId}`);
    await rest.post(`/channels/${threadId}/messages`, {
      body: { content: `Your invite link: ${inviteUrl}` },
    });

    res.json({ inviteUrl, threadId });
  } catch (error) {
    console.error('Error generating invite:', error);
    res.status(500).json({ error: 'Failed to generate invite' });
  }
});

// Server Start Karo
app.listen(3000, () => {
  console.log('Render API running on port 3000');
  setupBot();
});