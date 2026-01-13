const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// ✅ Отримання дати з аргументу
const selectedDate = process.argv[2];
if (!selectedDate) {
  console.error('❌ Не передано дату як аргумент');
  process.exit(1);
}

// 🔄 Формат дати для клітинки (DD.MM)
const [year, month, day] = selectedDate.split('-');
const formattedDate = `${year}.${month}.${day}`;

const jsonPath = path.join(__dirname, 'output', selectedDate, 'data.json');
if (!fs.existsSync(jsonPath)) {
  console.error(`❌ Не знайдено файл data.json для дати ${selectedDate}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
const outputDir = path.join(__dirname, 'output', selectedDate);

// 📄 Шлях до шаблону
const templatePath = path.join(__dirname, 'clean-template.xlsx');
const outputPath = path.join(outputDir, `clean-template_${selectedDate}.xlsx`);

// 🔁 Конвертація часу
function convertExcelTime(timeFloat) {
  if (typeof timeFloat !== 'number') return '';
  const totalMinutes = Math.round(timeFloat * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// 🧠 Сортування за годиною
data.sort((a, b) => {
  const tA = a['Godzina'] || '';
  const tB = b['Godzina'] || '';
  return tA.localeCompare(tB);
});

(async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // 🔍 Вибір аркуша за назвою
  const sheet = workbook.getWorksheet('sample');
  if (!sheet) {
    console.error('❌ Не знайдено аркуша з назвою "sample"');
    process.exit(1);
  }

  let currentRow = 4;

  const borderStyle = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };

  for (const entry of data) {
    const truck = entry['Kierowca'] || '';
    // const driver = entry['Driver'] || '';
    const client = entry['Odbiorca'] || '';
    const trailer = truck.split(' ')[1] || '';
    const truckPlate = truck.split(' ')[0] || '';
    // const loadingTime = entry['Godzina'] || '';
    // const timeWindow = entry['Timewindow start'] || '';
    // const qty = entry['Ilość razem'] || '';

    // ✅ Округлення палет вгору
    let pal = entry['Pal'] || '';
    if (pal !== '') {
      const palFloat = parseFloat(pal);
      if (!isNaN(palFloat)) {
        pal = Math.ceil(palFloat);
      }
    }

    const row = sheet.getRow(currentRow);
    const cells = [
      { col: 'B', value: formattedDate },
      { col: 'C', value: client },
      { col: 'D', value: truckPlate },
      { col: 'E', value: trailer },
      { col: 'F', value: formattedDate },
    ];

    for (const { col, value } of cells) {
      const cell = row.getCell(col);
      if (value !== '') {
        cell.value = value;
        cell.border = borderStyle;
      }
    }

    row.commit();
    currentRow++;
  }

  // 🔲 Обведення клітинок
  const startRow = 2;
  const endRow = currentRow - 1;
  for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
    const row = sheet.getRow(rowNum);
    for (let col = 1; col <= 9; col++) {
      const cell = row.getCell(col);
      if (!cell.border || !cell.border.top) {
        cell.border = borderStyle;
      }
    }
    row.commit();
  }

  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Завершено: файл збережено у ${outputPath}`);
})();
