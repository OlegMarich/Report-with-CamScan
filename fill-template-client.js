
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// ✅ Отримання дати з аргументу
const selectedDate = process.argv[2];
if (!selectedDate) {
  console.error('❌ Не передано дату як аргумент. Приклад: node generate.js 2025-12-01');
  process.exit(1);
}

// 📥 Шляхи до файлів/папок
const baseDir = __dirname;
const outputDir = path.join(baseDir, 'output', selectedDate);
const jsonPath = path.join(outputDir, 'data.json');
const templatePath = path.join(baseDir, 'template.xlsx');

// 🔎 Перевірка наявності файлів
if (!fs.existsSync(jsonPath)) {
  console.error(`❌ Не знайдено файл data.json для дати ${selectedDate} за шляхом: ${jsonPath}`);
  process.exit(1);
}
if (!fs.existsSync(templatePath)) {
  console.error(`❌ Не знайдено шаблон template.xlsx за шляхом: ${templatePath}`);
  process.exit(1);
}

// 📥 Читання та парсинг JSON
let data;
try {
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    console.error('❌ Очікував масив у data.json, але отримано інший тип.');
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Помилка читання/парсингу data.json:', err);
  process.exit(1);
}

// 📦 Логіка обчислення палет
function getBoxesPerPallet(clientName) {
  const name = (clientName || '').toLowerCase();
  const rules = {
    'aldi': 28, 'lidl': 48, 'spar': 32, 'biedronka': 28, 'spar hrvatska': 48,
    'spar ljubljana': 48, 'penny': 32, 'metro': 28,
    'ta-moro': 48, 'cba': 48, 'lunnys': 48,
  };
  let boxesPerPallet = 1;
  for (const [key, value] of Object.entries(rules)) {
    if (name.includes(key)) {
      boxesPerPallet = value;
      break;
    }
  }
  // Якщо нічого не знайшли — повертаємо 2 як дефолт
  return boxesPerPallet === 1 ? 2 : boxesPerPallet;
}

// 🧠 Надійне визначення BIO
function isBioEntry(entry) {
  const odb = (entry['Odbiorca'] || '').toLowerCase();
  const produkt = (entry['Produkt'] || '').toLowerCase();
  const typ = (entry['Typ'] || '').toLowerCase();
  const line = (entry['Linia'] || entry['Line'] || entry['Nazwa linii'] || '').toLowerCase();
  // Вважаємо BIO, якщо зустрічається слово "bio" в будь-якому з полів (по слову, щоб уникнути "biodegradable")
  const re = /\bbio\b/;
  return re.test(odb) || re.test(produkt) || re.test(typ) || re.test(line);
}

// ⏱ Нормалізація часу до формату HH:MM
function normalizeTime(t) {
  if (!t) return 'unknown';
  // заміна крапок на двокрапку, видалення зайвих пробілів
  t = String(t).trim().replace('.', ':').replace(/\s+/g, '');
  // добудова формату до HH:MM
  const m = t.match(/^(\d{1,2}):?(\d{1,2})$/);
  if (!m) return t;
  const hh = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  return `${hh}:${mm}`;
}

// 🧹 Безпечні імена для файлів/папок
function safeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'unknown';
}

// 🔢 Глобальний лічильник файлів
let globalIndex = 0;

/**
 * 🧾 Генерація звіту для КОЖНОГО запису (без агрегування)
 * Верхній блок — звичайні банани; нижній блок — BIO
 */
async function fillTemplateNoGrouping() {
  let processed = 0;

  for (const entry of data) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);

      const mainSheet = workbook.getWorksheet('RAPORT WYDANIA F-NR 15');
      if (!mainSheet) {
        console.error('❌ Не знайдено аркуш "RAPORT WYDANIA F-NR 15" у шаблоні — пропускаю запис.');
        continue;
      }

      // 🧩 Поля запису
      const client = (entry['Odbiorca'] || '').replace(/\s*\(.*bio.*\)/i, '').trim();
      const truck = (entry['Kierowca'] || 'unknown').trim();
      const date = (entry['Data wysyłki'] || '').trim();
      const time = normalizeTime((entry['Godzina'] || '').trim());

      const qty = Number(entry['Ilość razem'] || 0);
      const palGiven = Number(entry['Pal'] || 0);
      const isBio = isBioEntry(entry);

      const boxesPerPallet = getBoxesPerPallet(client);
      const pal = palGiven > 0 ? palGiven : (qty > 0 ? Math.ceil(qty / boxesPerPallet) : 0);

      // 🖊 Заповнення шаблону
      if (!isBio) {
        // Верхній блок (банани)
        mainSheet.getCell('J8').value = date;
        mainSheet.getCell('C8').value = client;
        mainSheet.getCell('J25').value = `${qty} (${pal})`;
        mainSheet.getCell('J29').value = truck;
        mainSheet.getCell('E10').value = time;
      } else {
        // Нижній блок (BIO)
        mainSheet.getCell('J58').value = date;
        mainSheet.getCell('C58').value = `${client} (BIO)`;
        mainSheet.getCell('J67').value = `${qty} (${pal})`;
        mainSheet.getCell('K61').value = truck;
        mainSheet.getCell('E59').value = time;
      }

      // 📂 Збереження у папку клієнта
      const safeClientName = safeName(client);
      const safeTruck = safeName(truck);
      const clientBaseDir = path.join(outputDir, safeClientName);
      if (!fs.existsSync(clientBaseDir)) fs.mkdirSync(clientBaseDir, { recursive: true });

      // ✅ Формуємо ім'я файлу лише з глобальним номером
      globalIndex += 1; // 1, 2, 3 ...
     // const suffix = isBio ? 'BIO' : 'BAN';
      const fileName = `Quality report ${globalIndex} - ${safeClientName}_${safeTruck}.xlsx`;
      const outputPath = path.join(clientBaseDir, fileName);

      await workbook.xlsx.writeFile(outputPath);
      processed += 1;

      console.log(`📄 Створено файл (#${processed}): ${outputPath}`);
    } catch (err) {
      console.error('❌ Помилка при генерації запису:', err);
    }
  }

  if (processed === 0) {
    console.warn('⚠️ Не згенеровано жодного файлу. Можливо, дані порожні або шаблон некоректний.');
  } else {
    console.log(`✅ Усі звіти згенеровано успішно! Кількість: ${processed}`);
  }
}

// ▶️ Запуск
fillTemplateNoGrouping().catch(err => {
  console.error('❌ Критична помилка:', err);
  process.exit(1);
});
