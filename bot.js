const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

let DiscordClient = null;
const inviteCache = new Map();
const processedMembers = new Set();

async function initializeDiscordClient() {
  if (DiscordClient) {
    console.log('Discord client already initialized');
    return;
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

    DiscordClient.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    DiscordClient.on('warn', (info) => {
      console.warn('Discord client warning:', info);
    });

    await DiscordClient.login(process.env.DISCORD_BOT_TOKEN);
    console.log('Discord client initialized successfully');

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

        if (!usedInvite) {
          console.warn('No used invite detected for member:', member.id);
        }

        let welcomeMessage = `Welcome ${member.user.tag} to ${guild.name}!`;
        if (usedInvite) {
          console.log(`Used invite: ${usedInvite.code}, Uses: ${usedInvite.uses}`);
          welcomeMessage += ` Joined via invite code ${usedInvite.code}.`;
        } else {
          welcomeMessage += ' No invite details available.';
        }

        await channel.send(welcomeMessage);
        console.log(`Sent welcome message for ${member.user.tag}`);

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
    console.error('Failed to initialize Discord client:', error);
    DiscordClient = null;
  }
}

initializeDiscordClient();