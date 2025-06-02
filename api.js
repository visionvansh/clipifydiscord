const express = require('express');
const { REST } = require('discord.js');
require('dotenv').config();

const app = express();
app.use(express.json());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

app.post('/generate-invite', async (req, res) => {
  const { discordId, discordUsername } = req.body;
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    const channelId = process.env.DISCORD_TEXT_CHANNEL_ID;
    const guild = await DiscordClient.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Invalid text channel' });
    }

    const inviteData = {
      max_age: 0,
      max_uses: 0,
      temporary: false,
      unique: true,
    };
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
      body: {
        content: `Your invite link: ${inviteUrl}`,
      },
    });

    res.json({ inviteUrl, threadId });
  } catch (error) {
    console.error('Error generating invite:', error);
    res.status(500).json({ error: 'Failed to generate invite' });
  }
});

app.listen(3000, () => console.log('Render API running on port 3000'));