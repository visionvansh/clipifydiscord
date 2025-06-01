import { Client, GatewayIntentBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user?.tag}`);
  client.invites = new Map();
  client.guilds.cache.forEach(async (guild) => {
    try {
      const invites = await guild.invites.fetch();
      client.invites.set(guild.id, invites);
    } catch (error) {
      console.error(`Failed to fetch invites for guild ${guild.id}:`, error);
    }
  });
});

client.on('guildMemberAdd', async (member) => {
  try {
    const guild = member.guild;
    const newInvites = await guild.invites.fetch();
    const oldInvites = client.invites.get(guild.id) || new Map();
    let usedInvite = null;

    for (const [code, invite] of newInvites) {
      const oldInvite = oldInvites.get(code);
      if (!oldInvite || invite.uses > oldInvite.uses) {
        usedInvite = invite;
        break;
      }
    }

    if (!usedInvite) {
      console.log(`No invite found for member: ${member.user.tag}`);
      return;
    }

    console.log(`Member ${member.user.tag} joined using invite ${usedInvite.code}`);

    const inviteLink = await prisma.inviteLink.findFirst({
      where: { inviteCode: usedInvite.code },
      include: { student: true },
    });

    if (!inviteLink) {
      console.log(`No invite link found for code ${usedInvite.code}`);
      return;
    }

    const tempStudentId = `temp_${member.id}`;
    try {
      await prisma.student.upsert({
        where: { discordId: member.id },
        update: {
          discordUsername: member.user.username,
          discordEmail: null,
          signedUpToWebsite: false,
        },
        create: {
          id: tempStudentId,
          username: `temp_${member.user.username}`,
          email: `temp_${member.id}@example.com`,
          discordId: member.id,
          discordUsername: member.user.username,
          discordEmail: null,
          signedUpToWebsite: false,
        },
      });
      console.log(`Created/updated temp student for ${member.user.tag}: ${tempStudentId}`);
    } catch (studentError) {
      console.error(`Student creation failed for ${member.user.tag}:`, studentError);
      return;
    }

    try {
      await prisma.invite.create({
        data: {
          inviterId: inviteLink.studentId,
          invitedId: tempStudentId,
          invitedUsername: member.user.username,
          status: 'pending',
        },
      });
      console.log(`Created invite for ${member.user.tag} by ${inviteLink.studentId}`);
    } catch (inviteError) {
      console.error(`Invite creation failed for ${member.user.tag}:`, inviteError);
      return;
    }

    try {
      await prisma.inviteTracking.create({
        data: {
          inviterId: inviteLink.studentId,
          invitedId: member.id,
          invitedUsername: member.user.username,
        },
      });
      console.log(`Created invite tracking for ${member.user.tag}`);
    } catch (trackingError) {
      console.error(`Invite tracking creation failed for ${member.user.tag}:`, trackingError);
      return;
    }

    client.invites.set(guild.id, newInvites);
  } catch (error) {
    console.error(`Error in guildMemberAdd for ${member.user.tag}:`, error);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);