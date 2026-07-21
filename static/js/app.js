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
let selectedDetailEntity = null;

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

const ENTITY_TYPE_COLORS = {
  Person: '#3b82f6',
  Organization: '#f59e0b',
  Location: '#a855f7',
  Vehicle: '#38bdf8',
  Phone: '#22c55e',
  Email: '#22c55e',
  Document: '#94a3b8',
  Account: '#38bdf8',
  Event: '#ef4444',
  Anon: '#64748b',
};

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function resetUI() {
  hide(processing);
  hide(results);
  hide(errorOverlay);
  if (window.PdfGraphCanvas) window.PdfGraphCanvas.close?.();
  hide(document.getElementById('graph-view'));
  show(dropzone);

  fileInput.value = '';
  lastAnalysisData = null;
  lastFilename = '';

  document.getElementById('sources-list').innerHTML =
    '<p class="empty-hint">Nenhuma fonte carregada. Arraste um PDF ou clique em + PDF.</p>';
  document.getElementById('entity-types-list').innerHTML =
    '<p class="empty-hint">Os tipos aparecerão após a análise.</p>';
  document.getElementById('stat-entities').textContent = '0';
  document.getElementById('stat-relationships').textContent = '0';
  document.getElementById('stat-chars').textContent = '0';
  document.getElementById('ai-status').textContent = 'Aguardando documento';
  document.getElementById('ai-pct').textContent = '—';
  document.getElementById('ai-progress').style.width = '0%';
  document.getElementById('filename').textContent = 'Nenhum arquivo';
  document.getElementById('project-name').textContent = 'Meu Projeto';
  document.getElementById('status-project').textContent = 'Projeto: —';
  document.getElementById('status-counts').textContent = '0 entidades · 0 vínculos';
  document.getElementById('status-sync').textContent = 'Pronto';

  hide(document.getElementById('btn-download'));
  hide(document.getElementById('btn-new'));
  clearEntityDetail();
}

function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

function clearEntityDetail() {
  show(document.getElementById('detail-empty'));
  hide(document.getElementById('detail-content'));
  selectedDetailEntity = null;
}

function setDetailTab(tabId) {
  document.querySelectorAll('.detail-tab').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.detail-pane').forEach(pane => {
    pane.classList.toggle('hidden', pane.dataset.pane !== tabId);
  });
}

function buildEntityMap() {
  const map = {};
  (lastAnalysisData?.entities || []).forEach(e => {
    map[e.id] = e.name || e.description || e.id;
  });
  const state = window.PdfGraphCanvas?.getState?.();
  (state?.nodes || []).forEach(n => {
    map[n.id] = n.title || map[n.id] || n.id;
  });
  return map;
}

function getLiveRelationships() {
  const graphOpen = document.getElementById('graph-view') &&
    !document.getElementById('graph-view').classList.contains('hidden');
  const state = window.PdfGraphCanvas?.getState?.();
  if (graphOpen && state) {
    return (state.edges || []).map(e => ({
      source: e.s,
      target: e.t,
      label: e.label || 'vínculo',
      description: e.description || '',
    }));
  }
  return lastAnalysisData?.relationships || [];
}

function resolveEntity(id) {
  const state = window.PdfGraphCanvas?.getState?.();
  const node = state?.nodes?.find(n => String(n.id) === String(id));
  const fromData = lastAnalysisData?.entities?.find(e => String(e.id) === String(id));

  if (node) {
    const descProp = (node.props || []).find(p =>
      /descri|info|observa/i.test(String(Array.isArray(p) ? p[0] : (p.k || p.key || '')))
    );
    const descVal = descProp
      ? (Array.isArray(descProp) ? descProp[1] : (descProp.v || descProp.value))
      : (fromData?.description || '');
    return {
      id: node.id,
      name: node.title || fromData?.name || node.id,
      entity_type: node.iconType || fromData?.entity_type || 'Anon',
      description: descVal || fromData?.description || '',
    };
  }

  if (fromData) return fromData;
  return null;
}

function getEntityProps(entityId) {
  const node = window.PdfGraphCanvas?.getNode?.(entityId);
  if (node && Array.isArray(node.props)) {
    return node.props
      .map(p => Array.isArray(p)
        ? { key: String(p[0] ?? ''), value: String(p[1] ?? '') }
        : { key: String(p.k ?? p.key ?? ''), value: String(p.v ?? p.value ?? '') })
      .filter(p => p.key);
  }

  const entity = lastAnalysisData?.entities?.find(e => String(e.id) === String(entityId));
  if (!entity) return [];
  const props = [];
  if (entity.description) props.push({ key: 'Descrição', value: entity.description });
  return props;
}

function hideAttrForm() {
  const form = document.getElementById('attr-form');
  hide(form);
  document.getElementById('attr-key').value = '';
  document.getElementById('attr-value').value = '';
  show(document.getElementById('btn-add-attr'));
}

function showAttrForm() {
  show(document.getElementById('attr-form'));
  hide(document.getElementById('btn-add-attr'));
  document.getElementById('attr-key').focus();
}

function renderDetailAttrs(entityId) {
  const list = document.getElementById('detail-attrs');
  if (!list) return;

  const props = getEntityProps(entityId);
  if (!props.length) {
    list.innerHTML = '<p class="empty-hint">Nenhum atributo. Clique em Adicionar atributo.</p>';
    return;
  }

  list.innerHTML = props.map(p => `
    <div class="detail-attr-item" data-attr-key="${escapeHtml(p.key)}">
      <div class="detail-attr-key">${escapeHtml(p.key)}</div>
      <button type="button" class="detail-attr-remove" title="Remover atributo" aria-label="Remover ${escapeHtml(p.key)}">&times;</button>
      <div class="detail-attr-val">${escapeHtml(p.value)}</div>
    </div>
  `).join('');

  list.querySelectorAll('.detail-attr-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.closest('.detail-attr-item')?.dataset.attrKey;
      if (!key || !selectedDetailEntity) return;
      window.PdfGraphCanvas?.removeNodeProp?.(selectedDetailEntity.id, key);
      renderDetailAttrs(selectedDetailEntity.id);
      document.getElementById('status-sync').textContent = 'Atributo removido · use Salvar no gráfico';
    });
  });
}

function renderDetailLinks(entity, relationships, entityMap) {
  const list = document.getElementById('detail-links');
  if (!list || !entity) return;

  const linked = (relationships || []).filter(r =>
    String(r.source) === String(entity.id) || String(r.target) === String(entity.id)
  );

  if (!linked.length) {
    list.innerHTML = '<p class="empty-hint">Nenhuma entidade conectada a este nó.</p>';
    return;
  }

  list.innerHTML = linked.map(r => {
    const isOut = String(r.source) === String(entity.id);
    const otherId = isOut ? r.target : r.source;
    const other = resolveEntity(otherId);
    const otherName = (other && (other.name || other.description)) || entityMap[otherId] || otherId;
    const typeKey = (other && other.entity_type) || 'Anon';
    const typeLabel = ENTITY_TYPE_LABELS[typeKey] || typeKey;
    const color = ENTITY_TYPE_COLORS[typeKey] || '#64748b';
    const label = r.label || 'vínculo';
    const desc = r.description || '';
    const dir = isOut ? 'Sai' : 'Entra';

    return `
      <button type="button" class="detail-link-item" data-entity-id="${escapeHtml(String(otherId))}">
        <div class="detail-link-top">
          <span class="detail-link-dot" style="background:${color}"></span>
          <span class="detail-link-name" title="${escapeHtml(String(otherName))}">${escapeHtml(String(otherName))}</span>
          <span class="detail-link-dir">${dir}</span>
        </div>
        <div class="detail-link-type">${escapeHtml(typeLabel)}</div>
        <div class="detail-link-label">${escapeHtml(label)}</div>
        ${desc ? `<div class="detail-link-desc">${escapeHtml(desc)}</div>` : '<div class="detail-link-desc">Sem descrição do vínculo.</div>'}
      </button>
    `;
  }).join('');

  list.querySelectorAll('.detail-link-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const ent = resolveEntity(btn.dataset.entityId);
      if (!ent) return;
      showEntityDetail(ent, getLiveRelationships(), buildEntityMap());
      setDetailTab('vinculos');
    });
  });
}

function showEntityDetail(entity, relationships, entityMap) {
  if (!entity) {
    clearEntityDetail();
    return;
  }

  selectedDetailEntity = entity;
  hide(document.getElementById('detail-empty'));
  show(document.getElementById('detail-content'));

  const name = entity.name || entity.description || entity.id;
  const typeLabel = ENTITY_TYPE_LABELS[entity.entity_type] || entity.entity_type;
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
  const rels = relationships || getLiveRelationships();
  const map = entityMap || buildEntityMap();

  document.getElementById('detail-avatar').textContent = initials;
  document.getElementById('detail-avatar').style.background =
    `linear-gradient(135deg, ${ENTITY_TYPE_COLORS[entity.entity_type] || '#3b82f6'}, #1e40af)`;
  const nodeImg = window.PdfGraphCanvas?.getNode?.(entity.id)?.image;
  const avatarEl = document.getElementById('detail-avatar');
  if (nodeImg && String(nodeImg).startsWith('data:image')) {
    avatarEl.textContent = '';
    avatarEl.style.backgroundImage = `url("${nodeImg}")`;
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = initials;
    avatarEl.style.background =
      `linear-gradient(135deg, ${ENTITY_TYPE_COLORS[entity.entity_type] || '#3b82f6'}, #1e40af)`;
  }
  document.getElementById('detail-name').textContent = name;
  document.getElementById('detail-type').textContent = typeLabel;
  document.getElementById('detail-notes').textContent = entity.description || 'Sem observações.';

  const info = document.getElementById('detail-info');
  const rows = [
    ['ID', entity.id],
    ['Tipo', typeLabel],
  ];
  if (entity.name) rows.push(['Nome', entity.name]);
  if (entity.description && entity.name) rows.push(['Descrição', entity.description]);

  const linked = rels.filter(r =>
    String(r.source) === String(entity.id) || String(r.target) === String(entity.id)
  );
  rows.push(['Vínculos', String(linked.length)]);

  info.innerHTML = rows.map(([k, v]) => `
    <div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>
  `).join('');

  renderDetailAttrs(entity.id);
  renderDetailLinks(entity, rels, map);
  hideAttrForm();

  const formatSelect = document.getElementById('detail-format');
  if (formatSelect) {
    const node = window.PdfGraphCanvas?.getNode?.(entity.id);
    formatSelect.value = node?.format === 'circle' ? 'circle' : 'card';
  }

  const reportBtn = document.getElementById('btn-report');
  const downloadBtn = document.getElementById('btn-download');
  if (downloadBtn?.href && downloadBtn.href !== '#') {
    reportBtn.href = downloadBtn.href;
    reportBtn.download = downloadBtn.download || 'relatorio.anx';
  }
}

async function processFile(file) {
  if (!file || file.type !== 'application/pdf') {
    showError('Selecione um arquivo PDF válido.');
    return;
  }

  hide(dropzone);
  hide(results);
  hide(errorOverlay);
  hide(document.getElementById('graph-view'));
  show(processing);

  document.getElementById('ai-status').textContent = 'Extraindo…';
  document.getElementById('ai-pct').textContent = '35%';
  document.getElementById('ai-progress').style.width = '35%';
  document.getElementById('status-sync').textContent = 'Processando…';
  processingStep.textContent = 'Extraindo texto do documento';

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    processingStep.textContent = 'Analisando entidades e vínculos com IA...';
    document.getElementById('ai-status').textContent = 'Analisando com IA…';
    document.getElementById('ai-pct').textContent = '70%';
    document.getElementById('ai-progress').style.width = '70%';

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
  hide(document.getElementById('graph-view'));
  document.getElementById('ai-status').textContent = 'Erro na extração';
  document.getElementById('ai-pct').textContent = '—';
  document.getElementById('ai-progress').style.width = '0%';
  document.getElementById('status-sync').textContent = 'Erro';
  errorMessage.textContent = message;
  show(errorOverlay);
}

function updateSourcesList(filename) {
  const list = document.getElementById('sources-list');
  list.innerHTML = `
    <div class="source-item">
      <div class="source-icon">PDF</div>
      <div class="source-meta">
        <div class="source-name" title="${escapeHtml(filename)}">${escapeHtml(filename)}</div>
        <div class="source-sub">Extração concluída</div>
      </div>
      <span class="source-dot" title="OK"></span>
    </div>
  `;
}

function updateEntityTypes(entities) {
  const counts = {};
  entities.forEach(e => {
    const t = e.entity_type || 'Anon';
    counts[t] = (counts[t] || 0) + 1;
  });

  const list = document.getElementById('entity-types-list');
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    list.innerHTML = '<p class="empty-hint">Nenhuma entidade encontrada.</p>';
    return;
  }

  list.innerHTML = entries.map(([type, count]) => `
    <div class="type-row">
      <span class="type-dot" style="background:${ENTITY_TYPE_COLORS[type] || '#64748b'}"></span>
      <span class="type-label">${ENTITY_TYPE_LABELS[type] || type}</span>
      <span class="type-count">${count}</span>
    </div>
  `).join('');
}

function openGraphView() {
  if (!lastAnalysisData) return;
  hide(dropzone);
  hide(results);
  document.getElementById('graph-filename').textContent = lastFilename;
  window.PdfGraphCanvas.open(lastAnalysisData, lastFilename);
}

function showResults(data, filename) {
  hide(dropzone);
  hide(errorOverlay);

  lastAnalysisData = data;
  lastFilename = filename;

  document.getElementById('filename').textContent = filename;
  document.getElementById('project-name').textContent = filename.replace(/\.pdf$/i, '') || 'Meu Projeto';
  document.getElementById('status-project').textContent = `Projeto: ${filename}`;
  document.getElementById('stat-entities').textContent = data.stats.entities;
  document.getElementById('stat-relationships').textContent = data.stats.relationships;
  document.getElementById('stat-chars').textContent = formatNumber(data.stats.characters);
  document.getElementById('status-counts').textContent =
    `${data.stats.entities} entidades · ${data.stats.relationships} vínculos`;
  document.getElementById('status-sync').textContent = 'Sincronizado';

  document.getElementById('ai-status').textContent = 'Extração concluída';
  document.getElementById('ai-pct').textContent = '100%';
  document.getElementById('ai-progress').style.width = '100%';

  updateSourcesList(filename);
  updateEntityTypes(data.entities || []);

  const downloadBtn = document.getElementById('btn-download');
  downloadBtn.href = data.download_url;
  downloadBtn.download = data.anx_filename;
  show(downloadBtn);
  show(document.getElementById('btn-new'));

  const reportBtn = document.getElementById('btn-report');
  reportBtn.href = data.download_url;
  reportBtn.download = data.anx_filename;

  const entityMap = Object.fromEntries((data.entities || []).map(e => [e.id, e.name || e.id]));

  const entitiesList = document.getElementById('entities-list');
  entitiesList.innerHTML = (data.entities || []).map(e => `
    <div class="entity-item" data-entity-id="${escapeHtml(e.id)}" tabindex="0" role="button">
      <div class="entity-header">
        <span class="entity-badge">${ENTITY_TYPE_LABELS[e.entity_type] || e.entity_type}</span>
        <span class="entity-id">#${escapeHtml(e.id)}</span>
      </div>
      <div class="entity-name">${escapeHtml(e.name || e.description || e.id)}</div>
      ${e.description && e.name ? `<div class="entity-desc">${escapeHtml(e.description)}</div>` : ''}
    </div>
  `).join('') || '<p class="entity-desc">Nenhuma entidade encontrada.</p>';

  entitiesList.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      entitiesList.querySelectorAll('.entity-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      const ent = data.entities.find(e => e.id === item.dataset.entityId);
      showEntityDetail(ent, data.relationships, entityMap);
    });
  });

  const relList = document.getElementById('relationships-list');
  relList.innerHTML = (data.relationships || []).map(r => `
    <div class="rel-item">
      <div class="rel-label">${escapeHtml(r.label)}</div>
      <div class="rel-nodes">${escapeHtml(entityMap[r.source] || r.source)} → ${escapeHtml(entityMap[r.target] || r.target)}</div>
      ${r.description ? `<div class="rel-desc">${escapeHtml(r.description)}</div>` : ''}
    </div>
  `).join('') || '<p class="entity-desc">Nenhum vínculo encontrado.</p>';

  if (data.entities?.length) {
    showEntityDetail(data.entities[0], data.relationships, entityMap);
    entitiesList.querySelector('.entity-item')?.classList.add('active');
  } else {
    clearEntityDetail();
  }

  // Abre o gráfico no centro (como no mockup)
  openGraphView();
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

function triggerUpload(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  fileInput.click();
}

dropzone.addEventListener('click', () => {
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
document.getElementById('btn-add-source')?.addEventListener('click', triggerUpload);
document.getElementById('rail-upload')?.addEventListener('click', triggerUpload);

const THEME_KEY = 'PDF2Chart-theme';
const LEFT_PANEL_KEY = 'PDF2Chart-left-panel';

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  const btn = document.getElementById('btn-theme');
  if (btn) {
    const isLight = next === 'light';
    btn.title = isLight ? 'Mudar para tema escuro' : 'Mudar para tema claro';
    btn.setAttribute('aria-label', btn.title);
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applyLeftPanel(collapsed) {
  const body = document.querySelector('.shell-body');
  const btn = document.getElementById('rail-toggle-left');
  if (!body) return;
  body.classList.toggle('left-panel-collapsed', collapsed);
  localStorage.setItem(LEFT_PANEL_KEY, collapsed ? 'collapsed' : 'open');
  if (btn) {
    btn.classList.toggle('active', !collapsed);
    btn.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
    btn.title = collapsed ? 'Exibir painel de fontes' : 'Ocultar painel de fontes';
    btn.setAttribute('aria-label', btn.title);
  }
}

function initLeftPanel() {
  const saved = localStorage.getItem(LEFT_PANEL_KEY);
  applyLeftPanel(saved === 'collapsed');
}

document.getElementById('btn-theme')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

document.getElementById('rail-toggle-left')?.addEventListener('click', () => {
  const body = document.querySelector('.shell-body');
  const collapsed = !body?.classList.contains('left-panel-collapsed');
  applyLeftPanel(collapsed);
});

initTheme();
initLeftPanel();

const openJsonInput = document.getElementById('inp-open-json');
document.getElementById('rail-open-json')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  openJsonInput.click();
});

openJsonInput?.addEventListener('change', async () => {
  const file = openJsonInput.files?.[0];
  if (!file) return;

  hide(dropzone);
  hide(results);
  hide(errorOverlay);

  lastFilename = file.name;
  document.getElementById('graph-filename').textContent = file.name;
  document.getElementById('filename').textContent = file.name;
  document.getElementById('project-name').textContent = file.name.replace(/\.json$/i, '') || 'Meu Projeto';
  document.getElementById('status-project').textContent = `Projeto: ${file.name}`;
  document.getElementById('status-sync').textContent = 'JSON carregado';
  document.getElementById('ai-status').textContent = 'Mapa importado';
  document.getElementById('ai-pct').textContent = '100%';
  document.getElementById('ai-progress').style.width = '100%';

  document.getElementById('sources-list').innerHTML = `
    <div class="source-item">
      <div class="source-icon" style="background:rgba(59,130,246,0.15);color:#93c5fd">JSON</div>
      <div class="source-meta">
        <div class="source-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="source-sub">Aberto no mapa</div>
      </div>
      <span class="source-dot" title="OK"></span>
    </div>
  `;

  show(document.getElementById('btn-new'));

  try {
    const state = await window.PdfGraphCanvas.importJson(file);
    const n = state.nodes?.length || 0;
    const e = state.edges?.length || 0;
    document.getElementById('stat-entities').textContent = n;
    document.getElementById('stat-relationships').textContent = e;
    document.getElementById('status-counts').textContent = `${n} entidades · ${e} vínculos`;

    const typeCounts = {};
    (state.nodes || []).forEach(node => {
      const t = node.iconType || node.typeLabel || 'Anon';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const list = document.getElementById('entity-types-list');
    const entries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    list.innerHTML = entries.length
      ? entries.map(([type, count]) => `
          <div class="type-row">
            <span class="type-dot" style="background:${ENTITY_TYPE_COLORS[type] || '#64748b'}"></span>
            <span class="type-label">${ENTITY_TYPE_LABELS[type] || type}</span>
            <span class="type-count">${count}</span>
          </div>
        `).join('')
      : '<p class="empty-hint">Nenhuma entidade no JSON.</p>';

    lastAnalysisData = {
      entities: (state.nodes || []).map(node => ({
        id: node.id,
        name: node.title,
        entity_type: node.iconType || 'Anon',
        description: node.props?.[0]?.v || '',
      })),
      relationships: (state.edges || []).map(edge => ({
        source: edge.s,
        target: edge.t,
        label: edge.label,
        description: edge.description || '',
      })),
      stats: { entities: n, relationships: e, characters: 0 },
    };

    if (lastAnalysisData.entities[0]) {
      showEntityDetail(lastAnalysisData.entities[0], lastAnalysisData.relationships, {});
    }
  } catch (err) {
    showError(err.message || 'Não foi possível abrir o JSON.');
  }

  openJsonInput.value = '';
});

document.getElementById('btn-view-graph').addEventListener('click', openGraphView);

document.getElementById('btn-close-graph')?.addEventListener('click', () => {
  if (window.PdfGraphCanvas) window.PdfGraphCanvas.close?.();
  hide(document.getElementById('graph-view'));
  if (lastAnalysisData) show(results);
  else show(dropzone);
});

document.getElementById('global-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && lastAnalysisData) {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const ent = lastAnalysisData.entities.find(x =>
      (x.name || '').toLowerCase().includes(q) ||
      (x.description || '').toLowerCase().includes(q) ||
      String(x.id).toLowerCase().includes(q)
    );
    if (ent) {
      const entityMap = Object.fromEntries(lastAnalysisData.entities.map(x => [x.id, x.name || x.id]));
      showEntityDetail(ent, lastAnalysisData.relationships, entityMap);
    }
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    document.getElementById('global-search')?.focus();
  }
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

document.querySelectorAll('.detail-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    setDetailTab(tab);
    if (tab === 'vinculos' && selectedDetailEntity) {
      renderDetailLinks(selectedDetailEntity, getLiveRelationships(), buildEntityMap());
    }
    if (tab === 'resumo' && selectedDetailEntity) {
      renderDetailAttrs(selectedDetailEntity.id);
    }
  });
});

document.getElementById('btn-add-attr')?.addEventListener('click', () => {
  if (!selectedDetailEntity) return;
  if (!window.PdfGraphCanvas?.getNode?.(selectedDetailEntity.id)) {
    document.getElementById('status-sync').textContent = 'Abra o gráfico para editar atributos';
    return;
  }
  showAttrForm();
});

document.getElementById('btn-cancel-attr')?.addEventListener('click', hideAttrForm);

document.getElementById('attr-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!selectedDetailEntity) return;

  const key = document.getElementById('attr-key').value.trim();
  const value = document.getElementById('attr-value').value.trim();
  if (!key || !value) return;

  const ok = window.PdfGraphCanvas?.addNodeProp?.(selectedDetailEntity.id, key, value);
  if (!ok) {
    document.getElementById('status-sync').textContent = 'Não foi possível adicionar o atributo';
    return;
  }

  hideAttrForm();
  renderDetailAttrs(selectedDetailEntity.id);
  document.getElementById('status-sync').textContent = 'Atributo salvo no card · use Salvar no gráfico';
});

document.getElementById('detail-format')?.addEventListener('change', (e) => {
  if (!selectedDetailEntity) return;
  const format = e.target.value === 'circle' ? 'circle' : 'card';
  const ok = window.PdfGraphCanvas?.setNodeFormat?.(selectedDetailEntity.id, format);
  if (!ok) {
    document.getElementById('status-sync').textContent = 'Abra o gráfico para alterar o formato';
    return;
  }
  document.getElementById('status-sync').textContent =
    format === 'circle' ? 'Formato: Círculo · use Salvar no gráfico' : 'Formato: Card · use Salvar no gráfico';
});

function fmtScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toFixed(4);
}

function renderRedeResult(payload) {
  const box = document.getElementById('rede-result');
  if (!box || !payload) return;
  const r = payload.result || {};
  let html = `<div class="rede-desc"><strong>${escapeHtml(r.label || payload.metricId)}</strong><br>${escapeHtml(r.description || '')}</div>`;
  html += `<p class="rede-meta">${payload.nodeCount || 0} nós · ${payload.edgeCount || 0} arestas · ${escapeHtml(payload.computedAt || '')}${r.approximate ? ' · aproximado' : ''}</p>`;

  if (r.summary) {
    html += `<p class="rede-summary">${escapeHtml(JSON.stringify(r.summary, null, 0).replace(/[{}"]/g, ' ').replace(/,/g, ' · '))}</p>`;
  }

  const blocks = [];
  if (r.degree) {
    blocks.push(['Degree', r.degree.ranking]);
    blocks.push(['In-Degree', r.inDegree?.ranking]);
    blocks.push(['Out-Degree', r.outDegree?.ranking]);
  } else if (r.rankingHub || r.rankingAuthority) {
    blocks.push(['Hub', r.rankingHub]);
    blocks.push(['Authority', r.rankingAuthority]);
  } else if (r.predictions) {
    html += '<ul class="rede-rank">' + r.predictions.slice(0, 12).map((p, i) => `
      <li>
        <span class="pos">${i + 1}</span>
        <span>${escapeHtml(p.sourceName)} → ${escapeHtml(p.targetName)} <small>(CN ${p.commonNeighbors})</small></span>
        <span class="val">${fmtScore(p.score)}</span>
      </li>`).join('') + '</ul>';
  } else if (r.communities) {
    html += Object.entries(r.communities).map(([cid, members]) => `
      <p class="rede-summary"><strong>Comunidade ${escapeHtml(String(cid))}</strong> (${members.length}): ${members.slice(0, 8).map(m => escapeHtml(m.name)).join(', ')}${members.length > 8 ? '…' : ''}</p>
    `).join('');
  } else if (r.byRole) {
    html += Object.entries(r.byRole).map(([role, members]) => `
      <p class="rede-summary"><strong>${escapeHtml(role)}</strong>: ${members.slice(0, 6).map(m => escapeHtml(m.name)).join(', ')}${members.length > 6 ? '…' : ''}</p>
    `).join('');
  } else if (r.flagged) {
    html += '<ul class="rede-rank">' + r.flagged.slice(0, 15).map((p, i) => `
      <li>
        <span class="pos">${i + 1}</span>
        <span>${escapeHtml(p.name)} <small>grau ${p.degree}</small></span>
        <span class="val">z=${fmtScore(p.zScore)}</span>
      </li>`).join('') + '</ul>';
  } else if (r.ranking?.length) {
    blocks.push([r.label || 'Ranking', r.ranking]);
  }

  blocks.forEach(([title, list]) => {
    if (!list?.length) return;
    html += `<p class="rede-meta">${escapeHtml(title)}</p><ul class="rede-rank">`;
    html += list.slice(0, 15).map((row, i) => `
      <li>
        <span class="pos">${i + 1}</span>
        <span title="${escapeHtml(row.id)}">${escapeHtml(row.name || row.id)}${row.role ? ` <small>· ${escapeHtml(row.role)}</small>` : ''}</span>
        <span class="val">${fmtScore(row.value)}</span>
      </li>`).join('');
    html += '</ul>';
  });

  box.innerHTML = html;
}

function initRedePanel() {
  const wrap = document.getElementById('rede-buttons');
  if (!wrap || !window.NetworkMetrics) return;
  const byCat = {};
  window.NetworkMetrics.BUTTONS.forEach(b => {
    if (!byCat[b.category]) byCat[b.category] = [];
    byCat[b.category].push(b);
  });
  wrap.innerHTML = Object.entries(byCat).map(([cat, list]) => `
    <div class="rede-cat">${escapeHtml(cat)}</div>
    ${list.map(b => `<button type="button" class="rede-btn" data-metric="${escapeHtml(b.id)}">${escapeHtml(b.label)}</button>`).join('')}
  `).join('');

  wrap.querySelectorAll('.rede-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const state = window.PdfGraphCanvas?.getState?.();
      if (!state?.nodes?.length) {
        document.getElementById('rede-result').innerHTML =
          '<p class="empty-hint">Carregue ou analise um grafo antes de calcular.</p>';
        return;
      }
      try {
        const payload = window.NetworkMetrics.compute(btn.dataset.metric, state.nodes, state.edges);
        window.PdfGraphCanvas.setNetworkAnalysisResult(btn.dataset.metric, payload);
        wrap.querySelectorAll('.rede-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderRedeResult(payload);
        document.getElementById('status-sync').textContent =
          `Rede: ${payload.result?.label || btn.dataset.metric} · use Salvar no gráfico`;
      } catch (err) {
        document.getElementById('rede-result').innerHTML =
          `<p class="empty-hint">${escapeHtml(err.message || 'Erro no cálculo')}</p>`;
      }
    });
  });
}

window.onNetworkAnalysisLoaded = (analysis) => {
  const keys = Object.keys(analysis?.results || {});
  if (!keys.length) return;
  const last = keys[keys.length - 1];
  renderRedeResult(analysis.results[last]);
  document.querySelectorAll('#rede-buttons .rede-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.metric === last);
  });
};

initRedePanel();

window.onGraphSelectionChange = (ids) => {
  if (!ids || !ids.length) return;
  const ent = resolveEntity(ids[0]);
  if (!ent) return;
  const activeTab = document.querySelector('.detail-tab.active')?.dataset.tab || 'resumo';
  showEntityDetail(ent, getLiveRelationships(), buildEntityMap());
  setDetailTab(activeTab);
};

loadCredentials();

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (results.classList.contains('hidden') && errorOverlay.classList.contains('hidden')) {
    const graphHidden = document.getElementById('graph-view').classList.contains('hidden');
    if (!graphHidden) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }
});
