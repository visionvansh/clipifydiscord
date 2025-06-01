const { Client, GatewayIntentBits, TextChannel } = require('discord.js');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const inviteCache = new Map();
const processedMembers = new Set();
let client = null;

async function initializeBot() {
  try {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
      ],
    });

    client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    client.on('warn', (info) => {
      console.warn('Discord client warning:', info);
    });

    client.on('ready', async () => {
      console.log('Bot is ready');
      const guildId = process.env.DISCORD_GUILD_ID;
      if (!guildId) throw new Error('DISCORD_GUILD_ID not set');

      const guild = await client.guilds.fetch(guildId);
      const invites = await guild.invites.fetch();
      invites.forEach((invite) => {
        inviteCache.set(invite.code, invite.uses || 0);
      });
      console.log('Cached invites:', Array.from(inviteCache.entries()));
    });

    client.on('guildMemberAdd', async (member) => {
      try {
        console.log(`guildMemberAdd: ${member.id}, Username: ${member.user.username}, Tag: ${member.user.tag}`);

        if (processedMembers.has(member.id)) {
          console.log(`Member ${member.id} already processed, allowing rejoin`);
          processedMembers.delete(member.id);
        }
        processedMembers.add(member.id);

        const guild = member.guild;
        const channelId = process.env.DISCORD_TEXT_CHANNEL_ID;
        if (!channelId) throw new Error('DISCORD_TEXT_CHANNEL_ID not set');

        const channel = await guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
          throw new Error(`Channel ${channelId} is not a valid text channel`);
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
          console.warn('No invite matched for member:', member.id);
          welcomeMessage += ' No invite details available.';
        }

        await channel.send(welcomeMessage);
        console.log(`Sent welcome message for ${member.user.tag}`);
      } catch (error) {
        console.error('Error in guildMemberAdd:', error);
      }
    });

    client.on('threadCreate', async (thread) => {
      try {
        console.log(`Thread created: ${thread.id}, name: ${thread.name}`);
      } catch (error) {
        console.error('Error in threadCreate:', error);
      }
    });

    await client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('Discord bot initialized successfully');
  } catch (error) {
    console.error('Failed to initialize bot:', error);
    client = null;
  }
}

app.post('/create-thread', async (req, res) => {
  try {
    if (!client) throw new Error('Discord bot not initialized');
    const { channelId, name, discordId } = req.body;
    if (!channelId || !name || !discordId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const threadData = {
      name,
      type: 12, // GuildPrivateThread
      auto_archive_duration: 1440,
      invitable: false,
    };

    const thread = await channel.threads.create(threadData);
    await thread.members.add(discordId);
    console.log(`Created thread ${thread.id} for ${discordId}`);

    res.json({ threadId: thread.id });
  } catch (error) {
    console.error('Thread creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/create-invite', async (req, res) => {
  try {
    if (!client) throw new Error('Discord bot not initialized');
    const { channelId } = req.body;
    if (!channelId) {
      return res.status(400).json({ error: 'Missing channelId' });
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const invite = await channel.createInvite({
      maxAge: 0,
      maxUses: 0,
      temporary: false,
      unique: true,
    });

    console.log('Created invite:', { url: invite.url, code: invite.code });
    res.json({ inviteUrl: invite.url, inviteCode: invite.code });
  } catch (error) {
    console.error('Invite creation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-thread-message', async (req, res) => {
  try {
    if (!client) throw new Error('Discord bot not initialized');
    const { threadId, content } = req.body;
    if (!threadId || !content) {
      return res.status(400).json({ error: 'Missing threadId or content' });
    }

    const thread = await client.channels.fetch(threadId);
    if (!thread || !thread.isThread()) {
      return res.status(400).json({ error: 'Invalid thread' });
    }

    await thread.send(content);
    console.log(`Sent message to thread ${thread.id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Thread message failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/send-dm', async (req, res) => {
  try {
    if (!client) throw new Error('Discord bot not initialized');
    const { discordId, content } = req.body;
    if (!discordId || !content) {
      return res.status(400).json({ error: 'Missing discordId or content' });
    }

    const user = await client.users.fetch(discordId);
    await user.send(content);
    console.log(`Sent DM to ${discordId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('DM failed:', error);
    res.status(500).json({ error: error.message });
  }
});

initializeBot().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Bot server running on port ${PORT}`);
  });
});