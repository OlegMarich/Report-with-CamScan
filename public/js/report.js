const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const generateBtn = document.getElementById('generateBtn');
const dateInput = document.getElementById('reportDate');

const modal = document.getElementById('modalMessage');
const modalText = document.getElementById('modalMessageText');
const modalOkBtn = document.getElementById('modalOkBtn');

let selectedFiles = [];
let generatedDate = null;  // Для збереження дати після генерації

// Вибір файлів
selectBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  selectedFiles = Array.from(event.target.files);
  if (selectedFiles.length > 0) {
    generateBtn.style.display = 'inline-block';
    dropZone.innerHTML = `Selected: <strong>${selectedFiles
      .map((f) => f.name)
      .join(', ')}</strong>`;
  }
});

// Генерація звіту
generateBtn.addEventListener('click', async () => {
  const date = dateInput.value;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return showModalMessage('⚠️ Please select a valid date (YYYY-MM-DD).');
  }

  if (selectedFiles.length === 0) {
    return showModalMessage('⚠️ Please select both Excel files.');
  }

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append('files', file));

  try {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    // Ось важливо: правильний маршрут /upload
    const response = await fetch(`/upload?date=${date}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      generatedDate = result.date;
      const msg = `✅ Report for <strong>${result.date}</strong> generated.<br>You can find it in the <code>/output/${result.date}</code> folder.`;
      showModalMessage(msg);
    } else {
      showModalMessage('❌ Failed to generate report.');
    }
  } catch (err) {
    console.error(err);
    showModalMessage('❌ Something went wrong during generation.');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Report';
  }
});

// Показ повідомлення
function showModalMessage(message) {
  modalText.innerHTML = message;
  modal.style.display = 'flex';
}

// Закриття модалки і відкриття папки в новій вкладці

modalOkBtn.addEventListener('click', () => {
  modal.style.display = 'none';
  if (generatedDate) {
    window.open(`/output/${generatedDate}`, '_blank'); // Відкриває папку у браузері (HTTP)
  }
});

