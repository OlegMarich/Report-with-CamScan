const logBox = document.getElementById('log');
const scanInput = document.getElementById('scanInput');
const qtyInput = document.getElementById('qtyInput');
const clientSelect = document.getElementById('clientSelect');
const scanDate = document.getElementById('scanDate');

/* ----------------- BEEP (Web Audio API) ----------------- */
function beep(freq = 1000, duration = 0.1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.1;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.warn('Audio error:', err);
  }
}

/* ----------------- QR CODE ----------------- */
async function generateQR() {
  const res = await fetch('/api/server-info');
  const info = await res.json();

  const url = `http://${info.ip}:${info.port}/components/scanner.html`;

  document.getElementById('qrBox').innerHTML = '';

  new QRCode(document.getElementById('qrBox'), {
    text: url,
    width: 180,
    height: 180,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });
}

document.getElementById('refreshQR').onclick = generateQR;
generateQR();

/* ----------------- LOG ----------------- */
function log(msg) {
  logBox.innerHTML += msg + '<br>';
  logBox.scrollTop = logBox.scrollHeight;
}

/* ----------------- FLASH SUCCESS ----------------- */
function flashSuccess() {
  scanInput.classList.add('flash-success');
  setTimeout(() => scanInput.classList.remove('flash-success'), 400);
}

/* ----------------- AUTOFOCUS ----------------- */
window.addEventListener('load', () => {
  scanInput.focus();
});

/* ----------------- LOAD CLIENTS ----------------- */
document.getElementById('loadOrders').onclick = async () => {
  const date = scanDate.value;
  if (!date) return alert('Виберіть дату');

  const res = await fetch(`/api/orders/${date}`);
  const list = await res.json();

  clientSelect.innerHTML = `<option value="">— виберіть клієнта —</option>`;
  list.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    clientSelect.appendChild(opt);
  });

  log('✔ Завантажено клієнтів: ' + list.length);
};

/* ----------------- SCAN HANDLER ----------------- */
let lastScan = null;

scanInput.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;

  const date = scanDate.value;
  const client = clientSelect.value;
  const container = scanInput.value.trim();
  const qty = Number(qtyInput.value);

  if (!date || !client || !container) {
    log('❌ Заповніть всі поля');
    beep(300);
    return;
  }

  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({date, client, container, qty}),
  });

  const data = await res.json();

  if (data.remaining !== null) {
    log(`${data.message} | Залишилось: ${data.remaining} / ${data.total}`);
  } else {
    log(data.message);
  }

  lastScan = {date, client, container, qty};

  flashSuccess();
  beep(1000);

  scanInput.value = '';
  scanInput.focus();
});

/* ----------------- UNDO ----------------- */
document.getElementById('undoBtn').onclick = async () => {
  if (!lastScan) {
    log('❌ Немає що відміняти');
    beep(300);
    return;
  }

  const {date, client, container, qty} = lastScan;

  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      date,
      client,
      container,
      qty: -qty,
    }),
  });

  const data = await res.json();
  log(`↩️ Відмінено: ${qty} | Залишилось: ${data.remaining} / ${data.total}`);

  beep(600);
  lastScan = null;
};
/* ----------------- CAMERA OCR (instant) ----------------- */
const cameraBtn = document.getElementById('cameraScanBtn');
const cameraPreview = document.getElementById('cameraPreview');

let cameraStream = null;
let scanning = false;

cameraBtn.onclick = async () => {
  if (scanning) return;

  scanning = true;
  log('📷 Камера увімкнена. Наведи на номер контейнера...');

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
    cameraPreview.srcObject = cameraStream;
    cameraPreview.style.display = 'block';

    startInstantOCR();
  } catch (err) {
    scanning = false;
    log('❌ Не вдалося відкрити камеру');
    console.error(err);
  }
};

async function startInstantOCR() {
  const track = cameraStream.getVideoTracks()[0];
  const imageCapture = new ImageCapture(track);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const loop = async () => {
    if (!scanning) return;

    try {
      const bitmap = await imageCapture.grabFrame();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      ctx.drawImage(bitmap, 0, 0);

      const result = await Tesseract.recognize(canvas, 'eng', {
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      });

      let text = result.data.text.replace(/\s+/g, '').trim();

      // Контейнерний номер має формат XXXX1234567 (4 букви + 7 цифр)
      if (/^[A-Z]{4}\d{7}$/.test(text)) {
        log('📄 Розпізнано: ' + text);

        scanInput.value = text;

        // Автоматичний Enter
        const enterEvent = new KeyboardEvent('keydown', {key: 'Enter'});
        scanInput.dispatchEvent(enterEvent);

        stopCamera();
        return;
      }
    } catch (err) {
      console.warn('OCR error:', err);
    }

    // Наступний кадр через 150 мс
    setTimeout(loop, 150);
  };

  loop();
}

function stopCamera() {
  scanning = false;
  cameraPreview.style.display = 'none';

  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }

  log('📵 Камеру вимкнено');
}

/* ----------------- FINISH CLIENT ----------------- */
document.getElementById('finishBtn').onclick = async () => {
  const client = clientSelect.value;
  if (!client) return alert('Виберіть клієнта');

  const res = await fetch('/api/finish', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({client}),
  });

  const data = await res.json();
  log('✔ Завершено: ' + client);
  beep(600);
};
