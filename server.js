require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');
const { nanoid } = require('nanoid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_PATH = path.join(__dirname, 'db.json');
const QR_DIR = path.join(__dirname, 'public', 'qr');
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });
app.use('/qr', express.static(QR_DIR));

// ---------- Banco de dados simples em arquivo ----------
// Para poucas centenas de convidados por evento isso é suficiente.
// Se o volume crescer bastante, trocar por Postgres/SQLite é o próximo passo.
function readDB() {
  if (!fs.existsSync(DB_PATH)) return { guests: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function formatPhone(raw) {
  let digits = String(raw).replace(/\D/g, '');
  if (!digits.startsWith('55')) digits = '55' + digits;
  return digits;
}

// ---------- Envio via Z-API (ou provedor não-oficial equivalente) ----------
async function sendWhatsAppQR(guest) {
  const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, BASE_URL } = process.env;

  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN) {
    console.warn('[Z-API] Credenciais não configuradas no .env — envio pulado (modo teste).');
    return { skipped: true, motivo: 'Z-API não configurada' };
  }

  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-image`;
  const imageUrl = `${BASE_URL}/qr/${guest.id}.png`;
  const inviteUrl = `${BASE_URL}/convite/${guest.id}`;
  const caption =
    `Olá, ${guest.nome}! 🎉\n\n` +
    `Este é o seu convite. Apresente este QR code na portaria do evento.\n\n` +
    `Para cadastrar quem vai com você, acesse:\n${inviteUrl}`;

  const { data } = await axios.post(
    url,
    { phone: formatPhone(guest.telefone), image: imageUrl, caption },
    { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN || '' } }
  );
  return data;
}

// ---------- API: criar convidado (gera QR + envia WhatsApp) ----------
app.post('/api/convidados', async (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome || !telefone) {
    return res.status(400).json({ erro: 'nome e telefone são obrigatórios' });
  }

  const db = readDB();
  const id = 'LM-' + nanoid(6).toUpperCase();
  const guest = {
    id,
    nome,
    telefone,
    acompanhantes: [],
    presente: false,
    horaEntrada: null,
    criadoEm: new Date().toISOString()
  };

  await QRCode.toFile(path.join(QR_DIR, `${id}.png`), id, { width: 400, margin: 2 });

  db.guests.push(guest);
  writeDB(db);

  let whatsapp = { skipped: true };
  try {
    whatsapp = await sendWhatsAppQR(guest);
  } catch (err) {
    console.error('[Z-API] Erro ao enviar:', err.response ? err.response.data : err.message);
    whatsapp = { erro: true, detalhe: err.message };
  }

  res.json({ guest, whatsapp });
});

// ---------- API: listar convidados (para o painel) ----------
app.get('/api/convidados', (req, res) => {
  const db = readDB();
  const total = db.guests.length;
  const presentes = db.guests.filter(g => g.presente).length;
  res.json({ guests: db.guests, total, presentes, ausentes: total - presentes });
});

// ---------- Página do convidado: cadastrar acompanhantes ----------
app.get('/convite/:id', (req, res) => {
  const db = readDB();
  const guest = db.guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).send('<h1>Convite não encontrado.</h1>');
  res.send(renderConvitePage(guest));
});

app.post('/api/convidados/:id/acompanhantes', (req, res) => {
  const db = readDB();
  const guest = db.guests.find(g => g.id === req.params.id);
  if (!guest) return res.status(404).json({ erro: 'convidado não encontrado' });
  const nomes = (req.body.acompanhantes || []).map(n => String(n).trim()).filter(Boolean);
  guest.acompanhantes = nomes;
  writeDB(db);
  res.json({ ok: true, guest });
});

// ---------- Check-in na portaria (usado pelo app do segurança) ----------
app.post('/api/portaria/checkin', (req, res) => {
  const db = readDB();
  const busca = String(req.body.id || '').toLowerCase();
  const guest = db.guests.find(g => g.id.toLowerCase() === busca || g.nome.toLowerCase() === busca);
  if (!guest) return res.status(404).json({ erro: 'não encontrado' });
  if (guest.presente) return res.json({ jaEntrou: true, guest });
  guest.presente = true;
  guest.horaEntrada = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true, guest });
});

function renderConvitePage(guest) {
  const compsHtml = (guest.acompanhantes.length ? guest.acompanhantes : ['']).map(v =>
    `<div class="row"><input type="text" value="${escapeHtml(v)}" placeholder="Nome do acompanhante" /><button type="button" class="rm">×</button></div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>LeMoment — ${escapeHtml(guest.nome)}</title>
<style>
  body { background:#0e0f13; color:#f2efe9; font-family: Inter, sans-serif; margin:0; padding:24px; }
  .card { background:#17181f; border:1px solid #2b2d38; border-radius:16px; padding:22px; max-width:420px; margin:0 auto 16px; }
  h1 { font-size:20px; margin:0 0 6px; }
  p.muted { color:#8b8d98; font-size:13px; }
  .row { display:flex; gap:8px; margin-bottom:8px; }
  input { flex:1; background:#1e2029; border:1px solid #2b2d38; color:#f2efe9; padding:10px 12px; border-radius:8px; font-size:14px; }
  button { border-radius:8px; padding:10px 16px; font-weight:600; cursor:pointer; border:1px solid #2b2d38; }
  .rm { background:transparent; color:#8b8d98; width:38px; }
  .add { background:transparent; color:#f2efe9; width:100%; margin-bottom:14px; }
  .save { background:#c9a44c; color:#17181f; border:none; width:100%; }
  #msg { font-size:13px; color:#6fbf8b; margin-top:10px; }
</style>
</head>
<body>
  <div class="card">
    <h1>Olá, ${escapeHtml(guest.nome)} 👋</h1>
    <p class="muted">Código do convite: ${guest.id}</p>
    <p class="muted">Adicione quem vai com você. Isso fica salvo na sua credencial e o segurança já vê na portaria.</p>
  </div>
  <div class="card">
    <div id="editor">${compsHtml}</div>
    <button type="button" class="add" id="add">+ adicionar acompanhante</button>
    <button type="button" class="save" id="save">Salvar acompanhantes</button>
    <div id="msg"></div>
  </div>

<script>
  const editor = document.getElementById('editor');
  function bindRemove() {
    editor.querySelectorAll('.rm').forEach(btn => {
      btn.onclick = () => { btn.parentElement.remove(); };
    });
  }
  bindRemove();
  document.getElementById('add').onclick = () => {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = '<input type="text" placeholder="Nome do acompanhante" /><button type="button" class="rm">×</button>';
    editor.appendChild(div);
    bindRemove();
  };
  document.getElementById('save').onclick = async () => {
    const nomes = Array.from(editor.querySelectorAll('input')).map(i => i.value);
    const res = await fetch('/api/convidados/${guest.id}/acompanhantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acompanhantes: nomes })
    });
    if (res.ok) {
      document.getElementById('msg').textContent = 'Salvo! Já pode fechar esta página.';
    } else {
      document.getElementById('msg').textContent = 'Erro ao salvar, tente novamente.';
      document.getElementById('msg').style.color = '#c9605b';
    }
  };
</script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LeMoment backend rodando na porta ${PORT}`));
