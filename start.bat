@echo off
echo 🟢 Запуск локального сервера...
start "" node server.js

timeout /t 2 >nul

echo 🌐 Відкриваємо в Google Chrome...
start chrome http://localhost:3000

pause

