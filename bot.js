require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// API настройки для Mistral через Together AI
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

// Функция обработки изображения
async function processImage(inputPath, outputPath, width, height, position) {
  await sharp(inputPath)
    .resize({ width, height, fit: 'cover', position })
    .jpeg({ quality: 80 })
    .toFile(outputPath);
}

const userImages = {};

bot.start(async (ctx) => {
  await ctx.reply('Здравствуйте, Екатерина Александровна!');
});

async function handleImage(ctx, fileId) {
  try {
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const inputPath = path.join(__dirname, 'temp', `${ctx.chat.id}.jpg`);
    const response = await axios({ url: fileUrl.href, responseType: 'arraybuffer' });
    fs.writeFileSync(inputPath, response.data);
    userImages[ctx.chat.id] = inputPath;

    await ctx.reply('Выберите способ обрезки для 1110x398:', Markup.inlineKeyboard([
      [Markup.button.callback('🔼 Верх', 'crop_1110x398_north')],
      [Markup.button.callback('🔽 Низ', 'crop_1110x398_south')],
      [Markup.button.callback('🔳 Центр', 'crop_1110x398_center')],
    ]));

    await ctx.reply('Выберите способ обрезки для 345x250:', Markup.inlineKeyboard([
      [Markup.button.callback('🔼 Верх', 'crop_345x250_north')],
      [Markup.button.callback('🔽 Низ', 'crop_345x250_south')],
      [Markup.button.callback('🔳 Центр', 'crop_345x250_center')],
    ]));
  } catch (error) {
    console.error('Ошибка обработки:', error);
    await ctx.reply('Произошла ошибка при обработке фото.');
  }
}

bot.on('photo', async (ctx) => {
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  await handleImage(ctx, fileId);
});

bot.on('document', async (ctx) => {
  const file = ctx.message.document;
  if (file.mime_type.startsWith('image/')) {
    await handleImage(ctx, file.file_id);
  } else {
    await processText(ctx, file);
  }
});

async function processText(ctx, file) {
  const text = file.text || 'Текст не найден';

  // Показываем индикатор "печатает"
  await ctx.replyWithChatAction('typing');

  try {
    const response = await axios.post(MISTRAL_API_URL, {
      model: 'mistral-medium-latest', // Используйте более мощную модель
      temperature: 0.7, // Уменьшите randomness
      top_p: 0.9, // Уменьшите randomness
      max_tokens: 500, // Увеличьте количество токенов
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'Ты — SEO-специалист. Сформируй 5 вариантов SEO title и description на русском языке. Структура должна быть такой:\n\n### Вариант 1:\n**Title:** [Заголовок]\n**Description:** [Описание]\n\n### Вариант 2:\n**Title:** [Заголовок]\n**Description:** [Описание]\n\nИ так далее. Не отклоняйся от этой структуры. Не используй HTML-теги, случайные символы или непонятные слова.',
        },
        {
          role: 'user',
          content: `Сформируй 5 вариантов SEO title и description для этого текста: ${text}`,
        },
      ],
      response_format: {
        type: 'text',
      },
    }, {
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Ответ от Mistral API:', response.data);
    const seoText = response.data.choices && response.data.choices[0]?.message?.content;

    // Проверка ответа
    if (!seoText || seoText.includes('<') || seoText.includes('>') || seoText.includes('http')) {
      throw new Error('Некорректный ответ от Mistral API');
    }

    if (seoText) {
      const maxLength = 4096;
      for (let i = 0; i < seoText.length; i += maxLength) {
        await ctx.reply(`📌 SEO-анализ текста (часть ${i / maxLength + 1}):\n\n${seoText.slice(i, i + maxLength)}`);
      }
    } else {
      await ctx.reply('Не удалось получить SEO-анализ текста.');
    }
  } catch (error) {
    console.error('Ошибка при обработке текста:', error);
    await ctx.reply('Произошла ошибка при обработке текста. Попробуйте еще раз.');
  }
}

bot.on('text', async (ctx) => {
  await processText(ctx, { file_id: null, text: ctx.message.text });
});

bot.action(/^crop_(\d+x\d+)_(north|center|south)$/, async (ctx) => {
  const [, size, position] = ctx.match;
  const inputPath = userImages[ctx.chat.id];
  if (!inputPath || !fs.existsSync(inputPath)) {
    return ctx.reply('Файл не найден. Отправьте фото ещё раз.');
  }

  const [width, height] = size.split('x').map(Number);
  const positions = { north: 'north', center: 'center', south: 'south' };
  const outputPath = path.join(__dirname, 'temp', `${ctx.chat.id}_${size}.jpg`);

  await processImage(inputPath, outputPath, width, height, positions[position]);
  await ctx.replyWithPhoto({ source: outputPath }, { caption: `${size} (${position})` });
  fs.unlinkSync(outputPath);
});

bot.launch();
console.log('Бот запущен!');

