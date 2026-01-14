const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const selectBtn = document.getElementById('selectBtn');
const generateBtn = document.getElementById('generateBtn');

// 📦 Модалка результату
const modal = document.getElementById('modalMessage');
const modalText = document.getElementById('modalMessageText');
const modalOkBtn = document.getElementById('modalOkBtn');

// 📅 Модалка вибору тижня
const modalWeekPrompt = document.getElementById('modalWeekPrompt');
const weekInput = document.getElementById('weekInput');
const confirmWeekBtn = document.getElementById('confirmWeekBtn');
const cancelWeekBtn = document.getElementById('cancelWeekBtn');

let selectedFiles = [];
let generatedWeek = null;

// 📁 Вибір файлів (залишаємо для уніфікації)
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

// ▶️ Клік по кнопці "Generate" → показати модалку тижня
generateBtn.addEventListener('click', () => {
  weekInput.value = '';
  modalWeekPrompt.style.display = 'flex';
});

// ❌ Закрити модалку вводу тижня
cancelWeekBtn.addEventListener('click', () => {
  modalWeekPrompt.style.display = 'none';
});

// ✅ Підтвердити тиждень та надіслати запит
confirmWeekBtn.addEventListener('click', async () => {
  const week = weekInput.value.trim();
  if (!week || isNaN(week) || Number(week) < 1 || Number(week) > 53) {
    return alert('⚠️ Please enter a valid week number (1–53).');
  }

  modalWeekPrompt.style.display = 'none';

  try {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    const response = await fetch(`/api/generate-plan?week=${week}`);
    const text = await response.text();

    let result;
    try {
      result = JSON.parse(text);
    } catch (err) {
      console.error('❌ Not a JSON:', text);
      showModalMessage('❌ Server did not return valid JSON. Check server logs.');
      return;
    }

    if (result.message?.includes('✅')) {
      generatedWeek = week;
      const msg = `✅ Plan for <strong>week ${week}</strong> generated.<br>Find it in <code>/output/${week}_Week</code>`;
      showModalMessage(msg);
    } else {
      showModalMessage(result.message || '❌ Failed to generate plan.');
    }
  } catch (err) {
    console.error(err);
    showModalMessage('❌ Something went wrong during generation.');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Report';
  }
});

// 🪧 Показ повідомлення
function showModalMessage(message) {
  modalText.innerHTML = message;
  modal.style.display = 'flex';
}

// ✅ Закриття модалки результату → відкриття output-папки
modalOkBtn.addEventListener('click', () => {
  modal.style.display = 'none';
  if (generatedWeek) {
    window.open(`/output/${generatedWeek}_Week`, '_blank');
  }
});
