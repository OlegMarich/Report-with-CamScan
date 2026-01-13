const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// 🔠 Нормалізація назв
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bbananas?\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/gi, '')
    .trim();
}

function capitalizeWords(str) {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDayNameEng(date) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

function findClosestGlossaryKey(searchKey, glossaryKeysArray) {
  if (glossaryKeysArray.includes(searchKey)) return searchKey;
  for (const key of glossaryKeysArray) {
    if (key.includes(searchKey)) return key;
  }
  for (const key of glossaryKeysArray) {
    if (searchKey.includes(key)) return key;
  }
  const firstWord = searchKey.split(' ')[0];
  for (const key of glossaryKeysArray) {
    if (key.startsWith(firstWord)) return key;
  }
  return null;
}

function detectProductFromText(text) {
  const name = text.toLowerCase();
  if (name.includes('bio')) return 'BIO banana';
  if (name.includes('tomat')) return 'tomatoes';
  if (name.includes('ananas') || name.includes('pineapple')) return 'ananas';
  return 'banana';
}

// 🔧 Форматування імені для Excel
function formatCustomerExcelName(customer, location, product) {
  let parts = [customer, location];
  if (product.toLowerCase().includes('bio')) {
    parts.push('BIO ' + product.replace(/BIO\s*/i, '').trim());
  } else {
    parts.push(product);
  }
  return parts.filter(Boolean).map(capitalizeWords).join(' ').replace(/\s+/g, ' ').trim();
}

(async () => {
  const week = process.argv[2];
  if (!week) {
    console.error('❌ Не передано номер тижня');
    process.exit(1);
  }

  const folderName = `${week}_Week`;
  const outputFolder = path.join(__dirname, 'input', folderName);
  const jsonPath = path.join(outputFolder, 'sales.json');
  const templatePath = path.join(__dirname, 'week-plan.xlsx');
  const outputPath = path.join(outputFolder, `PLAN_week_${week}.xlsx`);

  if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });
  if (!fs.existsSync(jsonPath) || !fs.existsSync(templatePath)) {
    console.error('❌ Не знайдено файл sales.json або шаблон Excel');
    process.exit(1);
  }

  const salesData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const glossarySheet = workbook.getWorksheet('glossary');
  if (!glossarySheet) {
    console.error('❌ Не знайдено аркуш "glossary" у шаблоні');
    process.exit(1);
  }

  const glossaryMap = new Map();
  const customerNameMap = new Map();

  const headerRow = glossarySheet.getRow(1);
  const colIndexes = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = cell.text.toLowerCase().trim();
    if (header.includes('customer')) colIndexes.customer = colNumber;
    else if (header.includes('line') || header.includes('unloading')) colIndexes.line = colNumber;
    else if (header.includes('product')) colIndexes.product = colNumber;
    else if (header.includes('weight/box')) colIndexes.weightPerBox = colNumber;
    else if (header.includes('box') && header.includes('pal')) colIndexes.boxPerPal = colNumber;
  });

  glossarySheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const customerRaw = row.getCell(colIndexes.customer).text || '';
    const lineRaw = colIndexes.line ? row.getCell(colIndexes.line).text || '' : '';
    const product = colIndexes.product ? row.getCell(colIndexes.product).text || 'banana' : 'banana';

    let weightPerBox = 19.79;
    const weightCell = row.getCell(colIndexes.weightPerBox).value;
    if (typeof weightCell === 'number') weightPerBox = weightCell;
    else if (!isNaN(parseFloat(weightCell))) weightPerBox = parseFloat(weightCell);

    const boxPerPal = colIndexes.boxPerPal ? parseInt(row.getCell(colIndexes.boxPerPal).value) || 32 : 32;

    const key = normalizeName(`${customerRaw} ${lineRaw} ${product}`);
    glossaryMap.set(key, { product, weightPerBox, boxPerPal });
    customerNameMap.set(key, `${customerRaw} ${lineRaw} ${product}`.trim());
  });

  const glossaryKeysArray = Array.from(glossaryMap.keys());

  const daySheetsMap = {};
  workbook.worksheets.forEach((sheet) => {
    const cleanName = sheet.name.trim().toLowerCase();
    if (['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].includes(cleanName)) {
      daySheetsMap[cleanName] = sheet;
    }
  });

  const usedSheetNames = new Set();

  for (const client of salesData) {
    if (normalizeName(client.customer) === 'total') continue;

    for (const day of client.data) {
      const { date, qty } = day;
      if (!qty || qty === 0) continue;

      const jsDate = new Date(date);
      const dayNameEng = getDayNameEng(jsDate);
      const dateFormatted = jsDate.toISOString().slice(0, 10);
      const newSheetName = `${capitalizeWords(dayNameEng)} ${dateFormatted}`;

      if (!(dayNameEng in daySheetsMap)) {
        console.warn(`⚠️ Лист шаблону для дня "${capitalizeWords(dayNameEng)}" відсутній, пропускаю`);
        continue;
      }

      const sheet = daySheetsMap[dayNameEng];
      if (!usedSheetNames.has(newSheetName)) {
        sheet.name = newSheetName;
        usedSheetNames.add(newSheetName);
        if (sheet.actualRowCount > 1) {
          sheet.spliceRows(2, sheet.actualRowCount - 1);
        }
      }

      // --- Формуємо ключ для Excel ---
      const location = client.location || '';
      const product = client.product || detectProductFromText(`${client.customer} ${client.line || ''}`);
      const fullCustomer = formatCustomerExcelName(client.customer, location, product);

      const rawKey = normalizeName(`${client.customer} ${location} ${product}`);
      const closestKey = findClosestGlossaryKey(rawKey, glossaryKeysArray);
      const glossaryData = closestKey ? glossaryMap.get(closestKey) : null;

      const weightPerBox = glossaryData?.weightPerBox ?? 19.79;
      const safeBoxPerPal = glossaryData?.boxPerPal ?? 48;

      const grossWeight = qty * weightPerBox;
      const pal = Math.ceil(qty / safeBoxPerPal);

      const rowIndex = sheet.actualRowCount + 1;
      const row = sheet.getRow(rowIndex);

      row.getCell(1).value = 'OUTBOUND';
      row.getCell(2).value = fullCustomer;
      row.getCell(3).value = '';
      row.getCell(4).value = '';
      row.getCell(5).value = '';
      row.getCell(6).value = '';
      row.getCell(7).value = '';
      row.getCell(8).value = 'Nagytarcsa';
      row.getCell(9).value = '';
      row.getCell(10).value = '';
      row.getCell(11).value = product;
      row.getCell(12).value = qty;
      row.getCell(13).value = pal;
      row.getCell(14).value = '';
      row.getCell(15).value = '';
      row.getCell(16).value = grossWeight;
      row.getCell(17).value = '';
      row.getCell(18).value = '';
      row.getCell(19).value = '';
      row.getCell(20).value = '';
      row.getCell(21).value = '';

      for (let col = 1; col <= 21; col++) {
        row.getCell(col).border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      }

      row.commit();
      console.log(`✅ Додано рядок для "${fullCustomer}" у лист "${sheet.name}"`);
    }
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ План збережено у файл: ${outputPath}`);
  console.log(`@@@DONE:${week}`);
})();
