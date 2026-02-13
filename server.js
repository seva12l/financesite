const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Статические файлы
app.use(express.static(path.join(__dirname), {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        // Service Worker — не кэшировать
        if (filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
        // Manifest
        if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// Все маршруты → index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});