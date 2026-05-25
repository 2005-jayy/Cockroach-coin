const { Markup, Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  const appUrl = process.env.WEB_APP_URL || 'https://cockroachcoin.netlify.app';
  ctx.reply(
    'Welcome to Cockroach Coin!',
    Markup.inlineKeyboard([
      Markup.button.webApp('Launch Game', appUrl),
    ]),
  );
});

bot.on(message('web_app_data'), async (ctx) => {
  const data = JSON.parse(ctx.message.web_app_data.data);
  ctx.reply(`Cockroach Coin event received: ${JSON.stringify(data)}`);
});

bot.launch();

console.log('Bot running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
