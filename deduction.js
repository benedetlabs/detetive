/**
 * Motor de Dedução e Lógica Matemática do Crime (Detetive Estrela)
 */

export const STATUS_UNKNOWN = 0;   // ? (Desconhecido)
export const STATUS_NOT_HAS = 1;   // ❌ (Não possui / Eliminada)
export const STATUS_HAS = 2;       // ✔ (Possui a carta)
export const STATUS_ENVELOPE = 3;  // 🔍 (Confirmado no Envelope)

/**
 * Recalcula as probabilidades e candidatos do crime
 */
export function calculateDeductions(state) {
  const { preset, players, grid } = state;
  const envelopeColIndex = players.length; // A última coluna é o Envelope

  const categories = [
    { key: "suspects", title: "Suspeito", items: preset.suspects },
    { key: "weapons", title: "Arma", items: preset.weapons },
    { key: "locations", title: "Local", items: preset.locations }
  ];

  const results = {
    suspects: { remaining: [], solved: null, total: preset.suspects.length },
    weapons: { remaining: [], solved: null, total: preset.weapons.length },
    locations: { remaining: [], solved: null, total: preset.locations.length },
    autoInferencesMade: []
  };

  categories.forEach(cat => {
    cat.items.forEach(cardName => {
      const cardRow = grid[cardName] || Array(players.length + 1).fill(STATUS_UNKNOWN);

      // Verificar se algum jogador possui esta carta
      let holderPlayerIndex = -1;
      let allPlayersNotHas = true;

      for (let i = 0; i < players.length; i++) {
        if (cardRow[i] === STATUS_HAS) {
          holderPlayerIndex = i;
        }
        if (cardRow[i] !== STATUS_NOT_HAS) {
          allPlayersNotHas = false;
        }
      }

      const envelopeStatus = cardRow[envelopeColIndex];

      // Se a carta foi explicitamente marcada no envelope OU se TODOS os jogadores não a têm
      if (envelopeStatus === STATUS_ENVELOPE || (allPlayersNotHas && envelopeStatus !== STATUS_NOT_HAS)) {
        results[cat.key].solved = cardName;
        results[cat.key].remaining = [cardName];
      } 
      // A carta PODE estar no envelope se NENHUM jogador a tiver E o envelope não estiver marcado como NOT_HAS
      else if (holderPlayerIndex === -1 && envelopeStatus !== STATUS_NOT_HAS) {
        results[cat.key].remaining.push(cardName);
      }
    });

    // Se sobrou apenas 1 candidato possível, ele é a solução!
    if (results[cat.key].remaining.length === 1) {
      results[cat.key].solved = results[cat.key].remaining[0];
    }
  });

  return results;
}

/**
 * Propaga auto-deduções lógicas pela grade
 * Exemplo: Se Jogador 1 tem a carta X, nenhum outro jogador pode tê-la e ela não pode estar no envelope.
 */
export function applyAutoInferences(state) {
  const { preset, players, grid } = state;
  const envelopeColIndex = players.length;
  let changesMade = 0;

  const allCards = [...preset.suspects, ...preset.weapons, ...preset.locations];

  allCards.forEach(cardName => {
    if (!grid[cardName]) {
      grid[cardName] = Array(players.length + 1).fill(STATUS_UNKNOWN);
    }
    const cardRow = grid[cardName];

    // Regra 1: Se alguém tem a carta, marque ❌ para todos os outros e no envelope
    const holderIndex = cardRow.findIndex((status, idx) => idx < players.length && status === STATUS_HAS);
    if (holderIndex !== -1) {
      for (let i = 0; i <= players.length; i++) {
        if (i !== holderIndex && cardRow[i] === STATUS_UNKNOWN) {
          cardRow[i] = STATUS_NOT_HAS;
          changesMade++;
        }
      }
    }

    // Regra 2: Se a carta foi confirmada no envelope (STATUS_ENVELOPE), marque ❌ para todos os jogadores
    if (cardRow[envelopeColIndex] === STATUS_ENVELOPE) {
      for (let i = 0; i < players.length; i++) {
        if (cardRow[i] === STATUS_UNKNOWN) {
          cardRow[i] = STATUS_NOT_HAS;
          changesMade++;
        }
      }
    }

    // Regra 3: Se todos os jogadores têm ❌ para essa carta, ela DEVE estar no envelope
    let allPlayersNotHas = true;
    for (let i = 0; i < players.length; i++) {
      if (cardRow[i] !== STATUS_NOT_HAS) {
        allPlayersNotHas = false;
        break;
      }
    }
    if (allPlayersNotHas && cardRow[envelopeColIndex] === STATUS_UNKNOWN) {
      cardRow[envelopeColIndex] = STATUS_ENVELOPE;
      changesMade++;
    }
  });

  return changesMade;
}
