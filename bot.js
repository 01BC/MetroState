const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Role and Category IDs
const METRO_ROLE_ID = '1369107890891264090';
const CATEGORY_ID = '1369428896784711732';
const COMPLAINT_CHANNEL_NAME = 'complaints-system';

// Dropdown options
const OPTIONS = {
  'report_player': 'player',
  'report_metro': 'metroassist',
  'report_faction': 'factionleader',
  'tech_support': 'tech',
  'report_bug': 'bug'
};

function randomID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = client.channels.cache.find(ch => ch.name === COMPLAINT_CHANNEL_NAME);
  if (!channel) return console.error('Complaint channel not found.');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('complaint_select')
    .setPlaceholder('Select complaint type...')
    .addOptions([
      { label: 'Report a Player', value: 'report_player' },
      { label: 'Report a MetroAssist Member', value: 'report_metro' },
      { label: 'Report a Faction Leader', value: 'report_faction' },
      { label: 'Request Technical Support', value: 'tech_support' },
      { label: 'Report a Bug', value: 'report_bug' }
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  await channel.send({ content: '**Open a complaint ticket:**', components: [row] });
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'complaint_select') {
    const typeKey = interaction.values[0];
    const type = OPTIONS[typeKey];
    const id = randomID();

    const parent = interaction.channel;
    const thread = await parent.threads.create({
      name: `${type}-${id}`,
      autoArchiveDuration: 1440,
      type: 12,
      reason: `Ticket by ${interaction.user.tag}`
    });

    await thread.members.add(interaction.user.id);

    // MetroAssist can view it if they have "View Private Threads" in parent channel
    await thread.send({
      content: `<@${interaction.user.id}> <@&${METRO_ROLE_ID}> New complaint received!`,
      embeds: [new EmbedBuilder().setTitle('New Complaint').setDescription(`Type: **${type.replace('_', ' ')}**`).setColor(0xff0000)]
    });

    // Move thread to category
    const guildChannel = await interaction.guild.channels.fetch(thread.id);
    await guildChannel.setParent(CATEGORY_ID);

    // Add "Close Ticket" button
    const closeButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );
    await thread.send({ content: 'Click to close this ticket.', components: [closeButton] });

    return interaction.reply({ content: `✅ Ticket created: ${thread}`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const thread = interaction.channel;
    const messages = await thread.messages.fetch({ limit: 100 });
    const transcript = messages
      .filter(m => !m.author.bot)
      .map(m => `${m.author.tag}: ${m.content}`)
      .reverse()
      .join('\n');

    const filename = `transcript-${thread.name}.txt`;
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, transcript);

    const user = thread.members.cache.find(m => !m.user.bot);
    try {
      await user.send({
        content: 'Here’s your complaint transcript.',
        files: [new AttachmentBuilder(filePath)]
      });

      const ratingButtons = new ActionRowBuilder().addComponents(
        [1, 2, 3, 4, 5].map(num =>
          new ButtonBuilder()
            .setCustomId(`rate_${num}`)
            .setLabel(`${num} ⭐`)
            .setStyle(ButtonStyle.Secondary)
        )
      );
      await user.send({ content: 'Rate your support experience:', components: [ratingButtons] });
    } catch (err) {
      console.error('Could not DM transcript.');
    }

    fs.unlinkSync(filePath); // delete file

    await thread.send('This ticket is now closed.');
    setTimeout(() => thread.delete(), 15000);
  }

  if (interaction.isButton() && interaction.customId.startsWith('rate_')) {
    const rating = interaction.customId.split('_')[1];
    await interaction.reply({ content: `Thanks for rating this ticket **${rating}⭐**!`, ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
