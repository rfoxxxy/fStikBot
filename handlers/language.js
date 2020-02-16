const Markup = require('telegraf/markup')
const handleStart = require('./start')

module.exports = async (ctx) => {
  const locales = {
    en: '🇺🇸',
    ru: '🇷🇺'
  }

  if (ctx.updateType === 'callback_query') {
    if (locales[ctx.match[1]]) {
      ctx.answerCbQuery(locales[ctx.match[1]])

      ctx.session.user.locale = ctx.match[1]
      await ctx.session.user.save()

      ctx.i18n.locale(ctx.session.user.locale)
      await handleStart(ctx)
    }
  } else {
    const button = []

    Object.keys(locales).map((key) => {
      button.push(Markup.callbackButton(locales[key], `set_language:${key}`))
    })

    ctx.reply('🇷🇺 Выберите язык\n🇺🇸 Choose language', {
      reply_markup: Markup.inlineKeyboard(button, {
        columns: 5
      })
    })
  }
}
