const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.invites = new Map();
  client.guilds.cache.forEach(async (guild) => {
    const invites = await guild.invites.fetch();
    client.invites.set(guild.id, invites);
  });
});

client.on('guildMemberAdd', async (member) => {
  try {
    const guild = member.guild;
    const newInvites = await guild.invites.fetch();
    const oldInvites = client.invites.get(guild.id) || new Map();
    let usedInvite = null;

    // Find which invite was used
    for (const [code, invite] of newInvites) {
      const oldInvite = oldInvites.get(code);
      if (!oldInvite || invite.uses > oldInvite.uses) {
        usedInvite = invite;
        break;
      }
    }

    if (!usedInvite) {
      console.log('No invite found for member:', member.user.tag);
      return;
    }

    console.log(`Member ${member.user.tag} joined using invite ${usedInvite.code}`);

    // Check if invite is linked to a student
    const inviteLink = await prisma.inviteLink.findFirst({
      where: { inviteCode: usedInvite.code },
      include: { student: true },
    });

    if (!inviteLink) {
      console.log(`No invite link found for code ${usedInvite.code}`);
      return;
    }

    // Create temporary student record
    const tempStudentId = `temp_${member.id}`;
    await prisma.student.upsert({
      where: { discordId: member.id },
      update: {
        discordUsername: member.user.username,
        discordEmail: null, // No email available at join
        signedUpToWebsite: false,
      },
      create: {
        id: tempStudentId,
        discordId: member.id,
        discordUsername: member.user.username,
        discordEmail: null,
        signedUpToWebsite: false,
      },
    });
    console.log(`Created/updated temp student for ${member.user.tag}: ${tempStudentId}`);

    // Create invite tracking
    await prisma.invite.create({
      data: {
        inviterId: inviteLink.studentId,
        invitedId: tempStudentId,
        invitedUsername: member.user.username,
        status: 'pending',
      },
    });
    console.log(`Created invite for ${member.user.tag} by ${inviteLink.studentId}`);

    // Update invite tracking
    await prisma.inviteTracking.create({
      data: {
        inviterId: inviteLink.studentId,
        invitedId: member.id,
        invitedUsername: member.user.username,
      },
    });

    // Notify inviter
    try {
      const threadId = inviteLink.threadId;
      if (threadId) {
        await axios.post(`${process.env.DISCORD_BOT_API_URL}/send-thread-message`, {
          threadId,
          content: `New user ${member.user.username} joined using your invite!`,
        });
      } else {
        await axios.post(`${process.env.DISCORD_BOT_API_URL}/send-dm`, {
          discordId: inviteLink.discordId || inviteLink.studentId,
          content: `New user ${member.user.username} joined using your invite!`,
        });
      }
    } catch (error) {
      console.error('Notification failed:', error);
    }

    // Update invite cache
    client.invites.set(guild.id, newInvites);
  } catch (error) {
    console.error('Error in guildMemberAdd:', error);
  }
});

// Other bot endpoints (create-thread, create-invite, etc.) remain unchanged
client.login(process.env.DISCORD_BOT_TOKEN);