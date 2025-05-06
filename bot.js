const { Client, Intents } = require('discord.js');
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

// Bot's login token (this will be set in the environment variables later)
client.login(process.env.DISCORD_TOKEN);

// When the bot is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Handle messages
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const prefix = "!"; // The command prefix

  // Command to handle complaints
  if (message.content.startsWith(`${prefix}complaint`)) {
    const complaint = message.content.slice(prefix.length + 9).trim(); // Extracts the complaint message

    if (complaint) {
      // Send complaint to a designated complaints channel
      const complaintChannel = message.guild.channels.cache.find(
        (channel) => channel.name === 'complaints'
      );

      if (complaintChannel) {
        complaintChannel.send(`New complaint from ${message.author.tag}: ${complaint}`);
        message.reply("Your complaint has been submitted.");
      } else {
        message.reply("I couldn't find a 'complaints' channel.");
      }
    } else {
      message.reply("Please provide a complaint message.");
    }
  }
});
