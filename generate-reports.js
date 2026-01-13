const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { exec } = require('child_process');

const inputDir = path.join(__dirname, 'input');

// ⏱ Отримання дати з аргументу
const userDateArg = process.argv[2]; // очікується у форматі YYYY-MM-DD
const today = new Date();

let targetDate;
let date;

if (userDateArg && /^\d{4}-\d{2}-\d{2}$/.test(userDateArg)) {
  const [year, month, day] = userDateArg.split('-');
  targetDate = `${day}.${month}`;
  date = userDateArg;
} else {
  const currentDay = String(today.getDate()).padStart(2, '0');
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
  targetDate = `${currentDay}.${currentMonth}`;
  date = today.toISOString().slice(0, 10);
}

// Зчитування файлів
const files = fs.readdirSync(inputDir);
const transportPlanFile = files.find((f) => f.toLowerCase().includes('plan_week'));
const salesPlanFile = files.find((f) => f.toLowerCase().includes('sales plan'));

if (!transportPlanFile || !salesPlanFile) {
  console.error('❌ Файли не знайдено.');
  process.exit(1);
}

const transportPath = path.join(inputDir, transportPlanFile);
const salesPath = path.join(inputDir, salesPlanFile);

if (fs.statSync(transportPath).size === 0) {
  console.error(`❌ Файл ${transportPlanFile} порожній або пошкоджений.`);
  process.exit(1);
}
if (fs.statSync(salesPath).size === 0) {
  console.error(`❌ Файл ${salesPlanFile} порожній або пошкоджений.`);
  process.exit(1);
}

const transportWorkbook = xlsx.readFile(transportPath);
const salesWorkbook = xlsx.readFile(salesPath);

// Пошук аркуша за датою
function normalizeDateString(str) {
  return str.replace(/\D/g, '').padStart(4, '0');
}

function findSheetByDate(sheetNames, ddmm) {
  const normalizedTarget = normalizeDateString(ddmm);
  return sheetNames.find((name) => normalizeDateString(name).includes(normalizedTarget));
}

const matchedSheetName = findSheetByDate(transportWorkbook.SheetNames, targetDate);
if (!matchedSheetName) {
  console.error(`❌ Не знайдено аркуша з назвою ${targetDate}`);
  process.exit(1);
}

const transportSheet = transportWorkbook.Sheets[matchedSheetName];
const salesSheet = salesWorkbook.Sheets[salesWorkbook.SheetNames[0]];

const shipDate = date;

const transportData = xlsx.utils.sheet_to_json(transportSheet, { defval: '', range: 0 });
const salesData = xlsx.utils.sheet_to_json(salesSheet, { defval: '' });

function normalizeRow(row) {
  const normalized = {};
  for (const key in row) {
    normalized[key.toLowerCase().trim()] = row[key];
  }
  return normalized;
}


function getBoxesPerPallet(clientName, product = '') {
  const name = clientName.toLowerCase();
  const prod = product.toLowerCase();

  let boxesPerPallet = 48;

  if (name.includes('aldi lukovica') && prod.includes('tomato')) {
    boxesPerPallet = 56;
  } else if (name.includes('aldi lukovica') && prod.includes('banana')) {
    const match = name.match(/#(\d+)/);
    if (match) {
      const size = parseInt(match[1]);
      if (!isNaN(size)) {
        boxesPerPallet = size;
      }
    }
  } else if (
    name.includes('penny') ||
    name.includes('billa') ||
    name.includes('ullo') ||
    name.includes('bicske') ||
    name.includes('kaufland') ||
    name.includes('biedronka') ||
    name.includes('jmf') ||
    (name.includes('yff') && name.includes('turda'))
  ) {
    boxesPerPallet = 32;
  } else if (
    name.includes('metro') ||
    name.includes('terno') ||
    (name.includes('aldi') && name.includes('biatorbagy'))
  ) {
    boxesPerPallet = 28;
  } else if (prod.includes('ananas')) {
    boxesPerPallet = 40;
  } else if (prod.includes('tomatoes')) {
    boxesPerPallet = 72;
  } else if (name.includes('horti')) {
    boxesPerPallet = 54;
  }

  return boxesPerPallet;
}



function getPalletType(clientName, product = '') {
  const name = clientName.toLowerCase();
  const prod = product.toLowerCase();

  if (name.includes('aldi lukovica') && prod.includes('banana')) {
    if (name.match(/#\d+/)) {
      return 'PHP mini';
    }
  }
  if (name.includes('aldi lukovica') && prod.includes('tomato')) {
    return 'PHP mini';
  }

  if (
    name.includes('penny') ||
    name.includes('billa') ||
    name.includes('spar') ||
    name.includes('metro') ||
    name.includes('biedronka') ||
    name.includes('jmf') ||
    (name.includes('yff') && name.includes('turda')) ||
    (name.includes('aldi') && name.includes('biatorbagy'))
  ) {
    return 'EURO PALLETS';
  }

  return 'IND. PALLETS';
}

function convertExcelTime(excelTime) {
  if (isNaN(excelTime)) return '';
  const totalMinutes = Math.round(excelTime * 24 * 60);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

transportData.sort((a, b) => {
  const rA = normalizeRow(a);
  const rB = normalizeRow(b);
  return (rA['loading time'] || 0) - (rB['loading time'] || 0);
});

const result = [];
const aldiRows = [];

transportData.forEach((row) => {
  const r = normalizeRow(row);
  const client = r['customer'] || '';
  const product = (r['product'] || '').toString();
  const qty = Number(r['qty']) || 0;

  if (!client) return;

  const boxesPerPallet = getBoxesPerPallet(client, product);
  const pal = boxesPerPallet ? Math.ceil(qty / boxesPerPallet) : 0;
  const palletType = getPalletType(client, product);

  const truck = `${r['truck plate nr'] || ''} ${r['trailer plate nr'] || ''}`.trim();
  const driver = r['driver'] || '';
  const loading = convertExcelTime(Number(r['loading time']));
  const start = convertExcelTime(Number(r['timewindow start']));

  if (client.toLowerCase().includes('aldi') && client.toLowerCase().includes('lukovica')) {
    aldiRows.push({ qty, pal, driver, loading, start, truck });
  } else {
    result.push({
      'Data wysyłki': shipDate,
      'Odbiorca': client,
      'Ilość razem': qty,
      'Kierowca': truck,
      'Pal': pal,
      'Box per pallet': boxesPerPallet,
      'Pallet type': palletType,
      'Driver': driver,
      'Godzina': loading,
      'Timewindow start': start,
    });
  }
});

if (aldiRows.length > 0) {
  const groupedByTruck = {};

  aldiRows.forEach((row) => {
    const key = row.truck || 'unknown';
    if (!groupedByTruck[key]) groupedByTruck[key] = [];
    groupedByTruck[key].push(row);
  });

  for (const [truck, rows] of Object.entries(groupedByTruck)) {
    const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
    const totalPal = Math.ceil(rows.reduce((sum, r) => sum + r.pal, 0));

    const boxesPerPallet = getBoxesPerPallet('Aldi Lukovica', 'banana');
    const palletType = getPalletType('Aldi Lukovica', 'banana');

    const lastRow = [...rows].reverse().find((r) => r.driver || r.loading || r.start);

    result.push({
      'Data wysyłki': shipDate,
      'Odbiorca': 'Aldi Lukovica',
      'Ilość razem': totalQty,
      'Kierowca': truck,
      'Pal': totalPal,
      'Box per pallet': boxesPerPallet,
      'Pallet type': palletType,
      'Driver': lastRow?.driver || '',
      'Godzina': lastRow?.loading || '',
      'Timewindow start': lastRow?.start || '',
    });
  }
}

const outputPath = path.join(__dirname, 'output', date);
if (!fs.existsSync(outputPath)) fs.mkdirSync(outputPath, { recursive: true });

fs.writeFileSync(path.join(outputPath, 'data.json'), JSON.stringify(result, null, 2), 'utf-8');
console.log(`✅ Збережено у: ${path.join(outputPath, 'data.json')}`);

// Відкрити папку
exec(`start "" "${outputPath}"`);
