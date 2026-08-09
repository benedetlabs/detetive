import { GAME_PRESETS } from './presets.js';
import { 
  STATUS_UNKNOWN, 
  STATUS_NOT_HAS, 
  STATUS_HAS, 
  STATUS_ENVELOPE,
  calculateDeductions,
  applyAutoInferences 
} from './deduction.js';

const STORAGE_KEY = 'detetive_estrela_app_state_v1';

let state = {
  presetKey: 'classico',
  preset: GAME_PRESETS.classico,
  players: ['Você', 'Jogador 2', 'Jogador 3', 'Jogador 4'],
  grid: {},
  history: []
};

let activeCellTarget = null; // { cardName, colIdx }

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('ServiceWorker error: ', err);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initUI();
  renderAll();
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.presetKey && GAME_PRESETS[parsed.presetKey]) {
        state = parsed;
        state.preset = GAME_PRESETS[parsed.presetKey];
        return;
      }
    } catch (e) {
      console.warn("Falha ao carregar estado salvo.", e);
    }
  }
  resetState('classico', ['Você', 'Jogador 2', 'Jogador 3', 'Jogador 4']);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState(presetKey, playersList) {
  state.presetKey = presetKey;
  state.preset = GAME_PRESETS[presetKey] || GAME_PRESETS.classico;
  state.players = playersList;
  state.grid = {};
  state.history = [];

  const allCards = [...state.preset.suspects, ...state.preset.weapons, ...state.preset.locations];
  allCards.forEach(card => {
    state.grid[card] = Array(state.players.length + 1).fill(STATUS_UNKNOWN);
  });

  saveState();
}

function initUI() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabId = e.currentTarget.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      e.currentTarget.classList.add('active');
      document.getElementById(tabId).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  document.getElementById('btnMyHand').addEventListener('click', openMyHandModal);
  document.getElementById('btnNewGame').addEventListener('click', openNewGameModal);
  document.getElementById('btnClearSheet').addEventListener('click', () => {
    if (confirm("Deseja realmente limpar todas as marcações da tabela?")) {
      resetState(state.presetKey, state.players);
      renderAll();
    }
  });

  document.getElementById('inputCardFilter').addEventListener('input', (e) => {
    renderGridTable(e.target.value.trim().toLowerCase());
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.getAttribute('data-close');
      document.getElementById(modalId).classList.remove('active');
    });
  });

  document.querySelectorAll('.picker-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = parseInt(e.currentTarget.getAttribute('data-val'), 10);
      if (activeCellTarget) {
        state.grid[activeCellTarget.cardName][activeCellTarget.colIdx] = val;
        document.getElementById('modalStatusPicker').classList.remove('active');
        activeCellTarget = null;
        renderAll();
      }
    });
  });

  document.getElementById('btnConfirmHand').addEventListener('click', saveInitialHand);
  setupNewGameForm();
  setupSuggestionForm();

  document.getElementById('btnClearLog').addEventListener('click', () => {
    state.history = [];
    saveState();
    renderHistory();
  });
}

function renderAll() {
  applyAutoInferences(state);
  saveState();

  const deductions = calculateDeductions(state);
  renderGridTable("", deductions);
  renderDeductions(deductions);
  renderHistory();
  populateDropdowns();
}

/* ==========================================================================
   RENDERIZAÇÃO DA TABELA COM BADGES DE PORCENTAGEM
   ========================================================================== */

function renderGridTable(filterText = "", deductions = null) {
  if (!deductions) {
    deductions = calculateDeductions(state);
  }

  const headerRow = document.getElementById('tableHeaderRow');
  const tbody = document.getElementById('tableBody');

  headerRow.innerHTML = `
    <th class="col-card-name">Cartas do Crime</th>
    ${state.players.map(p => `<th>${escapeHtml(p)}</th>`).join('')}
    <th style="color: var(--accent-gold); border-left: 2px solid var(--accent-gold);">Envelope 🔍</th>
  `;

  const categories = [
    { title: "🕵️ SUSPEITOS", cards: state.preset.suspects },
    { title: "🔪 ARMAS", cards: state.preset.weapons },
    { title: "🏰 LOCAIS", cards: state.preset.locations }
  ];

  let html = "";

  categories.forEach(cat => {
    const filteredCards = cat.cards.filter(c => c.toLowerCase().includes(filterText));
    if (filteredCards.length === 0) return;

    html += `
      <tr class="category-row">
        <th colspan="${state.players.length + 2}">${cat.title}</th>
      </tr>
    `;

    filteredCards.forEach(cardName => {
      if (!state.grid[cardName]) {
        state.grid[cardName] = Array(state.players.length + 1).fill(STATUS_UNKNOWN);
      }
      const rowStatus = state.grid[cardName];
      const cardInfo = deductions.cardStatusInfo[cardName] || { chancePct: 0, isSolved: false, isEliminated: false };

      let badgeHtml = "";
      if (cardInfo.isSolved) {
        badgeHtml = `<span class="prob-badge solved">🎯 100%</span>`;
      } else if (cardInfo.chancePct > 0) {
        badgeHtml = `<span class="prob-badge candidate">${cardInfo.chancePct}%</span>`;
      } else {
        badgeHtml = `<span class="prob-badge zero">0%</span>`;
      }

      html += `<tr>`;
      html += `
        <td class="cell-card-name">
          <span>${escapeHtml(cardName)}</span>
          ${badgeHtml}
        </td>
      `;

      for (let colIdx = 0; colIdx <= state.players.length; colIdx++) {
        const status = rowStatus[colIdx] || STATUS_UNKNOWN;
        const isEnvelope = colIdx === state.players.length;
        const borderStyle = isEnvelope ? 'border-left: 2px solid var(--accent-gold);' : '';

        html += `
          <td class="cell-mark" 
              style="${borderStyle}"
              data-card="${escapeHtml(cardName)}" 
              data-col="${colIdx}" 
              data-status="${status}">
            ${getStatusIcon(status)}
          </td>
        `;
      }

      html += `</tr>`;
    });
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.cell-mark').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const cardName = e.currentTarget.getAttribute('data-card');
      const colIdx = parseInt(e.currentTarget.getAttribute('data-col'), 10);
      let currentStatus = parseInt(e.currentTarget.getAttribute('data-status'), 10);

      if (window.innerWidth <= 768) {
        activeCellTarget = { cardName, colIdx };
        const playerName = colIdx === state.players.length ? "Envelope 🔍" : state.players[colIdx];
        document.getElementById('pickerCardTitle').textContent = cardName;
        document.getElementById('pickerSubtitle').textContent = `Marcar status para: ${playerName}`;
        document.getElementById('modalStatusPicker').classList.add('active');
      } else {
        let nextStatus = (currentStatus + 1) % 4;
        state.grid[cardName][colIdx] = nextStatus;
        renderAll();
      }
    });
  });
}

function getStatusIcon(status) {
  switch (status) {
    case STATUS_NOT_HAS: return '❌';
    case STATUS_HAS: return '✔';
    case STATUS_ENVELOPE: return '🔍';
    default: return '?';
  }
}

/* ==========================================================================
   PAINEL DEDICADO DE PROBABILIDADES E BARRAS DE PROGRESSO (%)
   ========================================================================== */

function renderDeductions(deductions = null) {
  if (!deductions) {
    deductions = calculateDeductions(state);
  }

  const categories = [
    { key: 'suspects', label: 'Suspeito', icon: '👤', candEl: 'candidatesSuspect', probEl: 'probSuspect', items: state.preset.suspects },
    { key: 'weapons', label: 'Arma', icon: '🔪', candEl: 'candidatesWeapon', probEl: 'probWeapon', items: state.preset.weapons },
    { key: 'locations', label: 'Local', icon: '🏰', candEl: 'candidatesLocation', probEl: 'probLocation', items: state.preset.locations }
  ];

  let totalCombinations = 1;

  categories.forEach(cat => {
    const data = deductions[cat.key];
    const candContainer = document.getElementById(cat.candEl);
    const probContainer = document.getElementById(cat.probEl);

    totalCombinations *= data.remaining.length;

    if (data.solved) {
      probContainer.innerHTML = `<span style="color: var(--accent-green);">🎯 SOLUCIONADO</span>`;
      candContainer.innerHTML = `<span class="tag resolved">🎯 ${escapeHtml(data.solved)}</span>`;
    } else {
      const probPct = Math.round(100 / data.remaining.length);
      probContainer.textContent = `${data.remaining.length} opções (${probPct}% cada)`;

      candContainer.innerHTML = data.remaining.map(item => `
        <span class="tag probable">${escapeHtml(item)}</span>
      `).join('');
    }
  });

  const badgePossibilities = document.getElementById('badgePossibilities');
  if (badgePossibilities) {
    badgePossibilities.textContent = `${totalCombinations}`;
  }

  // Renderizar Barras de Progresso Detalhadas de Probabilidade por Carta na Aba Crime
  const detailedView = document.getElementById('detailedDeductionView');
  if (detailedView) {
    let html = "";
    categories.forEach(cat => {
      html += `
        <div style="background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.85rem; margin-bottom: 0.5rem;">
          <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-gold); margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
            <span>${cat.icon} ${cat.label}s</span>
            <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">
              ${deductions[cat.key].solved ? '🎯 Solucionado' : `${deductions[cat.key].remaining.length} candidatos`}
            </span>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
      `;

      cat.items.forEach(cardName => {
        const info = deductions.cardStatusInfo[cardName] || { chancePct: 0, statusText: '', isSolved: false, isEliminated: false };
        const pct = info.chancePct;

        let fillClass = "fill-zero";
        let pctClass = "pct-zero";
        if (info.isSolved) {
          fillClass = "fill-solved";
          pctClass = "pct-100";
        } else if (pct > 0) {
          fillClass = "fill-cand";
          pctClass = "pct-cand";
        }

        html += `
          <div class="prob-card-row ${info.isSolved ? 'solved-row' : ''}">
            <div class="prob-row-header">
              <span class="card-title">${escapeHtml(cardName)}</span>
              <span class="card-pct ${pctClass}">${pct}%</span>
            </div>
            <div class="prob-bar-container">
              <div class="prob-bar-fill ${fillClass}" style="width: ${pct}%;"></div>
            </div>
            <div class="prob-row-footer">
              <span>${escapeHtml(info.statusText)}</span>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });
    detailedView.innerHTML = html;
  }
}

/* ==========================================================================
   MINHA MÃO INICIAL
   ========================================================================== */

function openMyHandModal() {
  const container = document.getElementById('handSelectionList');
  const allCards = [...state.preset.suspects, ...state.preset.weapons, ...state.preset.locations];

  container.innerHTML = allCards.map(card => {
    const isSelected = state.grid[card] && state.grid[card][0] === STATUS_HAS;
    return `
      <div class="hand-card-item ${isSelected ? 'selected' : ''}" data-card="${escapeHtml(card)}">
        <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events: none;">
        <span>${escapeHtml(card)}</span>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.hand-card-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('selected');
      const chk = item.querySelector('input');
      chk.checked = !chk.checked;
    });
  });

  document.getElementById('modalMyHand').classList.add('active');
}

function saveInitialHand() {
  const selectedCards = [];
  document.querySelectorAll('#handSelectionList .hand-card-item.selected').forEach(item => {
    selectedCards.push(item.getAttribute('data-card'));
  });

  const allCards = [...state.preset.suspects, ...state.preset.weapons, ...state.preset.locations];

  allCards.forEach(card => {
    if (!state.grid[card]) {
      state.grid[card] = Array(state.players.length + 1).fill(STATUS_UNKNOWN);
    }

    if (selectedCards.includes(card)) {
      state.grid[card][0] = STATUS_HAS;
    } else if (state.grid[card][0] === STATUS_HAS) {
      state.grid[card][0] = STATUS_UNKNOWN;
    }
  });

  document.getElementById('modalMyHand').classList.remove('active');
  renderAll();
}

/* ==========================================================================
   NOVA PARTIDA
   ========================================================================== */

function openNewGameModal() {
  const selectPreset = document.getElementById('selectPreset');
  selectPreset.innerHTML = Object.keys(GAME_PRESETS).map(key => `
    <option value="${key}" ${key === state.presetKey ? 'selected' : ''}>
      ${escapeHtml(GAME_PRESETS[key].name)}
    </option>
  `).join('');

  const inputPlayerCount = document.getElementById('inputPlayerCount');
  inputPlayerCount.value = state.players.length;

  renderPlayerNameInputs(state.players.length, state.players);

  inputPlayerCount.onchange = (e) => {
    const count = parseInt(e.target.value, 10);
    renderPlayerNameInputs(count);
  };

  document.getElementById('modalNewGame').classList.add('active');
}

function renderPlayerNameInputs(count, existingNames = []) {
  const container = document.getElementById('playerNamesInputs');
  let html = "";
  for (let i = 0; i < count; i++) {
    const defaultName = i === 0 ? "Você" : `Jogador ${i + 1}`;
    const val = existingNames[i] || defaultName;
    html += `
      <input type="text" class="form-control player-name-input" value="${escapeHtml(val)}" placeholder="Jogador ${i + 1}" required>
    `;
  }
  container.innerHTML = html;
}

function setupNewGameForm() {
  document.getElementById('formNewGame').addEventListener('submit', (e) => {
    e.preventDefault();
    const presetKey = document.getElementById('selectPreset').value;
    const nameInputs = document.querySelectorAll('.player-name-input');
    const playersList = Array.from(nameInputs).map(inp => inp.value.trim() || 'Jogador');

    resetState(presetKey, playersList);
    document.getElementById('modalNewGame').classList.remove('active');
    renderAll();
  });
}

/* ==========================================================================
   HISTÓRICO E PALPITES
   ========================================================================== */

function populateDropdowns() {
  const selectAsker = document.getElementById('selectAsker');
  const selectAnswerer = document.getElementById('selectAnswerer');
  const selectSuspect = document.getElementById('selectAskedSuspect');
  const selectWeapon = document.getElementById('selectAskedWeapon');
  const selectLocation = document.getElementById('selectAskedLocation');
  const selectCardShown = document.getElementById('selectCardShown');

  if (!selectAsker) return;

  const playerOpts = state.players.map((p, i) => `<option value="${i}">${escapeHtml(p)}</option>`).join('');
  selectAsker.innerHTML = playerOpts;
  selectAnswerer.innerHTML = playerOpts;

  selectSuspect.innerHTML = state.preset.suspects.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  selectWeapon.innerHTML = state.preset.weapons.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
  selectLocation.innerHTML = state.preset.locations.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');

  selectCardShown.innerHTML = `
    <option value="">Não vi (apenas mostrou para outro jogador)</option>
    ${state.preset.suspects.map(s => `<option value="${escapeHtml(s)}">Suspeito: ${escapeHtml(s)}</option>`).join('')}
    ${state.preset.weapons.map(w => `<option value="${escapeHtml(w)}">Arma: ${escapeHtml(w)}</option>`).join('')}
    ${state.preset.locations.map(l => `<option value="${escapeHtml(l)}">Local: ${escapeHtml(l)}</option>`).join('')}
  `;
}

function setupSuggestionForm() {
  document.getElementById('formSuggestion').addEventListener('submit', (e) => {
    e.preventDefault();

    const askerIdx = parseInt(document.getElementById('selectAsker').value, 10);
    const answererIdx = parseInt(document.getElementById('selectAnswerer').value, 10);
    const askedSuspect = document.getElementById('selectAskedSuspect').value;
    const askedWeapon = document.getElementById('selectAskedWeapon').value;
    const askedLocation = document.getElementById('selectAskedLocation').value;
    const cardShown = document.getElementById('selectCardShown').value;

    const askerName = state.players[askerIdx];
    const answererName = state.players[answererIdx];

    let logText = `${askerName} perguntou a ${answererName} sobre [${askedSuspect}, ${askedWeapon}, ${askedLocation}].`;
    let inferred = null;

    if (cardShown) {
      state.grid[cardShown][answererIdx] = STATUS_HAS;
      logText += ` ${answererName} mostrou a carta: ${cardShown}.`;
    } else {
      logText += ` ${answererName} mostrou uma carta em segredo.`;
      const askedThree = [askedSuspect, askedWeapon, askedLocation];
      const notHasCount = askedThree.filter(c => state.grid[c] && state.grid[c][answererIdx] === STATUS_NOT_HAS).length;

      if (notHasCount === 2) {
        const thirdCard = askedThree.find(c => state.grid[c] && state.grid[c][answererIdx] !== STATUS_NOT_HAS);
        if (thirdCard) {
          state.grid[thirdCard][answererIdx] = STATUS_HAS;
          inferred = thirdCard;
          logText += ` 💡 DEDUÇÃO: Como ${answererName} não possui 2 das cartas, ele DEVE possuir "${thirdCard}"!`;
        }
      }
    }

    state.history.unshift({
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: logText,
      inferred
    });

    renderAll();
    alert("Palpite registrado!");
  });
}

function renderHistory() {
  const container = document.getElementById('logList');
  if (!container) return;

  if (state.history.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 2rem;">
        Nenhum palpite registrado nesta partida ainda.
      </div>
    `;
    return;
  }

  container.innerHTML = state.history.map(item => `
    <div class="log-item ${item.inferred ? 'auto-inferred' : ''}">
      <div class="log-content">
        <div>${escapeHtml(item.text)}</div>
        <div class="log-time">${item.timestamp}</div>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
