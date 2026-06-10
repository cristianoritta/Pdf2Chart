const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const processing = document.getElementById('processing');
const processingStep = document.getElementById('processing-step');
const results = document.getElementById('results');
const errorOverlay = document.getElementById('error');
const errorMessage = document.getElementById('error-message');
const settingsModal = document.getElementById('settings-modal');
const helpModal = document.getElementById('help-modal');
const settingsForm = document.getElementById('settings-form');
const settingsBtn = document.getElementById('btn-settings');
const helpBtn = document.getElementById('btn-help');
const settingsStatus = document.getElementById('settings-status');
const groqApiKeyInput = document.getElementById('groq-api-key');
const groqModelInput = document.getElementById('groq-model');

let lastAnalysisData = null;
let lastFilename = '';

const ENTITY_TYPE_LABELS = {
  Person: 'Pessoa',
  Organization: 'Organização',
  Location: 'Local',
  Vehicle: 'Veículo',
  Phone: 'Telefone',
  Email: 'E-mail',
  Document: 'Documento',
  Account: 'Conta',
  Event: 'Evento',
  Anon: 'Outro',
};

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function resetUI() {
  hide(processing);
  hide(results);
  hide(errorOverlay);
  show(dropzone);
  fileInput.value = '';
}

function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

async function processFile(file) {
  if (!file || file.type !== 'application/pdf') {
    showError('Selecione um arquivo PDF válido.');
    return;
  }

  hide(dropzone);
  hide(errorOverlay);
  show(processing);
  processingStep.textContent = 'Extraindo texto do documento';

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    processingStep.textContent = 'Analisando entidades e vínculos com IA...';

    const response = await fetch('/analyze', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro desconhecido');
    }

    showResults(data, file.name);
  } catch (err) {
    showError(err.message);
  } finally {
    hide(processing);
  }
}

function showError(message) {
  hide(dropzone);
  hide(processing);
  hide(results);
  errorMessage.textContent = message;
  show(errorOverlay);
}

function showResults(data, filename) {
  hide(dropzone);
  hide(errorOverlay);
  show(results);

  lastAnalysisData = data;
  lastFilename = filename;

  document.getElementById('filename').textContent = filename;
  document.getElementById('stat-entities').textContent = data.stats.entities;
  document.getElementById('stat-relationships').textContent = data.stats.relationships;
  document.getElementById('stat-chars').textContent = formatNumber(data.stats.characters);

  const downloadBtn = document.getElementById('btn-download');
  downloadBtn.href = data.download_url;
  downloadBtn.download = data.anx_filename;

  const entitiesList = document.getElementById('entities-list');
  entitiesList.innerHTML = data.entities.map(e => `
    <div class="entity-item">
      <div class="entity-header">
        <span class="entity-badge">${ENTITY_TYPE_LABELS[e.entity_type] || e.entity_type}</span>
        <span class="entity-id">#${e.id}</span>
      </div>
      <div class="entity-name">${escapeHtml(e.name || e.description || e.id)}</div>
      ${e.description && e.name ? `<div class="entity-desc">${escapeHtml(e.description)}</div>` : ''}
    </div>
  `).join('') || '<p class="entity-desc">Nenhuma entidade encontrada.</p>';

  const entityMap = Object.fromEntries(data.entities.map(e => [e.id, e.name || e.id]));

  const relList = document.getElementById('relationships-list');
  relList.innerHTML = data.relationships.map(r => `
    <div class="rel-item">
      <div class="rel-label">${escapeHtml(r.label)}</div>
      <div class="rel-nodes">${escapeHtml(entityMap[r.source] || r.source)} → ${escapeHtml(entityMap[r.target] || r.target)}</div>
      ${r.description ? `<div class="rel-desc">${escapeHtml(r.description)}</div>` : ''}
    </div>
  `).join('') || '<p class="entity-desc">Nenhum vínculo encontrado.</p>';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadCredentials() {
  try {
    const response = await fetch('/api/credentials');
    const data = await response.json();
    groqApiKeyInput.value = data.groq_api_key || '';
    groqModelInput.value = data.groq_model || 'llama-3.3-70b-versatile';
    settingsBtn.classList.toggle('configured', data.configured);
  } catch {
    groqModelInput.value = 'llama-3.3-70b-versatile';
  }
}

function openSettings(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  hide(settingsStatus);
  loadCredentials();
  show(settingsModal);
  groqApiKeyInput.focus();
}

function closeSettings() {
  hide(settingsModal);
  hide(settingsStatus);
}

function openHelp(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  show(helpModal);
}

function closeHelp() {
  hide(helpModal);
}

function showSettingsStatus(message, type) {
  settingsStatus.textContent = message;
  settingsStatus.className = `settings-status ${type}`;
  show(settingsStatus);
}

async function saveSettings(e) {
  e.preventDefault();

  const payload = {
    groq_api_key: groqApiKeyInput.value.trim(),
    groq_model: groqModelInput.value.trim(),
  };

  try {
    const response = await fetch('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao salvar');
    }

    settingsBtn.classList.add('configured');
    showSettingsStatus('Configurações salvas em credenciais.json', 'success');
    setTimeout(closeSettings, 900);
  } catch (err) {
    showSettingsStatus(err.message, 'error');
  }
}

dropzone.addEventListener('click', (e) => {
  if (e.target.closest('.corner-actions')) return;
  fileInput.click();
});

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) processFile(fileInput.files[0]);
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

document.getElementById('btn-new').addEventListener('click', resetUI);
document.getElementById('btn-retry').addEventListener('click', resetUI);

document.getElementById('btn-view-graph').addEventListener('click', () => {
  if (!lastAnalysisData) return;
  document.getElementById('graph-filename').textContent = lastFilename;
  window.PdfGraphCanvas.open(lastAnalysisData, lastFilename);
});


settingsBtn.addEventListener('click', openSettings);
helpBtn.addEventListener('click', openHelp);
settingsForm.addEventListener('submit', saveSettings);
document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
document.getElementById('btn-close-help').addEventListener('click', closeHelp);
document.querySelectorAll('[data-close-settings]').forEach(el => {
  el.addEventListener('click', closeSettings);
});
document.querySelectorAll('[data-close-help]').forEach(el => {
  el.addEventListener('click', closeHelp);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!helpModal.classList.contains('hidden')) closeHelp();
    else if (!settingsModal.classList.contains('hidden')) closeSettings();
  }
});

loadCredentials();

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (results.classList.contains('hidden') && errorOverlay.classList.contains('hidden')) {
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }
});
