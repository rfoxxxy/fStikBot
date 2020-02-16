const fs = require('fs')
const https = require('https')
const Stream = require('stream').Transform
const sharp = require('sharp')
const hasha = require('hasha')

const downloadFileByUrl = (fileUrl) => new Promise(async (resolve, reject) => {
  const data = new Stream()

  https.get(fileUrl, (response) => {
    response.on('data', (chunk) => {
      data.push(chunk)
    })

    response.on('end', () => {
      resolve(data)
    })
  }).on('error', reject)
})

module.exports = (ctx, inputFile) => new Promise(async (resolve) => {
  let stickerFile = inputFile

  const originalSticker = await ctx.db.Sticker.findOne({
    fileUniqueId: stickerFile.file_unique_id
  })

  if (originalSticker && originalSticker.file) stickerFile = originalSticker.file

  if (!ctx.session.user) ctx.session.user = await ctx.db.User.getData(ctx.from)

  const nameSuffix = `_by_${ctx.options.username}`
  const titleSuffix = ` by @${ctx.options.username}`

  const defaultStickerSet = {
    owner: ctx.session.user.id,
    name: `f_${Math.random().toString(36).substring(5)}_${ctx.from.id}`,
    title: 'Favorite stickers',
    emojiSuffix: '🌟'
  }

  defaultStickerSet.name += nameSuffix
  if (ctx.session.user.premium !== true) defaultStickerSet.title += titleSuffix
  if (!ctx.session.user.stickerSet) ctx.session.user.stickerSet = await ctx.db.StickerSet.getSet(defaultStickerSet)

  let emojis = inputFile.emoji || ''

  emojis += ctx.session.user.stickerSet.emojiSuffix || ''

  if (stickerFile.is_animated !== true) {
    const fileUrl = await ctx.telegram.getFileLink(stickerFile)
    const data = await downloadFileByUrl(fileUrl)
    const imageSharp = sharp(data.read())
    const imageMetadata = await imageSharp.metadata().catch(() => {})

    if (
      imageMetadata.width > 512 || imageMetadata.height > 512 ||
      (imageMetadata.width !== 512 && imageMetadata.height !== 512)
    ) {
      if (imageMetadata.height > imageMetadata.width) imageSharp.resize({ height: 512 })
      else imageSharp.resize({ width: 512 })
    }

    const tmpPath = `tmp/${stickerFile.file_id}_${Date.now()}.png`

    await imageSharp.webp({ quality: 100 }).png({ force: false }).toFile(tmpPath).catch(() => {})

    const hash = await hasha.fromFile(tmpPath, { algorithm: 'md5' }).catch(() => {})

    let stickerAdd = false

    if (ctx.session.user.stickerSet.create === false) {
    // eslint-disable-next-line max-len
      stickerAdd = await ctx.telegram.createNewStickerSet(ctx.from.id, ctx.session.user.stickerSet.name, ctx.session.user.stickerSet.title, {
        png_sticker: { source: tmpPath },
        emojis
      }).catch((error) => {
        resolve({
          error: {
            telegram: error
          }
        })
      })

      if (stickerAdd) {
        ctx.session.user.stickerSet.create = true
        ctx.session.user.stickerSet.save()
        ctx.session.user.save()
      }
    } else {
      stickerAdd = await ctx.telegram.addStickerToSet(ctx.from.id, ctx.session.user.stickerSet.name, {
        png_sticker: { source: tmpPath },
        emojis
      }).catch((error) => {
        resolve({
          error: {
            telegram: error
          }
        })
      })
    }

    if (stickerAdd) {
      const getStickerSet = await ctx.telegram.getStickerSet(ctx.session.user.stickerSet.name)
      const stickerInfo = getStickerSet.stickers.slice(-1)[0]

      ctx.db.Sticker.addSticker(ctx.session.user.stickerSet.id, emojis, hash, stickerInfo, stickerFile).catch((error) => {
        resolve({
          error: {
            telegram: error
          }
        })
      })

      resolve({
        ok: {
          title: ctx.session.user.stickerSet.title,
          link: `${ctx.config.stickerLinkPrefix}${ctx.session.user.stickerSet.name}`,
          stickerInfo
        }
      })
    }

    try {
      fs.unlinkSync(tmpPath)
    } catch (error) {
      console.error(error)
    }
  } else {
    resolve({
      error: 'ITS_ANIMATED'
    })
  }
})
