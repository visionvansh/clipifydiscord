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

client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  client.invites = new Map();
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      client.invites.set(guild.id, new Map(invites.map((invite) => [invite.code, invite])));
      console.log(`Fetched ${invites.size} invites for guild ${guild.id}`);
    } catch (error) {
      console.error(`Failed to fetch invites for guild ${guild.id}:`, error);
    }
  }
});

client.on('guildMemberAdd', async (member) => {
  try {
    const guild = member.guild;
    console.log(`Member ${member.user.tag} joined guild ${guild.id}`);

    // Fetch fresh invites
    let newInvites;
    try {
      newInvites = await guild.invites.fetch();
      console.log(`Fetched ${newInvites.size} invites for guild ${guild.id}`);
    } catch (error) {
      console.error(`Failed to fetch invites for guild ${guild.id}:`, error);
      return;
    }

    const oldInvites = client.invites.get(guild.id) || new Map();
    let usedInvite = null;

    // Check for used invite
    for (const [code, invite] of newInvites) {
      const oldInvite = oldInvites.get(code);
      if (!oldInvite || invite.uses > oldInvite.uses) {
        usedInvite = invite;
        console.log(`Detected used invite: ${code}, uses: ${invite.uses}`);
        break;
      }
    }

    // Fallback: Check if any invite matches
    if (!usedInvite) {
      for (const [code, invite] of newInvites) {
        if (invite.uses > 0) {
          usedInvite = invite;
          console.log(`Fallback: Using invite ${code} with ${invite.uses} uses`);
          break;
        }
      }
    }

    if (!usedInvite) {
      console.log(`No invite found for member: ${member.user.tag}`);
      return;
    }

    console.log(`Member ${member.user.tag} joined using invite ${usedInvite.code}`);

    // Find InviteLink in DB
    const inviteLink = await prisma.inviteLink.findFirst({
      where: { inviteCode: usedInvite.code },
      include: { student: true },
    });

    if (!inviteLink) {
      console.log(`No invite link found for code ${usedInvite.code}`);
      return;
    }

    // Fetch email (if available)
    let discordEmail = null;
    try {
      const user = await member.user.fetch();
      discordEmail = user.email || null;
    } catch (error) {
      console.warn(`Failed to fetch email for ${member.user.tag}:`, error);
    }

    const tempStudentId = `temp_${member.id}`;
    try {
      await prisma.student.upsert({
        where: { discordId: member.id },
        update: {
          discordUsername: member.user.username,
          discordEmail,
          signedUpToWebsite: false,
        },
        create: {
          id: tempStudentId,
          username: `temp_${member.user.username}`,
          email: `temp_${member.id}@example.com`,
          discordId: member.id,
          discordUsername: member.user.username,
          discordEmail,
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

    // Update invite cache
    client.invites.set(guild.id, new Map(newInvites.map((invite) => [invite.code, invite])));
  } catch (error) {
    console.error(`Error in guildMemberAdd for ${member.user.tag}:`, error);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);