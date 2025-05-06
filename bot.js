// bot.js
const { Client, GatewayIntentBits } = require('discord.js');

// Helper to generate a random 4-letter ticket ID
function generateTicketID() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return id;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.login(process.env.DISCORD_TOKEN);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  // Only respond to !complaint commands
  if (message.content.toLowerCase().startsWith('!complaint')) {
    const complaintText = message.content.slice('!complaint'.length).trim();
    const ticketID = generateTicketID();

    if (!complaintText) {
      return message.reply('Please provide a complaint message after the command.');
    }

    // Find the #complaints-system channel
    const complaintsChannel = message.guild.channels.cache.find(
      channel => channel.name === 'complaints-system'
    );

    if (!complaintsChannel) {
      return message.reply('I couldn’t find a channel named #complaints-system.');
    }

    // Post the complaint with the ticket ID
    const embed = {
      title: `New Complaint • Ticket ${ticketID}`,
      description: complaintText,
      color: 0xFF0000,
      footer: { text: `From: ${message.author.tag}` },
      timestamp: new Date()
    };

    complaintsChannel.send({ embeds: [embed] })
      .then(() => {
        message.reply(`Your complaint has been submitted! Your ticket ID is **${ticketID}**.`);
      })
      .catch(err => {
        console.error('Error sending complaint:', err);
        message.reply('There was an error submitting your complaint. Please try again later.');
      });
  }
});
