require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Функция обработки изображения с разными вариантами обрезки
async function processImage(inputPath, outputPath, width, height, position) {
    await sharp(inputPath)
        .resize({ width, height, fit: 'cover', position }) // Выбираем фокус обрезки
        .jpeg({ quality: 80 }) // Максимальное сжатие без видимой потери качества
        .toFile(outputPath);
}

// Функция конвертации WebP → JPEG
async function convertWebPtoJPEG(inputPath, outputPath) {
    try {
        await sharp(inputPath).jpeg({ quality: 90 }).toFile(outputPath);
        return outputPath;
    } catch (error) {
        console.error('Ошибка конвертации WebP:', error);
        return null;
    }
}

// Приветственное сообщение
bot.start(async (ctx) => {
    await ctx.reply('Здравствуйте, Екатерина Александровна!');
});

// Хранилище для фото (ключ - ID чата)
const userImages = {};

// Функция обработки фото (сохранение файла и показ кнопок)
async function handleImage(ctx, fileId, mimeType) {
    try {
        await ctx.reply('Фото получено! Выберите параметры обрезки.');

        const fileUrl = await ctx.telegram.getFileLink(fileId);
        const inputPath = path.join(__dirname, 'temp', `${ctx.chat.id}.jpg`);

        // Скачиваем фото
        const response = await axios({ url: fileUrl.href, responseType: 'arraybuffer' });
        fs.writeFileSync(inputPath, response.data);

        // Если WebP — конвертируем в JPEG
        if (mimeType === 'image/webp') {
            const jpegPath = path.join(__dirname, 'temp', `${ctx.chat.id}_converted.jpg`);
            await convertWebPtoJPEG(inputPath, jpegPath);
            fs.unlinkSync(inputPath); // Удаляем WebP
            userImages[ctx.chat.id] = jpegPath; // Сохраняем новый путь
        } else {
            userImages[ctx.chat.id] = inputPath;
        }

        // Отправляем кнопки
        await ctx.reply(
            'Выберите способ обрезки для 1110x398:',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔼 Верх', `crop_1110x398_north`)],
                [Markup.button.callback('🔽 Низ', `crop_1110x398_south`)],
                [Markup.button.callback('🔳 Центр', `crop_1110x398_center`)],
            ])
        );

        await ctx.reply(
            'Выберите способ обрезки для 345x250:',
            Markup.inlineKeyboard([
                [Markup.button.callback('🔼 Верх', `crop_345x250_north`)],
                [Markup.button.callback('🔽 Низ', `crop_345x250_south`)],
                [Markup.button.callback('🔳 Центр', `crop_345x250_center`)],
            ])
        );
    } catch (error) {
        console.error('Ошибка обработки:', error);
        await ctx.reply('Произошла ошибка при обработке фото.');
    }
}

// Обрабатываем стандартные фото
bot.on('photo', async (ctx) => {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    await handleImage(ctx, fileId, 'image/jpeg');
});

// Обрабатываем фото, отправленные как документ
bot.on('document', async (ctx) => {
    const file = ctx.message.document;
    if (file.mime_type.startsWith('image/')) {
        await handleImage(ctx, file.file_id, file.mime_type);
    } else {
        await ctx.reply('Отправьте, пожалуйста, изображение.');
    }
});

// Обработчик кнопок с вариантами обрезки
bot.action(/^crop_(\d+x\d+)_(north|center|south)$/, async (ctx) => {
    const [, size, position] = ctx.match; // Парсим данные кнопки
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

// Автоперезапуск бота через пинг
setInterval(() => {
    console.log("Бот работает...");
}, 5 * 60 * 1000); // Каждые 5 минут

// Запуск бота
bot.launch();
console.log('Бот запущен!');
