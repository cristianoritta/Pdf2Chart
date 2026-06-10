/**
 * Canvas de vínculos PDF2Chart — estrutura inspirada no CSI Canvas
 */
(() => {
  const TYPE_COLORS = {
    Person: '#1a73e8',
    Organization: '#7c3aed',
    Location: '#2563eb',
    Vehicle: '#f97316',
    Phone: '#059669',
    Email: '#0d9488',
    Document: '#64748b',
    Account: '#8b5cf6',
    Event: '#db2777',
    Anon: '#94a3b8',
  };

  const ICONS = {
    Person: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    Organization: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="7" width="18" height="14" rx="1"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>',
    Location: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    Vehicle: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 13l2-5h14l2 5v5h-3M3 13v5h3M3 13h18"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/></svg>',
    Phone: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    Email: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    Document: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    Account: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    Event: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    Anon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0M8.5 15h7"/></svg>',
  };

  const ICON_PIN = '<svg viewBox="0 0 24 24"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';

  const NODE_W = 196;
  const NODE_H = 128;

  let nodes = [];
  let edges = [];
  let nodeEls = {};
  let edgeEls = [];
  let selectedIds = new Set();
  let selectedEdgeIdx = null;
  let tx = 0, ty = 0, scale = 1;
  let panning = false, panSX, panSY, panTX, panTY;
  let draggingNode = null, ndSX, ndSY, moved = false, dragGroup = [];
  let isSelectingArea = false, selectSX, selectSY;
  let linkSourceId = null;
  let ctxTarget = null;
  let editingNodeId = null;
  let editingEdgeIdx = null;
  let nextId = 1;
  let graphFilename = '';
  let toastTimer = null;

  const $ = id => document.getElementById(id);
  const canvas = () => $('graph-canvas');
  const world = () => $('graph-world');
  const svg = () => $('graph-edges');
  const ctxMenu = () => $('graph-ctx');

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function setHint(msg) {
    const el = $('graph-hint');
    if (el) el.textContent = msg;
  }

  function applyTransform() {
    world().style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    $('graph-zoomlbl').textContent = Math.round(scale * 100) + '%';
  }

  function updateCounts() {
    $('graph-node-count').textContent = nodes.length + ' entidades';
    $('graph-edge-count').textContent = edges.length + ' vínculos';
  }

  function getNode(id) {
    return nodes.find(n => n.id === id);
  }

  function rectNode(id) {
    const el = nodeEls[id];
    if (el) {
      return {
        x: el.offsetLeft, y: el.offsetTop,
        w: el.offsetWidth, h: el.offsetHeight,
        cx: el.offsetLeft + el.offsetWidth / 2,
        cy: el.offsetTop + el.offsetHeight / 2,
      };
    }
    const n = getNode(id);
    if (n) return { x: n.x, y: n.y, w: NODE_W, h: NODE_H, cx: n.x + NODE_W / 2, cy: n.y + NODE_H / 2 };
    return null;
  }

  function anchorOnRect(rect, tx2, ty2) {
    const cx = rect.cx, cy = rect.cy;
    const dx = tx2 - cx, dy = ty2 - cy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx + rect.w / 2, y: cy, side: 'r' };
    const hw = rect.w / 2, hh = rect.h / 2;
    const t = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
    const x = cx + dx * t, y = cy + dy * t;
    const adx = Math.abs(dx) / hw, ady = Math.abs(dy) / hh;
    let side = 'r';
    if (adx > ady) side = dx > 0 ? 'r' : 'l';
    else side = dy > 0 ? 'b' : 't';
    return { x, y, side };
  }

  function endpoint(id, otherId) {
    const r = rectNode(id), o = rectNode(otherId);
    if (!r || !o) return { x: 0, y: 0, side: 'r' };
    return anchorOnRect(r, o.cx, o.cy);
  }

  function ctrlBezier(p, side, dist) {
    const k = Math.max(36, dist * 0.38);
    if (side === 'l') return { x: p.x - k, y: p.y };
    if (side === 'r') return { x: p.x + k, y: p.y };
    if (side === 't') return { x: p.x, y: p.y - k };
    if (side === 'b') return { x: p.x, y: p.y + k };
    return { x: p.x, y: p.y };
  }

  function bez(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const c1 = ctrlBezier(a, a.side || 'r', dist);
    const c2 = ctrlBezier(b, b.side || 'l', dist);
    return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
  }

  function bezMid(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const c1 = ctrlBezier(a, a.side || 'r', dist);
    const c2 = ctrlBezier(b, b.side || 'l', dist);
    return {
      x: 0.125 * a.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * b.x,
      y: 0.125 * a.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * b.y,
    };
  }

  function redraw() {
    edgeEls.forEach((e, idx) => {
      if (!nodeEls[e.s] || !nodeEls[e.t]) return;
      const a = endpoint(e.s, e.t), b = endpoint(e.t, e.s);
      e.path.setAttribute('d', bez(a, b));
      const m = bezMid(a, b);
      e.lab.style.left = m.x + 'px';
      e.lab.style.top = m.y + 'px';
    });
  }

  function highlight(id, on) {
    if (draggingNode) return;
    edgeEls.forEach((e, idx) => {
      const conn = e.s === id || e.t === id;
      e.path.classList.toggle('hot', on && conn);
      e.path.classList.toggle('dim', on && !conn && selectedEdgeIdx === null);
      e.lab.classList.toggle('hot', on && conn);
      e.lab.classList.toggle('dim', on && !conn && selectedEdgeIdx === null);
    });
    Object.keys(nodeEls).forEach(nid => {
      if (!on) { nodeEls[nid].classList.remove('dim'); return; }
      const linked = nid === id || edgeEls.some(e => (e.s === id && e.t === nid) || (e.t === id && e.s === nid));
      nodeEls[nid].classList.toggle('dim', !linked);
    });
  }

  function propsHtml(n) {
    return (n.props || []).map(([k, v]) =>
      `<div class="g-row"><span class="g-k">${esc(k)}</span><span class="g-v">${esc(v)}</span></div>`
    ).join('');
  }

  function refreshNodeEl(n) {
    if (!n.el) return;
    n.el.style.setProperty('--c', n.color);
    const ttl = n.el.querySelector('.g-ttl');
    const typ = n.el.querySelector('.g-typ');
    const ico = n.el.querySelector('.g-ico');
    const props = n.el.querySelector('.g-props');
    if (ttl) ttl.textContent = n.title;
    if (typ) typ.textContent = n.typeLabel;
    if (ico) ico.innerHTML = ICONS[n.iconType] || ICONS.Anon;
    if (props) props.innerHTML = propsHtml(n);
    updatePinBtn(n);
  }

  function updatePinBtn(n) {
    if (!n.el) return;
    const pinned = !!n.pinned;
    const sel = selectedIds.has(n.id);
    n.el.classList.toggle('pinned', pinned);
    let btn = n.el.querySelector('.btn-pin');
    if (!sel) { if (btn) btn.remove(); return; }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-pin';
      btn.addEventListener('mousedown', ev => ev.stopPropagation());
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        n.pinned = !n.pinned;
        updatePinBtn(n);
        setHint(n.pinned ? `Card fixado: ${n.title}` : `Card desfixado: ${n.title}`);
      });
      n.el.appendChild(btn);
    }
    btn.title = pinned ? 'Desfixar card' : 'Fixar card';
    btn.innerHTML = ICON_PIN;
    btn.classList.toggle('ativo', pinned);
  }

  function buildNodeEl(n) {
    if (nodeEls[n.id]) {
      n.el = nodeEls[n.id];
      refreshNodeEl(n);
      return;
    }
    const el = document.createElement('div');
    el.className = 'g-node';
    el.style.left = n.x + 'px';
    el.style.top = n.y + 'px';
    el.style.setProperty('--c', n.color);
    el.innerHTML = `<div class="g-bar"></div>
      <div class="g-head"><div class="g-ico">${ICONS[n.iconType] || ICONS.Anon}</div>
        <div><div class="g-ttl">${esc(n.title)}</div><div class="g-typ">${esc(n.typeLabel)}</div></div></div>
      <div class="g-props">${propsHtml(n)}</div>
      <span class="g-handle l"></span><span class="g-handle r"></span>`;
    world().appendChild(el);
    nodeEls[n.id] = el;
    n.el = el;
    el.addEventListener('mouseenter', () => highlight(n.id, true));
    el.addEventListener('mouseleave', () => highlight(n.id, false));
    el.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      showCtxMenu(ev.clientX, ev.clientY, n);
    });
    el.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      openCardModal(n);
    });
    updatePinBtn(n);
  }

  function addEdgeEl(e, idx) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'graph-edge');
    path.dataset.idx = idx;
    path.addEventListener('click', ev => {
      ev.stopPropagation();
      selectEdge(idx);
    });
    svg().appendChild(path);
    const lab = document.createElement('div');
    lab.className = 'graph-elabel';
    lab.textContent = e.label || 'vínculo';
    lab.dataset.idx = idx;
    lab.addEventListener('click', ev => {
      ev.stopPropagation();
      selectEdge(idx);
    });
    lab.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      openEdgeModal(idx);
    });
    world().appendChild(lab);
    edgeEls.push({ ...e, path, lab, idx });
  }

  function remountEdges() {
    svg().innerHTML = '';
    world().querySelectorAll('.graph-elabel').forEach(el => el.remove());
    edgeEls = [];
    edges.forEach((e, idx) => addEdgeEl(e, idx));
  }

  function mountAll() {
    Object.values(nodeEls).forEach(el => el.remove());
    nodeEls = {};
    remountEdges();
    nodes.forEach(buildNodeEl);
    updateCounts();
    requestAnimationFrame(() => { redraw(); fitView(); });
  }

  function fitView() {
    if (!nodes.length) return;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    nodes.forEach(n => {
      if (!n.el) return;
      minX = Math.min(minX, n.el.offsetLeft);
      minY = Math.min(minY, n.el.offsetTop);
      maxX = Math.max(maxX, n.el.offsetLeft + n.el.offsetWidth);
      maxY = Math.max(maxY, n.el.offsetTop + n.el.offsetHeight);
    });
    const rect = canvas().getBoundingClientRect(), pad = 70;
    const sx = (rect.width - pad * 2) / (maxX - minX);
    const sy = (rect.height - pad * 2) / (maxY - minY);
    scale = Math.min(1.35, Math.min(sx, sy) || 1);
    tx = (rect.width - (maxX - minX) * scale) / 2 - minX * scale;
    ty = (rect.height - (maxY - minY) * scale) / 2 - minY * scale;
    applyTransform();
  }

  function applySelection() {
    nodes.forEach(n => {
      if (!n.el) return;
      n.el.classList.toggle('sel', selectedIds.has(n.id));
      updatePinBtn(n);
    });
    edgeEls.forEach((e, idx) => {
      e.path.classList.toggle('sel', selectedEdgeIdx === idx);
      e.lab.classList.toggle('sel', selectedEdgeIdx === idx);
    });
    $('btn-link-cards').disabled = selectedIds.size < 2;
  }

  function clearSelection() {
    selectedIds.clear();
    selectedEdgeIdx = null;
    applySelection();
  }

  function selectOne(n) {
    selectedIds.clear();
    selectedIds.add(n.id);
    selectedEdgeIdx = null;
    applySelection();
  }

  function toggleSelect(n) {
    if (selectedIds.has(n.id)) selectedIds.delete(n.id);
    else selectedIds.add(n.id);
    selectedEdgeIdx = null;
    applySelection();
  }

  function selectEdge(idx) {
    selectedEdgeIdx = idx;
    selectedIds.clear();
    applySelection();
    const e = edges[idx];
    if (e) setHint(`Vínculo selecionado: ${e.label} — Del para apagar`);
  }

  function selectExtremities(n) {
    const ids = new Set([n.id]);
    edgeEls.forEach(e => {
      if (e.s === n.id) ids.add(e.t);
      if (e.t === n.id) ids.add(e.s);
    });
    selectedIds.clear();
    ids.forEach(id => selectedIds.add(id));
    selectedEdgeIdx = null;
    applySelection();
    setHint(`${ids.size} card(s) selecionado(s) — extremidades do vínculo`);
  }

  function removeEdgesForNode(id) {
    const toRemove = edgeEls.map((e, i) => i).filter(i => edges[i].s === id || edges[i].t === id);
    toRemove.sort((a, b) => b - a).forEach(i => removeEdgeAt(i));
  }

  function removeEdgeAt(idx) {
    if (idx < 0 || idx >= edges.length) return;
    edges.splice(idx, 1);
    remountEdges();
    selectedEdgeIdx = null;
    updateCounts();
    redraw();
  }

  function deleteNode(n) {
    if (!n) return;
    removeEdgesForNode(n.id);
    if (nodeEls[n.id]) { nodeEls[n.id].remove(); delete nodeEls[n.id]; }
    nodes = nodes.filter(x => x.id !== n.id);
    selectedIds.delete(n.id);
    applySelection();
    updateCounts();
    redraw();
  }

  function entityToNode(entity, i, total) {
    const angle = (2 * Math.PI * i) / Math.max(total, 1);
    const radius = 180 + total * 12;
    const cx = 800, cy = 500;
    const type = entity.entity_type || 'Anon';
    const props = [];
    if (entity.description && entity.name) props.push(['Descrição', entity.description]);
    else if (entity.description) props.push(['Info', entity.description]);
    props.push(['ID', entity.id]);
    return {
      id: String(entity.id),
      title: entity.name || entity.description || entity.id,
      typeLabel: type,
      iconType: type,
      color: TYPE_COLORS[type] || TYPE_COLORS.Anon,
      props,
      x: cx + radius * Math.cos(angle) - NODE_W / 2,
      y: cy + radius * Math.sin(angle) - NODE_H / 2,
      pinned: false,
    };
  }

  function syncNextId() {
    let max = 0;
    nodes.forEach(n => {
      const m = String(n.id).match(/^C(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    nextId = max + 1;
  }

  function serializeNode(n) {
    return {
      id: n.id,
      title: n.title,
      typeLabel: n.typeLabel,
      iconType: n.iconType,
      color: n.color,
      props: n.props || [],
      x: n.x,
      y: n.y,
      pinned: !!n.pinned,
    };
  }

  function nodeFromSerialized(raw) {
    return {
      id: String(raw.id),
      title: raw.title || raw.id,
      typeLabel: raw.typeLabel || raw.type || 'Anon',
      iconType: raw.iconType || raw.typeLabel || 'Anon',
      color: raw.color || TYPE_COLORS[raw.iconType] || TYPE_COLORS.Anon,
      props: Array.isArray(raw.props) ? raw.props : [],
      x: Number(raw.x) || 0,
      y: Number(raw.y) || 0,
      pinned: !!raw.pinned,
    };
  }

  function exportPayload() {
    return {
      version: 1,
      app: 'PDF2Chart',
      filename: graphFilename,
      exportedAt: new Date().toISOString(),
      viewport: { tx, ty, scale },
      nodes: nodes.map(serializeNode),
      edges: edges.map(e => ({
        s: e.s,
        t: e.t,
        label: e.label || 'vínculo',
        description: e.description || '',
      })),
    };
  }

  function loadGraphState(data, opts = {}) {
    if (data.nodes && Array.isArray(data.nodes)) {
      nodes = data.nodes.map(nodeFromSerialized);
      edges = (data.edges || []).map(e => ({
        s: String(e.s),
        t: String(e.t),
        label: e.label || 'vínculo',
        description: e.description || '',
      }));
      if (data.viewport && !opts.ignoreViewport) {
        tx = data.viewport.tx ?? tx;
        ty = data.viewport.ty ?? ty;
        scale = data.viewport.scale ?? scale;
      }
      if (data.filename) graphFilename = data.filename;
      syncNextId();
    } else if (data.entities) {
      const entities = data.entities || [];
      const relationships = data.relationships || [];
      nodes = entities.map((e, i) => entityToNode(e, i, entities.length));
      edges = relationships.map(r => ({
        s: String(r.source),
        t: String(r.target),
        label: r.label || 'vínculo',
        description: r.description || '',
      }));
    } else {
      throw new Error('JSON inválido: esperado nodes/edges ou entities/relationships');
    }
    selectedIds.clear();
    selectedEdgeIdx = null;
    linkSourceId = null;
    mountAll();
    if (data.viewport && !opts.ignoreViewport) applyTransform();
    setHint('Grafo carregado · Shift+clique seleção múltipla · Del apaga');
  }

  function loadFromAnalysis(data) {
    loadGraphState(data, { ignoreViewport: true });
    setHint('Shift+clique seleção múltipla · Del apaga · Pin fixa card · Ctrl+arraste seleciona área');
  }

  function saveGraphJson() {
    const payload = exportPayload();
    const base = (graphFilename || 'grafo').replace(/\.pdf$/i, '').replace(/[^\w\-]+/g, '_') || 'grafo';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON salvo');
  }

  function importGraphJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        loadGraphState(data);
        const fn = $('graph-filename');
        if (fn && data.filename) fn.textContent = data.filename;
        showToast('JSON importado');
      } catch (err) {
        setHint('Erro ao importar: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function toMarkdown() {
    const title = graphFilename || 'Grafo de vínculos';
    const lines = [
      `# ${title}`,
      '',
      `> Exportado em ${new Date().toLocaleString('pt-BR')} · ${nodes.length} entidades · ${edges.length} vínculos`,
      '',
      '## Entidades',
      '',
    ];

    nodes.forEach(n => {
      lines.push(`### ${n.title} (\`${n.id}\`)`);
      lines.push(`- **Tipo:** ${n.typeLabel}`);
      if (n.color) lines.push(`- **Cor:** ${n.color}`);
      (n.props || []).forEach(([k, v]) => {
        if (k && v) lines.push(`- **${k}:** ${v}`);
      });
      if (n.pinned) lines.push('- **Fixado:** sim');
      lines.push('');
    });

    lines.push('## Vínculos', '');
    if (edges.length) {
      lines.push('| Origem | ID origem | Vínculo | Destino | ID destino | Descrição |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      edges.forEach(e => {
        const src = getNode(e.s);
        const tgt = getNode(e.t);
        lines.push(
          `| ${src?.title || e.s} | ${e.s} | ${e.label || 'vínculo'} | ${tgt?.title || e.t} | ${e.t} | ${e.description || ''} |`
        );
      });
    } else {
      lines.push('_Nenhum vínculo._');
    }

    lines.push('', '## Estrutura JSON', '', '```json');
    lines.push(JSON.stringify(exportPayload(), null, 2));
    lines.push('```');
    return lines.join('\n');
  }

  async function copyMarkdown() {
    const md = toMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      showToast('Markdown copiado');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = md;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Markdown copiado');
    }
  }

  function showToast(msg) {
    const el = $('graph-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  function newCustomId() {
    return 'C' + String(nextId++).padStart(3, '0');
  }

  function openCardModal(node) {
    editingNodeId = node ? node.id : null;
    const modal = $('card-modal');
    const isEdit = !!node;
    $('card-modal-title').textContent = isEdit ? 'Editar card' : 'Novo card';
    $('card-title').value = node?.title || '';
    $('card-type-label').value = node?.typeLabel || 'Person';
    $('card-prop-key').value = node?.props?.[0]?.[0] || 'Descrição';
    $('card-prop-val').value = node?.props?.[0]?.[1] || '';
    $('card-color').value = node?.color || TYPE_COLORS.Person;
    setupIconPicker(node?.iconType || 'Person');
    show(modal);
  }

  function setupIconPicker(active) {
    const picker = $('icon-picker');
    picker.innerHTML = Object.keys(ICONS).map(type =>
      `<button type="button" data-icon="${type}" class="${type === active ? 'active' : ''}" title="${type}">${ICONS[type]}</button>`
    ).join('');
    picker.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        picker.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function getSelectedIcon() {
    return $('icon-picker').querySelector('.active')?.dataset.icon || 'Person';
  }

  function saveCardFromModal() {
    const title = $('card-title').value.trim();
    if (!title) return;
    const typeLabel = $('card-type-label').value.trim() || 'Anon';
    const iconType = getSelectedIcon();
    const color = $('card-color').value;
    const propKey = $('card-prop-key').value.trim() || 'Info';
    const propVal = $('card-prop-val').value.trim();
    const props = propVal ? [[propKey, propVal]] : [];

    if (editingNodeId) {
      const n = getNode(editingNodeId);
      if (n) {
        Object.assign(n, { title, typeLabel, iconType, color, props });
        refreshNodeEl(n);
      }
    } else {
      const rect = canvas().getBoundingClientRect();
      const cx = (rect.width / 2 - tx) / scale;
      const cy = (rect.height / 2 - ty) / scale;
      const n = {
        id: newCustomId(),
        title, typeLabel, iconType, color, props,
        x: cx - NODE_W / 2, y: cy - NODE_H / 2,
        pinned: false,
      };
      nodes.push(n);
      buildNodeEl(n);
      selectOne(n);
      updateCounts();
      redraw();
    }
    hide($('card-modal'));
    editingNodeId = null;
  }

  function openEdgeModal(idx, sourceId, targetId) {
    editingEdgeIdx = idx ?? null;
    const modal = $('edge-modal');
    $('edge-modal-title').textContent = idx != null ? 'Editar vínculo' : 'Novo vínculo';

    const srcSel = $('edge-source');
    const tgtSel = $('edge-target');
    srcSel.innerHTML = nodes.map(n => `<option value="${n.id}">${esc(n.title)}</option>`).join('');
    tgtSel.innerHTML = nodes.map(n => `<option value="${n.id}">${esc(n.title)}</option>`).join('');

    if (idx != null) {
      const e = edges[idx];
      srcSel.value = e.s;
      tgtSel.value = e.t;
      $('edge-label').value = e.label || '';
      $('edge-desc').value = e.description || '';
    } else {
      const sel = [...selectedIds];
      srcSel.value = sourceId || sel[0] || nodes[0]?.id || '';
      tgtSel.value = targetId || sel[1] || nodes[1]?.id || '';
      $('edge-label').value = '';
      $('edge-desc').value = '';
    }
    show(modal);
  }

  function saveEdgeFromModal() {
    const s = $('edge-source').value;
    const t = $('edge-target').value;
    const label = $('edge-label').value.trim() || 'vínculo';
    const description = $('edge-desc').value.trim();
    if (!s || !t || s === t) return;

    if (editingEdgeIdx != null) {
      edges[editingEdgeIdx] = { s, t, label, description };
    } else {
      edges.push({ s, t, label, description });
    }
    remountEdges();
    updateCounts();
    redraw();
    hide($('edge-modal'));
    editingEdgeIdx = null;
    linkSourceId = null;
    setHint('Vínculo salvo');
  }

  function showCtxMenu(x, y, n) {
    ctxTarget = n;
    const menu = ctxMenu();
    menu.innerHTML = `
      <button type="button" data-act="extremidades">Selecionar extremidades</button>
      <button type="button" data-act="editar">Editar card</button>
      <button type="button" data-act="ligar">Ligar a outro card</button>
      <div class="sep"></div>
      <button type="button" data-act="apagar">Apagar card</button>`;
    menu.classList.add('open');
    const pad = 8, rect = menu.getBoundingClientRect();
    let left = x, top = y;
    if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
    if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }

  function closeCtxMenu() {
    ctxMenu().classList.remove('open');
    ctxTarget = null;
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function bindEvents() {
    $('btn-close-graph').addEventListener('click', () => {
      hide($('graph-view'));
    });

    $('btn-add-card').addEventListener('click', () => openCardModal(null));
    $('btn-link-cards').addEventListener('click', () => {
      const sel = [...selectedIds];
      openEdgeModal(null, sel[0], sel[1]);
    });

    $('btn-save-graph').addEventListener('click', saveGraphJson);
    $('btn-import-graph').addEventListener('click', () => $('inp-import-graph').click());
    $('inp-import-graph').addEventListener('change', () => {
      const file = $('inp-import-graph').files[0];
      if (file) importGraphJson(file);
      $('inp-import-graph').value = '';
    });
    $('btn-copy-md').addEventListener('click', copyMarkdown);

    $('card-form').addEventListener('submit', ev => {
      ev.preventDefault();
      saveCardFromModal();
    });
    $('edge-form').addEventListener('submit', ev => {
      ev.preventDefault();
      saveEdgeFromModal();
    });

    document.querySelectorAll('[data-close-card-modal]').forEach(el => {
      el.addEventListener('click', () => hide($('card-modal')));
    });
    document.querySelectorAll('[data-close-edge-modal]').forEach(el => {
      el.addEventListener('click', () => hide($('edge-modal')));
    });

    ctxMenu().addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn || !ctxTarget) return;
      const act = btn.dataset.act;
      const n = ctxTarget;
      closeCtxMenu();
      if (act === 'extremidades') selectExtremities(n);
      else if (act === 'editar') openCardModal(n);
      else if (act === 'ligar') {
        linkSourceId = n.id;
        selectOne(n);
        setHint(`Clique no card destino para criar vínculo com "${n.title}"`);
      }
      else if (act === 'apagar') deleteNode(n);
    });

    document.addEventListener('click', ev => {
      if (!ev.target.closest('#graph-ctx')) closeCtxMenu();
    });

    canvas().addEventListener('mousedown', ev => {
      if (ev.target.closest('.g-node')) return;
      if (ev.button === 0 && ev.ctrlKey) {
        isSelectingArea = true;
        selectSX = ev.clientX;
        selectSY = ev.clientY;
        if (!ev.shiftKey) clearSelection();
        const box = $('graph-selection-box');
        box.style.display = 'block';
        box.style.left = selectSX + 'px';
        box.style.top = selectSY + 'px';
        box.style.width = '0';
        box.style.height = '0';
        ev.preventDefault();
        return;
      }
      if (!ev.shiftKey) { clearSelection(); selectedEdgeIdx = null; applySelection(); }
      panning = true;
      canvas().classList.add('grabbing');
      panSX = ev.clientX; panSY = ev.clientY;
      panTX = tx; panTY = ty;
    });

    canvas().addEventListener('wheel', ev => {
      ev.preventDefault();
      const rect = canvas().getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const old = scale;
      scale = Math.min(2.2, Math.max(0.15, scale * (ev.deltaY < 0 ? 1.12 : 0.89)));
      tx = mx - (mx - tx) * (scale / old);
      ty = my - (my - ty) * (scale / old);
      applyTransform();
    }, { passive: false });

    world().addEventListener('mousedown', ev => {
      const nodeEl = ev.target.closest('.g-node');
      if (!nodeEl) return;
      ev.stopPropagation();
      closeCtxMenu();
      const n = nodes.find(x => x.el === nodeEl);
      if (!n) return;

      if (linkSourceId && linkSourceId !== n.id) {
        openEdgeModal(null, linkSourceId, n.id);
        return;
      }

      if (ev.shiftKey) {
        toggleSelect(n);
        draggingNode = null;
        dragGroup = [];
        return;
      }

      if (!selectedIds.has(n.id)) selectOne(n);

      draggingNode = n;
      moved = false;
      ndSX = ev.clientX;
      ndSY = ev.clientY;
      dragGroup = nodes
        .filter(node => selectedIds.has(node.id) && !node.pinned)
        .map(node => ({ n: node, ox: node.x, oy: node.y }));
      dragGroup.forEach(({ n: dn }) => dn.el.classList.add('dragging'));
    });

    window.addEventListener('mousemove', ev => {
      if (isSelectingArea) {
        const curX = ev.clientX, curY = ev.clientY;
        const left = Math.min(selectSX, curX), top = Math.min(selectSY, curY);
        const width = Math.abs(selectSX - curX), height = Math.abs(selectSY - curY);
        const box = $('graph-selection-box');
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
        const boxRect = { left, top, right: left + width, bottom: top + height };
        nodes.forEach(n => {
          if (!n.el) return;
          const r = n.el.getBoundingClientRect();
          const overlap = !(r.right < boxRect.left || r.left > boxRect.right || r.bottom < boxRect.top || r.top > boxRect.bottom);
          if (overlap) selectedIds.add(n.id);
          else if (!ev.shiftKey) selectedIds.delete(n.id);
        });
        selectedEdgeIdx = null;
        applySelection();
        return;
      }
      if (panning) {
        tx = panTX + (ev.clientX - panSX);
        ty = panTY + (ev.clientY - panSY);
        applyTransform();
        return;
      }
      if (draggingNode && dragGroup.length) {
        const dx = (ev.clientX - ndSX) / scale, dy = (ev.clientY - ndSY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        dragGroup.forEach(({ n, ox, oy }) => {
          n.x = ox + dx;
          n.y = oy + dy;
          n.el.style.left = n.x + 'px';
          n.el.style.top = n.y + 'px';
        });
        redraw();
      }
    });

    window.addEventListener('mouseup', () => {
      if (isSelectingArea) {
        isSelectingArea = false;
        $('graph-selection-box').style.display = 'none';
      }
      if (panning) { panning = false; canvas().classList.remove('grabbing'); }
      if (draggingNode) {
        dragGroup.forEach(({ n }) => n.el.classList.remove('dragging'));
        draggingNode = null;
        dragGroup = [];
      }
    });

    document.addEventListener('keydown', ev => {
      if (!$('graph-view') || $('graph-view').classList.contains('hidden')) return;
      const tag = (ev.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (ev.key === 'Escape') {
        closeCtxMenu();
        clearSelection();
        linkSourceId = null;
        hide($('card-modal'));
        hide($('edge-modal'));
        return;
      }

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        if (selectedEdgeIdx != null) {
          removeEdgeAt(selectedEdgeIdx);
          setHint('Vínculo removido');
          return;
        }
        const lista = nodes.filter(n => selectedIds.has(n.id));
        if (!lista.length) return;
        lista.forEach(n => deleteNode(n));
        setHint(lista.length > 1 ? `${lista.length} cards removidos` : 'Card removido');
        return;
      }

      if (ev.key === ' ' || ev.code === 'Space') {
        ev.preventDefault();
        const lista = nodes.filter(n => selectedIds.has(n.id));
        if (!lista.length) { setHint('Selecione um card'); return; }
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        lista.forEach(n => {
          if (!n.el) return;
          minX = Math.min(minX, n.el.offsetLeft);
          minY = Math.min(minY, n.el.offsetTop);
          maxX = Math.max(maxX, n.el.offsetLeft + n.el.offsetWidth);
          maxY = Math.max(maxY, n.el.offsetTop + n.el.offsetHeight);
        });
        const rect = canvas().getBoundingClientRect();
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        scale = 1;
        tx = rect.width / 2 - cx * scale;
        ty = rect.height / 2 - cy * scale;
        applyTransform();
        setHint('Centralizado · 100%');
      }
    });

    $('graph-zoom-in').addEventListener('click', () => {
      scale = Math.min(2.2, scale * 1.15);
      applyTransform();
    });
    $('graph-zoom-out').addEventListener('click', () => {
      scale = Math.max(0.15, scale / 1.15);
      applyTransform();
    });
    $('graph-zoom-fit').addEventListener('click', fitView);
  }

  window.PdfGraphCanvas = {
    open(data, filename) {
      graphFilename = filename || '';
      show($('graph-view'));
      loadFromAnalysis(data);
    },
    close() {
      hide($('graph-view'));
    },
  };

  document.addEventListener('DOMContentLoaded', bindEvents);
})();
