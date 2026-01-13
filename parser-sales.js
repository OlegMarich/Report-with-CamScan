const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const inquirer = require('inquirer');

// 🧠 Визначає тип продукту
function detectProduct(customer, lineName) {
  const name = `${customer} ${lineName}`.toLowerCase();

  if (name.includes('bio')) return 'BIO banana';

  return 'banana';
}

async function readSalesPlan() {
  const inputDir = path.join(__dirname, 'input');

  if (!fs.existsSync(inputDir)) {
    console.error('❌ Папка /input не існує');
    process.exit(1);
  }

  const files = fs.readdirSync(inputDir);
  if (!files.length) {
    console.error('❌ Папка /input порожня');
    process.exit(1);
  }

  const salesFile = files.find((f) => f.toLowerCase().includes('sales'));
  if (!salesFile) {
    console.error('❌ Не знайдено файл sales у папці /input');
    process.exit(1);
  }

  const salesPath = path.join(inputDir, salesFile);
  let workbook;
  try {
    workbook = xlsx.readFile(salesPath);
  } catch (e) {
    console.error('❌ Не вдалося прочитати Excel-файл:', e.message);
    process.exit(1);
  }

  if (!workbook.SheetNames || !workbook.SheetNames.length) {
    console.error('❌ У файлі немає вкладок');
    process.exit(1);
  }

  let weekName;
  const sheetNames = workbook.SheetNames;

  // 📌 Об'єднуємо всі аргументи у єдиний рядок (щоб "40 WEEK" працювало без лапок)
  const argSheet = process.argv.slice(2).join(" ").trim();

  if (argSheet) {
    // Якщо введене точне ім'я вкладки
    const foundExact = sheetNames.find((name) => name.toLowerCase() === argSheet.toLowerCase());
    if (foundExact) {
      weekName = foundExact;
    } else {
      // Якщо ввели тільки номер тижня (наприклад 40)
      const inputWeek = argSheet.replace(/\D/g, '');
      const foundSheet = sheetNames.find((name) => {
        const normalized = name.replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
        return (
          normalized.includes(`week${inputWeek}`) ||
          normalized.includes(`wk${inputWeek}`) ||
          normalized === `${inputWeek}week` ||
          normalized === `week${inputWeek}` ||
          normalized === `wk${inputWeek}` ||
          normalized === `${inputWeek}`
        );
      });

      if (!foundSheet) {
        console.error(`❌ Вкладка з номером тижня або назвою "${argSheet}" не знайдена.`);
        console.log('📄 Доступні вкладки:', sheetNames.join(', '));
        process.exit(1);
      }

      weekName = foundSheet;
    }
  } else {
    const answer = await inquirer.prompt({
      type: 'list',
      name: 'weekName',
      message: '🗓 Оберіть вкладку з тижнем:',
      choices: sheetNames,
    });
    weekName = answer.weekName;
  }

  const sheet = workbook.Sheets[weekName];
  if (!sheet) {
    console.error('❌ Вкладка не знайдена!');
    process.exit(1);
  }

  const sheetJson = xlsx.utils.sheet_to_json(sheet, {
    defval: '',
    header: 1,
  });

  return { sheetJson, weekName, salesFile, sheet };
}

function extractDatesFromHeader(sheet) {
  const XLSX = require('xlsx');
  const cellAddresses = Object.keys(sheet).filter((addr) => addr[0] !== '!');
  const row3Cells = cellAddresses.filter((addr) => {
    const match = addr.match(/^([A-Z]+)(\d+)$/);
    return match && match[2] === '3';
  });

  row3Cells.sort((a, b) => {
    const colToNum = (col) =>
      col.split('').reduce((res, ch) => res * 26 + (ch.charCodeAt(0) - 64), 0);
    const colA = a.match(/^([A-Z]+)/)[1];
    const colB = b.match(/^([A-Z]+)/)[1];
    return colToNum(colA) - colToNum(colB);
  });

  const dates = row3Cells
    .map((addr) => {
      const value = sheet[addr]?.v;
      if (typeof value === 'string') {
        const match = value.match(/^(\d{1,2})\.(\d{1,2})$/);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          const now = new Date();
          const year = now.getFullYear();
          return `${year}-${month}-${day}`;
        }
      }
      if (typeof value === 'number') {
        const dateObj = XLSX.SSF.parse_date_code(value);
        if (dateObj) {
          const year = dateObj.y;
          const month = String(dateObj.m).padStart(2, '0');
          const day = String(dateObj.d).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }
      return null;
    })
    .filter(Boolean);

  return dates;
}

function parseSalesByCustomer(sheetJson, dates) {
  const result = [];
  let currentCustomer = null;
  let currentColorCode = null;
  let currentCityOrLocation = null;

  const startDateCol = 2;

  for (let i = 11; i < sheetJson.length; i++) {
    const row = sheetJson[i];
    if (!row || row.every((cell) => cell === '' || cell === undefined)) continue;

    const candidate = row
      .slice(0, 5)
      .find(
        (cell) => typeof cell === 'string' && cell.trim().length > 2 && !cell.trim().match(/^\d+$/),
      );
    const onlyText = row.every((cell) => typeof cell === 'string' || cell === '');

    if (candidate && onlyText) {
      currentCustomer = candidate.trim();
      const match = currentCustomer.match(/\[(.*?)\]/);
      currentColorCode = match ? match[1].trim() : null;
      currentCityOrLocation = null;
      continue;
    }

    const quantities = row.slice(startDateCol, startDateCol + dates.length);
    const hasNumbers = quantities.some((v) => typeof v === 'number' && !isNaN(v));

    if (currentCustomer && hasNumbers) {
      if (
        currentCustomer.trim().toLowerCase() === 'total' ||
        (row[0] && row[0].toString().trim().toLowerCase().includes('total'))
      ) {
        continue;
      }

      const firstCell = (row[0] || '').toString().trim();
      let lineName;
      if (firstCell && !/\d/.test(firstCell)) {
        if (/bio/i.test(firstCell)) {
          lineName = currentCityOrLocation ? `${currentCityOrLocation} ${firstCell}` : firstCell;
        } else {
          currentCityOrLocation = firstCell;
          lineName = currentCityOrLocation;
        }
      } else {
        lineName = 'Unknown';
      }
      if (lineName.trim().toLowerCase().includes('total')) continue;

      const data = dates.map((date, idx) => ({
        date,
        qty: quantities[idx] || 0,
      }));

      const product = detectProduct(currentCustomer, lineName);

      result.push({
        customer: currentCustomer,
        colorCode: currentColorCode,
        line: lineName,
        location: currentCityOrLocation,
        data,
        product,
      });
    }
  }
  return result;
}

async function main() {
  const { sheetJson, weekName, salesFile, sheet } = await readSalesPlan();
  const dates = extractDatesFromHeader(sheet);
  if (!dates.length) {
    console.error('❌ Не знайдено жодної дати у рядку 3!');
    process.exit(1);
  }

  const parsed = parseSalesByCustomer(sheetJson, dates);

  const weekNumberMatch = weekName.match(/\d+/);
  const weekNumber = weekNumberMatch ? weekNumberMatch[0] : 'unknown';
  const outputDir = path.join(__dirname, 'input', `${weekNumber}_Week`);

  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'sales.json');
  fs.writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf8');

  console.log(`✅ Дані збережено у: ${outputPath}`);
  console.log('📋 Вкладка:', weekName);
  console.log('🔢 Рядків зчитано:', sheetJson.length);
  console.log('📅 Знайдені дати:', dates);
  console.log('🔍 Знайдено клієнтських рядків:', parsed.length);
  console.dir(parsed.slice(0, 5), { depth: null });
}

main();
