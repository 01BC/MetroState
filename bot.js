const { 
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Helper to generate a random 4-char ID (letters and digits)
function generateTicketID() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ticket-${id}`;
}

// When the bot is ready, send the button somewhere (or you can trigger this via a slash command)
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  // Replace CHANNEL_ID with the ID of the channel where you want the button posted
  const channel = client.channels.cache.get(process.env.BUTTON_CHANNEL_ID);
  if (!channel) return console.error('BUTTON_CHANNEL_ID not found');

  // Build the button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('open_ticket')
      .setLabel('📩 Open Complaint Ticket')
      .setStyle(ButtonStyle.Primary)
  );

  channel.send({
    content: 'Click the button below to open a new complaint ticket:',
    components: [row]
  });
});

// Listen for interactions
client.on(Events.InteractionCreate, async interaction => {
  // 1) Button click to open ticket
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    // Create a modal (form)
    const modal = new ModalBuilder()
      .setCustomId('complaint_modal')
      .setTitle('Submit a Complaint');

    const complaintInput = new TextInputBuilder()
      .setCustomId('complaint_text')
      .setLabel('Describe your complaint')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('I have an issue with...')
      .setRequired(true);

    // Add it to action rows
    modal.addComponents(
      new ActionRowBuilder().addComponents(complaintInput)
    );

    return interaction.showModal(modal);
  }

  // 2) Modal submit
  if (interaction.isModalSubmit() && interaction.customId === 'complaint_modal') {
    const complaint = interaction.fields.getTextInputValue('complaint_text').trim();
    const ticketID = generateTicketID();

    // The channel where tickets live (same as your button channel)
    const parentChannel = interaction.channel;
    if (!parentChannel) {
      return interaction.reply({ content: 'Error: cannot locate channel.', ephemeral: true });
    }

    // Create a **private thread** for this user complaint
    const thread = await parentChannel.threads.create({
      name: ticketID,
      autoArchiveDuration: 60,      // 1 hour of inactivity
      type: 11,                     // 11 = PRIVATE_THREAD
      reason: `New complaint ticket by ${interaction.user.tag}`
    });

    // Post the complaint as an embed inside the thread
    const embed = new EmbedBuilder()
      .setTitle(`Complaint • ${ticketID}`)
      .setDescription(complaint)
      .setColor(0xFF0000)
      .setFooter({ text: `User: ${interaction.user.tag}` })
      .setTimestamp();

    await thread.send({ embeds: [embed] });

    // Acknowledge the user
    return interaction.reply({
      content: `✅ Your ticket **${ticketID}** has been created: ${thread.toString()}`,
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
