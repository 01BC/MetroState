const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const METRO_ROLE_ID = '1369107890891264090';
const CATEGORY_ID = '1369428896784711732';
const COMPLAINTS_CHANNEL_ID = process.env.COMPLAINTS_CHANNEL_ID;

const OPTIONS = {
  report_player: 'player',
  report_metro: 'metroassist',
  report_faction: 'factionleader',
  tech_support: 'tech',
  report_bug: 'bug'
};

function randomID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// READY
client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// INTERACTIONS
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) return;

  // Handle dropdown selection
  if (interaction.isStringSelectMenu() && interaction.customId === 'complaint_select') {
    const typeKey = interaction.values[0];
    const type = OPTIONS[typeKey];
    const id = randomID();
    const channelName = `${type}-${id}`;

    try {
      const guild = interaction.guild;
      const member = interaction.member;

      const channel = await guild.channels.create({
        name: channelName,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          },
          {
            id: METRO_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          }
        ]
      });

      const closeBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `<@${member.id}> <@&${METRO_ROLE_ID}> New ticket created.`,
        embeds: [
          new EmbedBuilder()
            .setTitle('New Complaint')
            .setDescription(`**Type:** ${type.replace('_', ' ')}\n**User:** ${member.user.tag}`)
            .setColor(0x00b0f4)
        ],
        components: [closeBtn]
      });

      await interaction.reply({ content: `✅ Your ticket has been created: ${channel}`, ephemeral: true });

    } catch (err) {
      console.error('Error creating ticket:', err);
      await interaction.reply({ content: 'There was an error creating your ticket.', ephemeral: true });
    }
  }

  // Handle ticket close
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const channel = interaction.channel;
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcript = messages
      .filter(m => !m.author.bot)
      .map(m => `${m.author.tag}: ${m.content}`)
      .reverse()
      .join('\n');

    const filePath = path.join(__dirname, `${channel.name}-transcript.txt`);
    fs.writeFileSync(filePath, transcript);

    const opener = channel.members.find(m => !m.user.bot);

    try {
      await opener.user.send({
        content: 'Here’s the transcript of your ticket.',
        files: [new AttachmentBuilder(filePath)]
      });

      const ratingRow = new ActionRowBuilder().addComponents(
        [1, 2, 3, 4, 5].map(num =>
          new ButtonBuilder()
            .setCustomId(`rate_${num}`)
            .setLabel(`${num} ⭐`)
            .setStyle(ButtonStyle.Secondary)
        )
      );

      await opener.user.send({ content: 'Please rate your experience:', components: [ratingRow] });
    } catch (err) {
      console.error('Could not DM user transcript.');
    }

    fs.unlinkSync(filePath);
    await channel.send('This ticket will close in 15 seconds...');
    setTimeout(() => channel.delete(), 15000);
  }

  if (interaction.isButton() && interaction.customId.startsWith('rate_')) {
    const rating = interaction.customId.split('_')[1];
    await interaction.reply({ content: `Thanks for rating us **${rating}⭐**!`, ephemeral: true });
  }
});

// MANUAL COMMAND to POST the Dropdown Menu (Run once, then delete it)
client.on('messageCreate', async message => {
  if (message.content === '!sendmenu') {
    if (message.channel.id !== COMPLAINTS_CHANNEL_ID) return;

    const menu = new StringSelectMenuBuilder()
      .setCustomId('complaint_select')
      .setPlaceholder('Choose a complaint type...')
      .addOptions([
        { label: 'Report a Player', value: 'report_player' },
        { label: 'Report a MetroAssist Member', value: 'report_metro' },
        { label: 'Report a Faction Leader', value: 'report_faction' },
        { label: 'Request Technical Support', value: 'tech_support' },
        { label: 'Report a Bug', value: 'report_bug' }
      ]);

    const row = new ActionRowBuilder().addComponents(menu);
    await message.channel.send({ content: '**Open a complaint ticket:**', components: [row] });
  }
});

client.login(process.env.DISCORD_TOKEN);
