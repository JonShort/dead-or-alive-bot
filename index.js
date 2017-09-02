require('dotenv').config();
const { Composer } = require('micro-bot');
const BotRunner = require('./BotRunner');

const bot = new Composer(process.env.BOT_TOKEN);
bot.on('text', BotRunner.textReceived);

module.exports = bot;

