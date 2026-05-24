const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('start', (ctx) => {
  const appUrl = process.env.WEB_APP_URL || 'https://cockroach-coin.vercel.app/';
  ctx.reply('Cockroach Coin is live. Build the only meme empire that survives every crash.', {
    reply_markup: {
      keyboard: [
        [{ text: 'Open Cockroach Coin', web_app: { url: appUrl } }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});

bot.on(message('web_app_data'), async (ctx) => {
  const data = JSON.parse(ctx.message.web_app_data.data);
  ctx.reply(`Cockroach Coin event received: ${JSON.stringify(data)}`);
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
