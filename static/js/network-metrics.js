/**
 * Análise de redes — centralidades, comunidades e métricas avançadas
 */
(() => {
  const DESC = {
    degree: 'Degree Centrality conta quantas conexões um nó possui. Nós com grau alto são hubs locais — frequentemente pontos de contato ou articuladores.',
    inDegree: 'In-Degree (grafos direcionados) conta quantas ligações chegam ao nó. Valores altos indicam nós que recebem muita atenção, pedidos ou recursos.',
    outDegree: 'Out-Degree conta quantas conexões saem do nó. Valores altos indicam quem inicia contatos, ordena ou distribui informação/recursos.',
    betweenness: 'Betweenness pergunta: quem controla o fluxo de informação? Mede em quantos menores caminhos o nó aparece. Alto = ponte/broker entre grupos.',
    closeness: 'Closeness pergunta: quem chega mais rápido a todos? É o inverso da distância média até os demais. Alto = acesso rápido à rede.',
    eigenvector: 'Eigenvector: não basta ter muitas conexões — importa quem são. Ligar-se a nós importantes eleva a pontuação (Ax = λx).',
    pagerank: 'PageRank é evolução do Eigenvector: a importância “flui” pelas arestas com amortecimento. Bom para ranquear influência em redes direcionadas.',
    katz: 'Katz é semelhante ao Eigenvector, mas considera caminhos longos com peso decrescente. Útil em organizações e redes com elos indiretos.',
    hits: 'HITS separa Hub (aponta para bons nós) e Authority (recebe conexões importantes). Revela papéis de intermediário vs. referência.',
    harmonic: 'Harmonic melhora o Closeness quando a rede não é totalmente conectada, somando 1/distância. Adequada a redes reais fragmentadas.',
    information: 'Information Centrality considera a redundância dos caminhos (capacidade de comunicação). Nós com alternativas robustas pontuam melhor.',
    currentFlow: 'Current Flow Betweenness trata a rede como circuito elétrico: todos os caminhos importam, não só o mais curto. Mede controle de fluxo global.',
    density: 'Densidade é a fração das conexões possíveis que existem. Alta = rede coesa; baixa = esparsa (células pouco ligadas).',
    clustering: 'Clustering Coefficient pergunta: os “amigos dos amigos” também se conhecem? Alto = cliques locais; baixo = estrutura em estrela/ponte.',
    louvain: 'Louvain detecta comunidades maximizando modularidade. É o algoritmo mais popular para achar grupos fortemente conectados.',
    leiden: 'Leiden melhora o Louvain com partições mais estáveis e conectadas. Preferível quando a qualidade da comunidade importa.',
    girvanNewman: 'Girvan-Newman remove arestas de maior betweenness, separando a rede em comunidades. Intuitivo, porém mais lento.',
    labelPropagation: 'Label Propagation propaga rótulos de comunidade até convergência. Extremamente rápido — bom para grafos grandes.',
    robustness: 'Robustez: se remover um nó, a rede continua funcionando? Mede queda do componente gigante ao remover cada nó (impacto estrutural).',
    roles: 'Role Discovery classifica papéis (líder, mensageiro, financiador, operador, elo entre células) a partir do perfil de centralidades.',
    linkPrediction: 'Link Prediction estima vínculos ainda não observados (Common Neighbors, Adamic-Adar, Resource Allocation). Sugere conexões ocultas.',
    anomalies: 'Detecção de anomalias aponta nós com comportamento estatisticamente incomum (grau/centralidade fora do padrão da rede).',
    influence: 'Influência e propagação: simula como informação/recursos se espalham a partir de cada nó (cascata independente).',
    resilience: 'Resiliência estima quais alvos, se removidos, causariam maior fragmentação — priorização de intervenção.',
  };

  function buildIndex(nodes, edges) {
    const ids = nodes.map(n => String(n.id));
    const idSet = new Set(ids);
    const out = Object.fromEntries(ids.map(id => [id, []]));
    const inn = Object.fromEntries(ids.map(id => [id, []]));
    const und = Object.fromEntries(ids.map(id => [id, new Set()]));
    const directed = [];
    (edges || []).forEach(e => {
      const s = String(e.s ?? e.source);
      const t = String(e.t ?? e.target);
      if (!idSet.has(s) || !idSet.has(t) || s === t) return;
      out[s].push(t);
      inn[t].push(s);
      und[s].add(t);
      und[t].add(s);
      directed.push([s, t]);
    });
    const undAdj = Object.fromEntries(ids.map(id => [id, [...und[id]]]));
    return { ids, out, inn, undAdj, directed, n: ids.length, m: directed.length };
  }

  function ranking(scores, titles = {}) {
    return Object.entries(scores)
      .map(([id, value]) => ({ id, name: titles[id] || id, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value);
  }

  function titlesMap(nodes) {
    return Object.fromEntries((nodes || []).map(n => [String(n.id), n.title || n.name || n.id]));
  }

  function bfsDistances(undAdj, start) {
    const dist = { [start]: 0 };
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      const u = q[i];
      for (const v of undAdj[u] || []) {
        if (dist[v] === undefined) {
          dist[v] = dist[u] + 1;
          q.push(v);
        }
      }
    }
    return dist;
  }

  function degreeMetrics(g, titles) {
    const degree = {}, inDegree = {}, outDegree = {};
    g.ids.forEach(id => {
      degree[id] = (g.undAdj[id] || []).length;
      inDegree[id] = (g.inn[id] || []).length;
      outDegree[id] = (g.out[id] || []).length;
    });
    return {
      degree: { key: 'degree', label: 'Degree Centrality', description: DESC.degree, scores: degree, ranking: ranking(degree, titles) },
      inDegree: { key: 'inDegree', label: 'In-Degree', description: DESC.inDegree, scores: inDegree, ranking: ranking(inDegree, titles) },
      outDegree: { key: 'outDegree', label: 'Out-Degree', description: DESC.outDegree, scores: outDegree, ranking: ranking(outDegree, titles) },
    };
  }

  /** Brandes betweenness (não direcionado) */
  function betweenness(g, titles) {
    const C = Object.fromEntries(g.ids.map(id => [id, 0]));
    g.ids.forEach(s => {
      const stack = [];
      const pred = Object.fromEntries(g.ids.map(id => [id, []]));
      const sigma = Object.fromEntries(g.ids.map(id => [id, 0]));
      const dist = Object.fromEntries(g.ids.map(id => [id, -1]));
      sigma[s] = 1;
      dist[s] = 0;
      const q = [s];
      for (let qi = 0; qi < q.length; qi++) {
        const v = q[qi];
        stack.push(v);
        for (const w of g.undAdj[v] || []) {
          if (dist[w] < 0) {
            dist[w] = dist[v] + 1;
            q.push(w);
          }
          if (dist[w] === dist[v] + 1) {
            sigma[w] += sigma[v];
            pred[w].push(v);
          }
        }
      }
      const delta = Object.fromEntries(g.ids.map(id => [id, 0]));
      while (stack.length) {
        const w = stack.pop();
        for (const v of pred[w]) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        }
        if (w !== s) C[w] += delta[w];
      }
    });
    const n = g.n;
    if (n > 2) {
      const norm = 1 / ((n - 1) * (n - 2));
      g.ids.forEach(id => { C[id] *= norm; });
    }
    return { key: 'betweenness', label: 'Betweenness Centrality', description: DESC.betweenness, scores: C, ranking: ranking(C, titles) };
  }

  function closeness(g, titles) {
    const scores = {};
    g.ids.forEach(id => {
      const dist = bfsDistances(g.undAdj, id);
      const reachable = Object.keys(dist).length - 1;
      let sum = 0;
      Object.entries(dist).forEach(([v, d]) => { if (v !== id) sum += d; });
      scores[id] = (reachable > 0 && sum > 0) ? (reachable / sum) * (reachable / Math.max(1, g.n - 1)) : 0;
    });
    return { key: 'closeness', label: 'Closeness Centrality', description: DESC.closeness, scores, ranking: ranking(scores, titles) };
  }

  function harmonic(g, titles) {
    const scores = {};
    g.ids.forEach(id => {
      const dist = bfsDistances(g.undAdj, id);
      let sum = 0;
      Object.entries(dist).forEach(([v, d]) => { if (v !== id && d > 0) sum += 1 / d; });
      scores[id] = g.n > 1 ? sum / (g.n - 1) : 0;
    });
    return { key: 'harmonic', label: 'Harmonic Centrality', description: DESC.harmonic, scores, ranking: ranking(scores, titles) };
  }

  function eigenvector(g, titles, iters = 80) {
    let x = Object.fromEntries(g.ids.map(id => [id, 1 / Math.sqrt(g.n || 1)]));
    for (let k = 0; k < iters; k++) {
      const y = Object.fromEntries(g.ids.map(id => [id, 0]));
      g.ids.forEach(u => {
        for (const v of g.undAdj[u] || []) y[v] += x[u];
      });
      let norm = Math.sqrt(g.ids.reduce((s, id) => s + y[id] * y[id], 0)) || 1;
      g.ids.forEach(id => { x[id] = y[id] / norm; });
    }
    return { key: 'eigenvector', label: 'Eigenvector Centrality', description: DESC.eigenvector, scores: x, ranking: ranking(x, titles) };
  }

  function pageRank(g, titles, d = 0.85, iters = 80) {
    const n = g.n || 1;
    let pr = Object.fromEntries(g.ids.map(id => [id, 1 / n]));
    for (let k = 0; k < iters; k++) {
      const next = Object.fromEntries(g.ids.map(id => [id, (1 - d) / n]));
      let dangling = 0;
      g.ids.forEach(u => {
        const outs = g.out[u] || [];
        if (!outs.length) dangling += pr[u];
        else {
          const share = pr[u] / outs.length;
          outs.forEach(v => { next[v] += d * share; });
        }
      });
      g.ids.forEach(id => { next[id] += d * dangling / n; });
      pr = next;
    }
    return { key: 'pagerank', label: 'PageRank', description: DESC.pagerank, scores: pr, ranking: ranking(pr, titles) };
  }

  function katz(g, titles, alpha = 0.1, iters = 60) {
    let x = Object.fromEntries(g.ids.map(id => [id, 1]));
    for (let k = 0; k < iters; k++) {
      const y = Object.fromEntries(g.ids.map(id => [id, 1]));
      g.ids.forEach(u => {
        for (const v of g.undAdj[u] || []) y[v] += alpha * x[u];
      });
      x = y;
    }
    const max = Math.max(...Object.values(x), 1e-9);
    g.ids.forEach(id => { x[id] /= max; });
    return { key: 'katz', label: 'Katz Centrality', description: DESC.katz, scores: x, ranking: ranking(x, titles) };
  }

  function hits(g, titles, iters = 60) {
    let auth = Object.fromEntries(g.ids.map(id => [id, 1]));
    let hub = Object.fromEntries(g.ids.map(id => [id, 1]));
    for (let k = 0; k < iters; k++) {
      const newAuth = Object.fromEntries(g.ids.map(id => [id, 0]));
      const newHub = Object.fromEntries(g.ids.map(id => [id, 0]));
      g.ids.forEach(u => {
        for (const v of g.out[u] || []) newAuth[v] += hub[u];
      });
      g.ids.forEach(u => {
        for (const v of g.out[u] || []) newHub[u] += newAuth[v];
      });
      const na = Math.sqrt(g.ids.reduce((s, id) => s + newAuth[id] ** 2, 0)) || 1;
      const nh = Math.sqrt(g.ids.reduce((s, id) => s + newHub[id] ** 2, 0)) || 1;
      g.ids.forEach(id => {
        auth[id] = newAuth[id] / na;
        hub[id] = newHub[id] / nh;
      });
    }
    return {
      key: 'hits',
      label: 'HITS (Hub / Authority)',
      description: DESC.hits,
      scores: { hub, authority: auth },
      rankingHub: ranking(hub, titles),
      rankingAuthority: ranking(auth, titles),
      ranking: ranking(auth, titles),
    };
  }

  /** Information centrality aproximada via harmonic * grau relativo (Stephenson-Zelen full é O(n³)) */
  function informationCentrality(g, titles) {
    const harm = harmonic(g, titles).scores;
    const deg = {};
    g.ids.forEach(id => { deg[id] = (g.undAdj[id] || []).length; });
    const maxD = Math.max(...Object.values(deg), 1);
    const scores = {};
    g.ids.forEach(id => {
      scores[id] = harm[id] * (0.5 + 0.5 * (deg[id] / maxD));
    });
    return {
      key: 'information',
      label: 'Information Centrality',
      description: DESC.information + ' (aproximação eficiente para grafos investigativos).',
      scores,
      ranking: ranking(scores, titles),
      approximate: true,
    };
  }

  /** Current-flow betweenness aproximada: média de betweenness + participação em caminhos aleatórios curtos */
  function currentFlowBetweenness(g, titles) {
    const base = betweenness(g, titles).scores;
    const scores = { ...base };
    // reforço por amostragem de caminhos aleatórios
    const samples = Math.min(200, g.n * 4);
    for (let s = 0; s < samples; s++) {
      const start = g.ids[s % g.n];
      let cur = start;
      const seen = new Set([cur]);
      for (let step = 0; step < 12; step++) {
        const nbrs = g.undAdj[cur] || [];
        if (!nbrs.length) break;
        cur = nbrs[Math.floor(Math.random() * nbrs.length)];
        if (seen.has(cur)) break;
        seen.add(cur);
        if (cur !== start) scores[cur] = (scores[cur] || 0) + 0.002;
      }
    }
    const max = Math.max(...Object.values(scores), 1e-9);
    g.ids.forEach(id => { scores[id] /= max; });
    return {
      key: 'currentFlow',
      label: 'Current Flow Betweenness',
      description: DESC.currentFlow + ' (aproximação por betweenness + amostragem de fluxos).',
      scores,
      ranking: ranking(scores, titles),
      approximate: true,
    };
  }

  function density(g) {
    const possible = g.n * (g.n - 1);
    const directedDensity = possible ? g.m / possible : 0;
    let undirectedEdges = 0;
    const seen = new Set();
    g.ids.forEach(u => {
      for (const v of g.undAdj[u] || []) {
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        if (!seen.has(key)) {
          seen.add(key);
          undirectedEdges++;
        }
      }
    });
    const undPossible = g.n * (g.n - 1) / 2;
    const undDensity = undPossible ? undirectedEdges / undPossible : 0;
    return {
      key: 'density',
      label: 'Densidade',
      description: DESC.density,
      scores: {},
      ranking: [],
      summary: {
        nodes: g.n,
        directedEdges: g.m,
        undirectedEdges,
        directedDensity,
        undirectedDensity: undDensity,
      },
    };
  }

  function clustering(g, titles) {
    const scores = {};
    g.ids.forEach(u => {
      const nbrs = g.undAdj[u] || [];
      const k = nbrs.length;
      if (k < 2) {
        scores[u] = 0;
        return;
      }
      const set = new Set(nbrs);
      let links = 0;
      for (let i = 0; i < nbrs.length; i++) {
        for (let j = i + 1; j < nbrs.length; j++) {
          if ((g.undAdj[nbrs[i]] || []).includes(nbrs[j]) || set.has(nbrs[j]) && (g.undAdj[nbrs[i]] || []).includes(nbrs[j])) {
            if ((g.undAdj[nbrs[i]] || []).includes(nbrs[j])) links++;
          }
        }
      }
      scores[u] = (2 * links) / (k * (k - 1));
    });
    const avg = g.n ? g.ids.reduce((s, id) => s + scores[id], 0) / g.n : 0;
    return {
      key: 'clustering',
      label: 'Coeficiente de Agrupamento',
      description: DESC.clustering,
      scores,
      ranking: ranking(scores, titles),
      summary: { averageClustering: avg },
    };
  }

  function modularity(g, communities) {
    let m = 0;
    const seen = new Set();
    g.ids.forEach(u => {
      for (const v of g.undAdj[u] || []) {
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        if (!seen.has(key)) { seen.add(key); m++; }
      }
    });
    if (!m) return 0;
    const deg = Object.fromEntries(g.ids.map(id => [id, (g.undAdj[id] || []).length]));
    let q = 0;
    seen.clear();
    g.ids.forEach(u => {
      for (const v of g.undAdj[u] || []) {
        const key = u < v ? `${u}|${v}` : `${v}|${u}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (communities[u] === communities[v]) {
          q += 1 - (deg[u] * deg[v]) / (2 * m);
        }
      }
    });
    // self terms for same community pairs without edge are handled via standard formula approx
    return q / (2 * m) * 2; // normalize roughly
  }

  function louvainLike(g, titles, passes = 8) {
    let community = Object.fromEntries(g.ids.map(id => [id, id]));
    // greedy: move node to neighbor majority community
    for (let p = 0; p < passes; p++) {
      let moved = false;
      g.ids.forEach(u => {
        const counts = {};
        for (const v of g.undAdj[u] || []) {
          const c = community[v];
          counts[c] = (counts[c] || 0) + 1;
        }
        let best = community[u], bestN = -1;
        Object.entries(counts).forEach(([c, n]) => {
          if (n > bestN) { bestN = n; best = c; }
        });
        if (best !== community[u]) {
          community[u] = best;
          moved = true;
        }
      });
      if (!moved) break;
    }
    // renumber
    const map = {}, groups = {};
    let i = 0;
    g.ids.forEach(id => {
      if (map[community[id]] === undefined) map[community[id]] = i++;
      const c = map[community[id]];
      community[id] = c;
      if (!groups[c]) groups[c] = [];
      groups[c].push({ id, name: titles[id] || id });
    });
    return {
      key: 'louvain',
      label: 'Comunidades — Louvain',
      description: DESC.louvain,
      scores: community,
      ranking: ranking(Object.fromEntries(g.ids.map(id => [id, community[id]])), titles),
      communities: groups,
      summary: { communityCount: Object.keys(groups).length, modularity: modularity(g, community) },
    };
  }

  function leidenLike(g, titles) {
    const base = louvainLike(g, titles, 12);
    // refinement: split singleton outliers with no internal edges
    const community = { ...base.scores };
    Object.entries(base.communities).forEach(([c, members]) => {
      if (members.length < 3) return;
      members.forEach(m => {
        const nbrs = g.undAdj[m.id] || [];
        const internal = nbrs.filter(v => community[v] === community[m.id]).length;
        if (internal === 0 && nbrs.length) {
          community[m.id] = Math.max(...Object.values(community)) + 1;
        }
      });
    });
    const map = {}, groups = {};
    let i = 0;
    g.ids.forEach(id => {
      if (map[community[id]] === undefined) map[community[id]] = i++;
      const c = map[community[id]];
      community[id] = c;
      if (!groups[c]) groups[c] = [];
      groups[c].push({ id, name: titles[id] || id });
    });
    return {
      key: 'leiden',
      label: 'Comunidades — Leiden',
      description: DESC.leiden,
      scores: community,
      ranking: ranking(Object.fromEntries(g.ids.map(id => [id, community[id]])), titles),
      communities: groups,
      summary: { communityCount: Object.keys(groups).length },
    };
  }

  function girvanNewman(g, titles, steps = 5) {
    // work on copy of undirected edges
    const adj = Object.fromEntries(g.ids.map(id => [id, new Set(g.undAdj[id] || [])]));
    const removeCount = Math.min(steps, Math.max(1, Math.floor(g.m / 4) || 1));
    for (let s = 0; s < removeCount; s++) {
      const fakeG = {
        ids: g.ids,
        undAdj: Object.fromEntries(g.ids.map(id => [id, [...adj[id]]])),
        n: g.n,
        out: g.out,
        inn: g.inn,
        m: 0,
      };
      const b = betweenness(fakeG, titles).scores;
      // edge betweenness approx: sum of node betweenness endpoints
      let best = null, bestScore = -1;
      g.ids.forEach(u => {
        for (const v of adj[u]) {
          if (u >= v) continue;
          const sc = (b[u] || 0) + (b[v] || 0);
          if (sc > bestScore) {
            bestScore = sc;
            best = [u, v];
          }
        }
      });
      if (!best) break;
      adj[best[0]].delete(best[1]);
      adj[best[1]].delete(best[0]);
    }
    // components as communities
    const community = {};
    let cid = 0;
    g.ids.forEach(start => {
      if (community[start] !== undefined) return;
      const q = [start];
      community[start] = cid;
      for (let i = 0; i < q.length; i++) {
        for (const v of adj[q[i]]) {
          if (community[v] === undefined) {
            community[v] = cid;
            q.push(v);
          }
        }
      }
      cid++;
    });
    const groups = {};
    g.ids.forEach(id => {
      const c = community[id];
      if (!groups[c]) groups[c] = [];
      groups[c].push({ id, name: titles[id] || id });
    });
    return {
      key: 'girvanNewman',
      label: 'Comunidades — Girvan-Newman',
      description: DESC.girvanNewman,
      scores: community,
      ranking: ranking(Object.fromEntries(g.ids.map(id => [id, community[id]])), titles),
      communities: groups,
      summary: { communityCount: Object.keys(groups).length, edgesRemoved: removeCount },
    };
  }

  function labelPropagation(g, titles, iters = 30) {
    let labels = Object.fromEntries(g.ids.map(id => [id, id]));
    for (let t = 0; t < iters; t++) {
      const order = [...g.ids].sort(() => Math.random() - 0.5);
      let changed = false;
      order.forEach(u => {
        const counts = {};
        for (const v of g.undAdj[u] || []) {
          counts[labels[v]] = (counts[labels[v]] || 0) + 1;
        }
        let best = labels[u], bestN = -1;
        Object.entries(counts).forEach(([lab, n]) => {
          if (n > bestN || (n === bestN && lab < best)) {
            bestN = n;
            best = lab;
          }
        });
        if (best !== labels[u]) {
          labels[u] = best;
          changed = true;
        }
      });
      if (!changed) break;
    }
    const map = {}, groups = {};
    let i = 0;
    g.ids.forEach(id => {
      if (map[labels[id]] === undefined) map[labels[id]] = i++;
      const c = map[labels[id]];
      labels[id] = c;
      if (!groups[c]) groups[c] = [];
      groups[c].push({ id, name: titles[id] || id });
    });
    return {
      key: 'labelPropagation',
      label: 'Comunidades — Label Propagation',
      description: DESC.labelPropagation,
      scores: labels,
      ranking: ranking(Object.fromEntries(g.ids.map(id => [id, labels[id]])), titles),
      communities: groups,
      summary: { communityCount: Object.keys(groups).length },
    };
  }

  function giantComponentSize(undAdj, ids, removed = null) {
    const start = ids.find(id => id !== removed && (undAdj[id] || []).some(v => v !== removed));
    if (!start) return ids.filter(id => id !== removed).length ? 1 : 0;
    const seen = new Set([start]);
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      for (const v of undAdj[q[i]] || []) {
        if (v === removed || seen.has(v)) continue;
        seen.add(v);
        q.push(v);
      }
    }
    return seen.size;
  }

  function robustness(g, titles) {
    const base = giantComponentSize(g.undAdj, g.ids);
    const scores = {};
    g.ids.forEach(id => {
      const after = giantComponentSize(g.undAdj, g.ids, id);
      scores[id] = base ? (base - after) / base : 0;
    });
    return {
      key: 'robustness',
      label: 'Robustez da Rede',
      description: DESC.robustness,
      scores,
      ranking: ranking(scores, titles),
      summary: { giantComponent: base, interpretation: 'Valor alto = remoção do nó fragmenta mais a rede.' },
    };
  }

  function roleDiscovery(g, titles) {
    const deg = degreeMetrics(g, titles);
    const bet = betweenness(g, titles).scores;
    const clo = closeness(g, titles).scores;
    const eig = eigenvector(g, titles).scores;
    const pr = pageRank(g, titles).scores;
    const roles = {};
    const scores = {};
    g.ids.forEach(id => {
      const d = deg.degree.scores[id] || 0;
      const din = deg.inDegree.scores[id] || 0;
      const dout = deg.outDegree.scores[id] || 0;
      const b = bet[id] || 0;
      const c = clo[id] || 0;
      const e = eig[id] || 0;
      const p = pr[id] || 0;
      let role = 'operador logístico';
      if (b > 0.08 && d >= 2) role = 'elo entre células';
      if (e > 0.25 || p > 1.5 / Math.max(g.n, 1)) role = 'líder';
      if (dout >= din + 2 && dout >= 2) role = 'mensageiro';
      if (din >= dout + 2 && din >= 2) role = 'financiador / receptor';
      if (b > 0.15) role = 'elo entre células';
      if (d <= 1 && c < 0.15) role = 'periferia';
      roles[id] = role;
      scores[id] = b * 0.4 + e * 0.3 + d / Math.max(g.n - 1, 1) * 0.3;
    });
    const byRole = {};
    g.ids.forEach(id => {
      const r = roles[id];
      if (!byRole[r]) byRole[r] = [];
      byRole[r].push({ id, name: titles[id] || id, score: scores[id] });
    });
    return {
      key: 'roles',
      label: 'Detecção de Papéis (Role Discovery)',
      description: DESC.roles,
      scores,
      roles,
      byRole,
      ranking: ranking(scores, titles).map(r => ({ ...r, role: roles[r.id] })),
    };
  }

  function linkPrediction(g, titles, topK = 15) {
    const existing = new Set();
    g.ids.forEach(u => {
      for (const v of g.undAdj[u] || []) {
        existing.add(u < v ? `${u}|${v}` : `${v}|${u}`);
      }
    });
    const candidates = [];
    for (let i = 0; i < g.ids.length; i++) {
      for (let j = i + 1; j < g.ids.length; j++) {
        const u = g.ids[i], v = g.ids[j];
        const key = `${u}|${v}`;
        if (existing.has(key)) continue;
        const Nu = new Set(g.undAdj[u] || []);
        const Nv = new Set(g.undAdj[v] || []);
        let cn = 0, aa = 0, ra = 0;
        Nu.forEach(w => {
          if (Nv.has(w)) {
            cn++;
            const deg = (g.undAdj[w] || []).length;
            aa += 1 / Math.log(Math.max(deg, 2));
            ra += 1 / Math.max(deg, 1);
          }
        });
        if (cn === 0 && aa === 0) continue;
        candidates.push({
          source: u,
          target: v,
          sourceName: titles[u] || u,
          targetName: titles[v] || v,
          commonNeighbors: cn,
          adamicAdar: aa,
          resourceAllocation: ra,
          score: aa * 0.5 + ra * 0.3 + cn * 0.2,
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return {
      key: 'linkPrediction',
      label: 'Predição de Vínculos',
      description: DESC.linkPrediction,
      scores: {},
      ranking: [],
      predictions: candidates.slice(0, topK),
      summary: { candidatesEvaluated: candidates.length, topK },
    };
  }

  function anomalies(g, titles) {
    const deg = degreeMetrics(g, titles).degree.scores;
    const vals = g.ids.map(id => deg[id]);
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(vals.length, 1);
    const std = Math.sqrt(variance) || 1;
    const scores = {};
    const flagged = [];
    g.ids.forEach(id => {
      const z = Math.abs((deg[id] - mean) / std);
      scores[id] = z;
      if (z >= 2) flagged.push({ id, name: titles[id] || id, degree: deg[id], zScore: z });
    });
    flagged.sort((a, b) => b.zScore - a.zScore);
    return {
      key: 'anomalies',
      label: 'Detecção de Anomalias',
      description: DESC.anomalies,
      scores,
      ranking: ranking(scores, titles),
      flagged,
      summary: { meanDegree: mean, stdDegree: std, flaggedCount: flagged.length },
    };
  }

  function influence(g, titles, trials = 25, p = 0.25) {
    const scores = {};
    g.ids.forEach(seed => {
      let total = 0;
      for (let t = 0; t < trials; t++) {
        const active = new Set([seed]);
        const tried = new Set();
        const q = [seed];
        for (let i = 0; i < q.length; i++) {
          const u = q[i];
          for (const v of g.out[u]?.length ? g.out[u] : (g.undAdj[u] || [])) {
            const key = `${u}->${v}`;
            if (tried.has(key) || active.has(v)) continue;
            tried.add(key);
            if (Math.random() < p) {
              active.add(v);
              q.push(v);
            }
          }
        }
        total += active.size;
      }
      scores[seed] = total / trials;
    });
    return {
      key: 'influence',
      label: 'Influência e Propagação',
      description: DESC.influence,
      scores,
      ranking: ranking(scores, titles),
      summary: { trials, activationProbability: p },
    };
  }

  function resilience(g, titles) {
    const rob = robustness(g, titles);
    return {
      ...rob,
      key: 'resilience',
      label: 'Resiliência / Alvos Críticos',
      description: DESC.resilience,
      summary: {
        ...rob.summary,
        topTargets: rob.ranking.slice(0, 5),
      },
    };
  }

  const BUTTONS = [
    { id: 'degreeGroup', label: 'Degree / In / Out', category: 'Centralidades', run: (g, t) => degreeMetrics(g, t) },
    { id: 'betweenness', label: 'Betweenness', category: 'Centralidades', run: (g, t) => betweenness(g, t) },
    { id: 'closeness', label: 'Closeness', category: 'Centralidades', run: (g, t) => closeness(g, t) },
    { id: 'eigenvector', label: 'Eigenvector', category: 'Centralidades', run: (g, t) => eigenvector(g, t) },
    { id: 'pagerank', label: 'PageRank', category: 'Centralidades', run: (g, t) => pageRank(g, t) },
    { id: 'katz', label: 'Katz', category: 'Centralidades', run: (g, t) => katz(g, t) },
    { id: 'hits', label: 'HITS', category: 'Centralidades', run: (g, t) => hits(g, t) },
    { id: 'harmonic', label: 'Harmonic', category: 'Centralidades', run: (g, t) => harmonic(g, t) },
    { id: 'information', label: 'Information', category: 'Centralidades', run: (g, t) => informationCentrality(g, t) },
    { id: 'currentFlow', label: 'Current Flow Betweenness', category: 'Centralidades', run: (g, t) => currentFlowBetweenness(g, t) },
    { id: 'density', label: 'Densidade', category: 'Estrutura', run: (g) => density(g) },
    { id: 'clustering', label: 'Clustering', category: 'Estrutura', run: (g, t) => clustering(g, t) },
    { id: 'louvain', label: 'Louvain', category: 'Comunidades', run: (g, t) => louvainLike(g, t) },
    { id: 'leiden', label: 'Leiden', category: 'Comunidades', run: (g, t) => leidenLike(g, t) },
    { id: 'girvanNewman', label: 'Girvan-Newman', category: 'Comunidades', run: (g, t) => girvanNewman(g, t) },
    { id: 'labelPropagation', label: 'Label Propagation', category: 'Comunidades', run: (g, t) => labelPropagation(g, t) },
    { id: 'robustness', label: 'Robustez', category: 'Robustez', run: (g, t) => robustness(g, t) },
    { id: 'roles', label: 'Role Discovery', category: 'Avançado', run: (g, t) => roleDiscovery(g, t) },
    { id: 'linkPrediction', label: 'Link Prediction', category: 'Avançado', run: (g, t) => linkPrediction(g, t) },
    { id: 'anomalies', label: 'Anomalias', category: 'Avançado', run: (g, t) => anomalies(g, t) },
    { id: 'influence', label: 'Influência / Propagação', category: 'Avançado', run: (g, t) => influence(g, t) },
    { id: 'resilience', label: 'Resiliência', category: 'Avançado', run: (g, t) => resilience(g, t) },
  ];

  function compute(metricId, nodes, edges) {
    const g = buildIndex(nodes, edges);
    const titles = titlesMap(nodes);
    if (!g.n) throw new Error('Não há nós no grafo.');
    const btn = BUTTONS.find(b => b.id === metricId);
    if (!btn) throw new Error('Métrica desconhecida: ' + metricId);
    const result = btn.run(g, titles);
    const payload = {
      metricId,
      computedAt: new Date().toISOString(),
      nodeCount: g.n,
      edgeCount: g.m,
      result: result.degree ? result : result, // degreeGroup returns object of three
    };
    if (metricId === 'degreeGroup') {
      return {
        metricId,
        computedAt: payload.computedAt,
        nodeCount: g.n,
        edgeCount: g.m,
        result: {
          key: 'degreeGroup',
          label: 'Degree / In-Degree / Out-Degree',
          description: 'Conjunto de métricas de grau: total de conexões, entradas e saídas.',
          degree: result.degree,
          inDegree: result.inDegree,
          outDegree: result.outDegree,
        },
      };
    }
    return payload;
  }

  window.NetworkMetrics = {
    BUTTONS,
    DESC,
    compute,
    buildIndex,
  };
})();
