const {exec} = require('child_process');
const path = require('path');
const fs = require('fs');

// Логування всіх записів у файли (для безпеки)
const originalWriteFileSync = fs.writeFileSync;
fs.writeFileSync = function (file, ...args) {
  console.log('⚠️ WRITE FILE:', file);
  return originalWriteFileSync.call(fs, file, ...args);
};

const originalWriteFile = fs.writeFile;
fs.writeFile = function (file, ...args) {
  console.log('⚠️ WRITE FILE ASYNC:', file);
  return originalWriteFile.call(fs, file, ...args);
};

// Аргументи командного рядка
const dateArg = process.argv[2]; // YYYY-MM-DD
const inputBaseDir = process.argv[3]; // temp/<date>

if (!dateArg) {
  console.error('❌ Не передано дату як аргумент');
  process.exit(1);
}

if (!inputBaseDir) {
  console.error('❌ Не передано шлях до вхідної папки (tempDir)');
  process.exit(1);
}

// Хелпер для запуску підскриптів
function run(script, label) {
  return new Promise((resolve, reject) => {
    console.log(`📌 ${label}...`);
    exec(`node "${script}" ${dateArg} "${inputBaseDir}"`, (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Error during ${label}:`, stderr || err.message);
        return reject(err);
      }
      if (stdout) console.log(stdout.trim());
      resolve();
    });
  });
}

(async () => {
  try {
    const base = __dirname;

    await run(path.join(base, 'generate-reports.js'), 'Generating reports (Plan_week only)');
    await run(path.join(base, 'fill-template-counter.js'), 'Generating Counter by clients');
    await run(path.join(base, 'fill-template-loading.js'), 'Filling loading template');
    await run(path.join(base, 'fill-template-client.js'), 'Filling client templates');
    await run(path.join(base, 'fill-shipping-card.js'), 'Filling shipping card templates');
    await run(path.join(base, 'fill-template-clean.js'), 'Filling clean template');

    console.log('✅ @@@DONE:' + dateArg);
  } catch (err) {
    console.error('❌ PROCESS FAILED');
    process.exit(1);
  }
})();
