(() => {
  const HUMAN = "X";
  const AI = "O";
  const LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  /** @type {'regular'|'ultimate'} */
  let mode = "regular";
  /** @type {'easy'|'medium'|'hard'} */
  let difficulty = "medium";

  // Regular state
  /** @type {(string|null)[]} */
  let rBoard = Array(9).fill(null);
  let rTurn = HUMAN;
  let rLocked = false;

  // Ultimate state
  /** @type {(string|null)[]} */
  let uCells = Array(81).fill(null); // 9 local boards * 9 cells
  /** @type {(string|null)[]} */
  let uLocalWinners = Array(9).fill(null); // 'X' | 'O' | 'D' | null
  /** @type {number|null} */
  let uForcedLocal = null; // 0..8 local board index, or null = any
  let uTurn = HUMAN;
  let uLocked = false;

  const elBoard = /** @type {HTMLDivElement} */ (document.getElementById("board"));
  const elStatus = /** @type {HTMLDivElement} */ (document.getElementById("status"));
  const elMode = /** @type {HTMLSelectElement} */ (document.getElementById("mode"));
  const elDifficulty = /** @type {HTMLSelectElement} */ (document.getElementById("difficulty"));
  const elNewGame = /** @type {HTMLButtonElement} */ (document.getElementById("newGame"));
  const elHintBtn = /** @type {HTMLButtonElement} */ (document.getElementById("hintBtn"));

  const elDialog = /** @type {HTMLDialogElement} */ (document.getElementById("resultDialog"));
  const elResultTitle = /** @type {HTMLHeadingElement} */ (document.getElementById("resultTitle"));
  const elResultText = /** @type {HTMLParagraphElement} */ (document.getElementById("resultText"));
  const elPlayAgain = /** @type {HTMLButtonElement} */ (document.getElementById("playAgain"));
  const elCloseDialog = /** @type {HTMLButtonElement} */ (document.getElementById("closeDialog"));

  const elAdvLabel = /** @type {HTMLDivElement} */ (document.getElementById("advLabel"));
  const elAdvPct = /** @type {HTMLDivElement} */ (document.getElementById("advPct"));
  const elAdvBar = /** @type {HTMLDivElement} */ (document.querySelector(".advBar"));
  const elAdvFill = /** @type {HTMLDivElement} */ (document.getElementById("advFill"));
  /** @type {{mode:'regular', idx:number} | {mode:'ultimate', lb:number, c:number} | null} */
  let hintMove = null;

  function setStatus(text) {
    elStatus.textContent = text;
  }

  function closeDialog() {
    if (elDialog.open) elDialog.close();
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function setAdvantage({ pct, label }) {
    const p = clamp(Math.round(pct), 0, 100);
    elAdvLabel.textContent = label;
    elAdvPct.textContent = `${p}% you`;
    elAdvFill.style.width = `${p}%`;
    elAdvBar.setAttribute("aria-valuenow", String(p));
  }

  // ---------------------------
  // Regular helpers + AI
  // ---------------------------

  function rAvailableMoves(state) {
    const moves = [];
    for (let i = 0; i < 9; i++) if (!state[i]) moves.push(i);
    return moves;
  }

  function rWinnerOf(state) {
    for (const [a, b, c] of LINES) {
      const v = state[a];
      if (v && v === state[b] && v === state[c]) return { winner: v, line: [a, b, c] };
    }
    return { winner: null, line: null };
  }

  function rIsDraw(state) {
    return rAvailableMoves(state).length === 0 && !rWinnerOf(state).winner;
  }

  function rScoreBoard(state, depth) {
    const w = rWinnerOf(state).winner;
    if (w === AI) return 10 - depth;
    if (w === HUMAN) return depth - 10;
    return 0;
  }

  function rMinimax(state, depth, isMaximizing, alpha, beta) {
    const w = rWinnerOf(state).winner;
    if (w || rAvailableMoves(state).length === 0) return { score: rScoreBoard(state, depth), move: null };

    if (isMaximizing) {
      let bestScore = -Infinity;
      /** @type {number|null} */
      let bestMove = null;
      for (const idx of rAvailableMoves(state)) {
        const next = state.slice();
        next[idx] = AI;
        const res = rMinimax(next, depth + 1, false, alpha, beta);
        if (res.score > bestScore) {
          bestScore = res.score;
          bestMove = idx;
        }
        alpha = Math.max(alpha, bestScore);
        if (beta <= alpha) break;
      }
      return { score: bestScore, move: bestMove };
    }

    let bestScore = Infinity;
    /** @type {number|null} */
    let bestMove = null;
    for (const idx of rAvailableMoves(state)) {
      const next = state.slice();
      next[idx] = HUMAN;
      const res = rMinimax(next, depth + 1, true, alpha, beta);
      if (res.score < bestScore) {
        bestScore = res.score;
        bestMove = idx;
      }
      beta = Math.min(beta, bestScore);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }

  function rFindImmediateMove(state, player) {
    for (const idx of rAvailableMoves(state)) {
      const next = state.slice();
      next[idx] = player;
      if (rWinnerOf(next).winner === player) return idx;
    }
    return null;
  }

  function rPickRandomMove(state) {
    const moves = rAvailableMoves(state);
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function rHeuristicMove(state) {
    const win = rFindImmediateMove(state, AI);
    if (win !== null) return win;
    const block = rFindImmediateMove(state, HUMAN);
    if (block !== null) return block;
    if (!state[4]) return 4;
    const corners = [0, 2, 6, 8].filter((i) => !state[i]);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    const edges = [1, 3, 5, 7].filter((i) => !state[i]);
    return edges[Math.floor(Math.random() * edges.length)];
  }

  function rEvaluatePosition(state) {
    let score = 0;
    if (state[4] === AI) score += 3;
    if (state[4] === HUMAN) score -= 3;
    for (const i of [0, 2, 6, 8]) {
      if (state[i] === AI) score += 1;
      if (state[i] === HUMAN) score -= 1;
    }
    for (const [a, b, c] of LINES) {
      const line = [state[a], state[b], state[c]];
      const aiCount = line.filter((v) => v === AI).length;
      const humanCount = line.filter((v) => v === HUMAN).length;
      if (aiCount && !humanCount) score += aiCount;
      if (humanCount && !aiCount) score -= humanCount;
    }
    return score;
  }

  function rMediumScore(state, depth, isMaximizing) {
    const w = rWinnerOf(state).winner;
    if (w || depth >= 2 || rAvailableMoves(state).length === 0) {
      if (w === AI) return 100 - depth;
      if (w === HUMAN) return depth - 100;
      return rEvaluatePosition(state);
    }
    const moves = rAvailableMoves(state);
    if (isMaximizing) {
      let best = -Infinity;
      for (const idx of moves) {
        const next = state.slice();
        next[idx] = AI;
        best = Math.max(best, rMediumScore(next, depth + 1, false));
      }
      return best;
    }
    let best = Infinity;
    for (const idx of moves) {
      const next = state.slice();
      next[idx] = HUMAN;
      best = Math.min(best, rMediumScore(next, depth + 1, true));
    }
    return best;
  }

  function rPickAIMove(state) {
    if (difficulty === "easy") {
      if (Math.random() < 0.25) {
        const block = rFindImmediateMove(state, HUMAN);
        if (block !== null) return block;
      }
      return rPickRandomMove(state);
    }
    if (difficulty === "medium") {
      if (Math.random() < 0.55) return rHeuristicMove(state);
      const moves = rAvailableMoves(state);
      let bestScore = -Infinity;
      let bestMove = moves[0];
      for (const idx of moves) {
        const next = state.slice();
        next[idx] = AI;
        const score = rMediumScore(next, 1, false);
        if (score > bestScore) {
          bestScore = score;
          bestMove = idx;
        }
      }
      return bestMove;
    }
    return rMinimax(state, 0, true, -Infinity, Infinity).move ?? rPickRandomMove(state);
  }

  function rAdvantagePct() {
    // Human-centric: 100 = clearly winning, 0 = losing.
    const w = rWinnerOf(rBoard).winner;
    if (w === HUMAN) return { pct: 98, label: "You are winning" };
    if (w === AI) return { pct: 2, label: "AI is winning" };
    if (rIsDraw(rBoard)) return { pct: 50, label: "Even" };

    // Use perfect-play minimax score as signal.
    // score is AI-centric; invert so higher = better for human.
    const res = rMinimax(rBoard.slice(), 0, rTurn === AI, -Infinity, Infinity);
    const humanScore = -res.score;
    const pct = 50 + clamp(humanScore * 5, -45, 45); // map roughly into [5..95]
    const label = pct > 56 ? "You are ahead" : pct < 44 ? "AI is ahead" : "Even";
    return { pct, label };
  }

  // ---------------------------
  // Ultimate helpers + AI
  // ---------------------------

  function uLocalOffset(localIdx) {
    return localIdx * 9;
  }

  function uGetLocal(localIdx, cells) {
    const off = uLocalOffset(localIdx);
    return cells.slice(off, off + 9);
  }

  function uSetLocalCell(localIdx, cellIdx, player, cells) {
    cells[uLocalOffset(localIdx) + cellIdx] = player;
  }

  function uLocalWinner(local) {
    for (const [a, b, c] of LINES) {
      const v = local[a];
      if (v && v === local[b] && v === local[c]) return v;
    }
    if (local.every((v) => !!v)) return "D";
    return null;
  }

  function uRecomputeLocalWinners(cells) {
    const winners = Array(9).fill(null);
    for (let lb = 0; lb < 9; lb++) {
      const w = uLocalWinner(uGetLocal(lb, cells));
      winners[lb] = w;
    }
    return winners;
  }

  function uGlobalWinner(localWinners) {
    // Treat draws as empty for global win lines.
    const g = localWinners.map((w) => (w === "X" || w === "O" ? w : null));
    for (const [a, b, c] of LINES) {
      const v = g[a];
      if (v && v === g[b] && v === g[c]) return v;
    }
    if (localWinners.every((w) => w !== null)) return "D";
    return null;
  }

  function uValidLocals() {
    const list = [];
    for (let lb = 0; lb < 9; lb++) if (!uLocalWinners[lb]) list.push(lb);
    return list;
  }

  function uValidMoves() {
    /** @type {{lb:number, c:number}[]} */
    const moves = [];
    const locals = uForcedLocal !== null && !uLocalWinners[uForcedLocal] ? [uForcedLocal] : uValidLocals();
    for (const lb of locals) {
      const local = uGetLocal(lb, uCells);
      for (let c = 0; c < 9; c++) if (!local[c]) moves.push({ lb, c });
    }
    return moves;
  }

  function uApplyMove(lb, c, player) {
    uSetLocalCell(lb, c, player, uCells);
    uLocalWinners = uRecomputeLocalWinners(uCells);
    uForcedLocal = uLocalWinners[c] ? null : c;
  }

  function uImmediateLocalWinMove(local, player) {
    for (let i = 0; i < 9; i++) {
      if (local[i]) continue;
      const next = local.slice();
      next[i] = player;
      if (uLocalWinner(next) === player) return i;
    }
    return null;
  }

  function uLocalMinimax(local, playerToMove) {
    // Perfect local-board play; returns best move for playerToMove.
    const w = uLocalWinner(local);
    if (w === AI) return { score: 10, move: null };
    if (w === HUMAN) return { score: -10, move: null };
    if (w === "D") return { score: 0, move: null };

    const moves = [];
    for (let i = 0; i < 9; i++) if (!local[i]) moves.push(i);
    if (playerToMove === AI) {
      let bestScore = -Infinity;
      let bestMove = moves[0];
      for (const m of moves) {
        const next = local.slice();
        next[m] = AI;
        const res = uLocalMinimax(next, HUMAN);
        if (res.score > bestScore) {
          bestScore = res.score;
          bestMove = m;
        }
      }
      return { score: bestScore, move: bestMove };
    }
    let bestScore = Infinity;
    let bestMove = moves[0];
    for (const m of moves) {
      const next = local.slice();
      next[m] = HUMAN;
      const res = uLocalMinimax(next, AI);
      if (res.score < bestScore) {
        bestScore = res.score;
        bestMove = m;
      }
    }
    return { score: bestScore, move: bestMove };
  }

  function uEvalLocal(local) {
    const w = uLocalWinner(local);
    if (w === AI) return 30;
    if (w === HUMAN) return -30;
    if (w === "D") return 0;
    let score = 0;
    if (local[4] === AI) score += 2;
    if (local[4] === HUMAN) score -= 2;
    for (const i of [0, 2, 6, 8]) {
      if (local[i] === AI) score += 1;
      if (local[i] === HUMAN) score -= 1;
    }
    for (const [a, b, c] of LINES) {
      const line = [local[a], local[b], local[c]];
      const aC = line.filter((v) => v === AI).length;
      const hC = line.filter((v) => v === HUMAN).length;
      if (aC && !hC) score += aC;
      if (hC && !aC) score -= hC;
    }
    return score;
  }

  function uEvalPosition(cells, localWinners, forcedLocal) {
    const g = uGlobalWinner(localWinners);
    if (g === AI) return 10000;
    if (g === HUMAN) return -10000;
    if (g === "D") return 0;

    // Global board heuristic: won locals matter most.
    let score = 0;
    for (let i = 0; i < 9; i++) {
      if (localWinners[i] === AI) score += 120;
      if (localWinners[i] === HUMAN) score -= 120;
      if (localWinners[i] === "D") score += 0;
    }

    // Global threats (two-in-a-row on global).
    const gCells = localWinners.map((w) => (w === "X" || w === "O" ? w : null));
    for (const [a, b, c] of LINES) {
      const line = [gCells[a], gCells[b], gCells[c]];
      const aC = line.filter((v) => v === AI).length;
      const hC = line.filter((v) => v === HUMAN).length;
      const eC = line.filter((v) => !v).length;
      if (aC === 2 && eC === 1 && hC === 0) score += 160;
      if (hC === 2 && eC === 1 && aC === 0) score -= 160;
    }

    // Local texture: sum of active locals (lightweight).
    for (let lb = 0; lb < 9; lb++) {
      if (localWinners[lb]) continue;
      const local = uGetLocal(lb, cells);
      score += uEvalLocal(local);
    }

    // Slightly favor having a good forced board (tempo).
    if (forcedLocal !== null && !localWinners[forcedLocal]) {
      score += 0.25 * uEvalLocal(uGetLocal(forcedLocal, cells));
    }

    return score;
  }

  function uPickRandomMove() {
    const moves = uValidMoves();
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function uPickHeuristicMove() {
    const moves = uValidMoves();
    let best = moves[0];
    let bestScore = -Infinity;
    for (const mv of moves) {
      const nextCells = uCells.slice();
      uSetLocalCell(mv.lb, mv.c, AI, nextCells);
      const nextWinners = uRecomputeLocalWinners(nextCells);
      const nextForced = nextWinners[mv.c] ? null : mv.c;
      const s = uEvalPosition(nextCells, nextWinners, nextForced);
      if (s > bestScore) {
        bestScore = s;
        best = mv;
      }
    }
    return best;
  }

  function uPickHardMove() {
    // "Hard" here is strong but not exhaustive global minimax (too big).
    // We do: immediate global win/block, then local-board perfect play when forced, else best heuristic.
    const g = uGlobalWinner(uLocalWinners);
    if (g) return uPickHeuristicMove();

    const moves = uValidMoves();
    // 1) win globally now if possible
    for (const mv of moves) {
      const nextCells = uCells.slice();
      uSetLocalCell(mv.lb, mv.c, AI, nextCells);
      const nextWinners = uRecomputeLocalWinners(nextCells);
      if (uGlobalWinner(nextWinners) === AI) return mv;
    }
    // 2) block human global win
    for (const mv of moves) {
      const nextCells = uCells.slice();
      uSetLocalCell(mv.lb, mv.c, HUMAN, nextCells);
      const nextWinners = uRecomputeLocalWinners(nextCells);
      if (uGlobalWinner(nextWinners) === HUMAN) return mv;
    }

    // 3) if forced to a live local, use perfect local minimax with a global tiebreaker
    if (uForcedLocal !== null && !uLocalWinners[uForcedLocal]) {
      const local = uGetLocal(uForcedLocal, uCells);
      const localWin = uImmediateLocalWinMove(local, AI);
      if (localWin !== null) return { lb: uForcedLocal, c: localWin };
      const localBlock = uImmediateLocalWinMove(local, HUMAN);
      if (localBlock !== null) return { lb: uForcedLocal, c: localBlock };
      const bestLocal = uLocalMinimax(local, AI).move;
      if (bestLocal !== null) return { lb: uForcedLocal, c: bestLocal };
    }

    // 4) fallback heuristic
    return uPickHeuristicMove();
  }

  function uPickAIMove() {
    if (difficulty === "easy") {
      if (Math.random() < 0.25) return uPickHeuristicMove();
      return uPickRandomMove();
    }
    if (difficulty === "medium") {
      if (Math.random() < 0.55) return uPickHeuristicMove();
      return uPickHardMove();
    }
    return uPickHardMove();
  }

  function uAdvantagePct() {
    const g = uGlobalWinner(uLocalWinners);
    if (g === HUMAN) return { pct: 98, label: "You are winning" };
    if (g === AI) return { pct: 2, label: "AI is winning" };
    if (g === "D") return { pct: 50, label: "Even" };

    // AI-centric score, invert to human-centric percent.
    const s = uEvalPosition(uCells, uLocalWinners, uForcedLocal);
    const humanScore = -s;
    const pct = 50 + clamp(humanScore / 20, -45, 45);
    const label = pct > 56 ? "You are ahead" : pct < 44 ? "AI is ahead" : "Even";
    return { pct, label };
  }

  // ---------------------------
  // Rendering
  // ---------------------------

  function clearBoardDOM() {
    while (elBoard.firstChild) elBoard.removeChild(elBoard.firstChild);
  }

  function clearHint() {
    hintMove = null;
  }

  function buildRegularBoardDOM() {
    clearBoardDOM();
    elBoard.classList.remove("ultimate");
    elBoard.classList.add("regular");
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement("button");
      btn.className = "cell";
      btn.type = "button";
      btn.dataset.idx = String(i);
      btn.setAttribute("role", "gridcell");
      btn.setAttribute("aria-label", `Cell ${i + 1}`);
      btn.addEventListener("click", () => onRegularCell(i));
      elBoard.appendChild(btn);
    }
  }

  function buildUltimateBoardDOM() {
    clearBoardDOM();
    elBoard.classList.remove("regular");
    elBoard.classList.add("ultimate");

    for (let lb = 0; lb < 9; lb++) {
      const local = document.createElement("div");
      local.className = "localBoard";
      local.dataset.lb = String(lb);
      local.setAttribute("role", "grid");
      local.setAttribute("aria-label", `Local board ${lb + 1}`);

      for (let c = 0; c < 9; c++) {
        const btn = document.createElement("button");
        btn.className = "cell small";
        btn.type = "button";
        btn.dataset.lb = String(lb);
        btn.dataset.c = String(c);
        btn.setAttribute("role", "gridcell");
        btn.setAttribute("aria-label", `Board ${lb + 1} cell ${c + 1}`);
        btn.addEventListener("click", () => onUltimateCell(lb, c));
        local.appendChild(btn);
      }
      elBoard.appendChild(local);
    }
  }

  function renderRegular({ highlight = null } = {}) {
    const cells = /** @type {NodeListOf<HTMLButtonElement>} */ (elBoard.querySelectorAll(".cell"));
    for (let i = 0; i < 9; i++) {
      const cell = cells[i];
      const v = rBoard[i];
      cell.textContent = v ?? "";
      cell.dataset.value = v ?? "";
      cell.disabled = rLocked || !!v || rTurn !== HUMAN;
      cell.classList.toggle("win", !!highlight && highlight.includes(i));
      cell.classList.toggle("hint", !!hintMove && hintMove.mode === "regular" && hintMove.idx === i);
    }
    elBoard.classList.toggle("locked", rLocked);
    setAdvantage(rAdvantagePct());
  }

  function renderUltimate() {
    const locals = /** @type {NodeListOf<HTMLDivElement>} */ (elBoard.querySelectorAll(".localBoard"));
    locals.forEach((localEl) => {
      const lb = Number(localEl.dataset.lb);
      const w = uLocalWinners[lb];
      if (w) localEl.dataset.winner = w;
      else delete localEl.dataset.winner;

      const isPlayable =
        !uLocked &&
        uTurn === HUMAN &&
        !w &&
        (uForcedLocal === null || uForcedLocal === lb);
      localEl.classList.toggle("active", isPlayable);
      localEl.classList.toggle(
        "blocked",
        uTurn === HUMAN && !uLocked && !w && uForcedLocal !== null && uForcedLocal !== lb
      );

      const btns = /** @type {NodeListOf<HTMLButtonElement>} */ (localEl.querySelectorAll(".cell"));
      const off = uLocalOffset(lb);
      for (let c = 0; c < 9; c++) {
        const btn = btns[c];
        const v = uCells[off + c];
        btn.textContent = v ?? "";
        btn.dataset.value = v ?? "";
        btn.disabled = uLocked || uTurn !== HUMAN || !!w || !!v || (uForcedLocal !== null && uForcedLocal !== lb);
        btn.classList.toggle(
          "hint",
          !!hintMove && hintMove.mode === "ultimate" && hintMove.lb === lb && hintMove.c === c
        );
      }
    });
    elBoard.classList.toggle("locked", uLocked);
    setAdvantage(uAdvantagePct());
  }

  function endGame(title, text) {
    if (mode === "regular") rLocked = true;
    if (mode === "ultimate") uLocked = true;
    setStatus(title);
    elResultTitle.textContent = title;
    elResultText.textContent = text;
    if (!elDialog.open) elDialog.showModal();
    if (mode === "regular") renderRegular();
    else renderUltimate();
  }

  // ---------------------------
  // Gameplay (Regular)
  // ---------------------------

  async function regularAiTurn() {
    if (rLocked) return;
    rLocked = true;
    setStatus("AI thinking...");
    renderRegular();
    await new Promise((r) => setTimeout(r, 180));

    const move = rPickAIMove(rBoard.slice());
    rBoard[move] = AI;

    const { winner } = rWinnerOf(rBoard);
    if (winner === AI) return endGame("AI wins", "Try Ultimate mode or increase difficulty.");
    if (rIsDraw(rBoard)) return endGame("Draw", "Even match.");

    rTurn = HUMAN;
    rLocked = false;
    setStatus("Your turn");
    renderRegular();
  }

  function onRegularCell(idx) {
    if (rLocked || rTurn !== HUMAN || rBoard[idx]) return;
    clearHint();
    rBoard[idx] = HUMAN;
    const { winner } = rWinnerOf(rBoard);
    if (winner === HUMAN) return endGame("You win", "Nice.");
    if (rIsDraw(rBoard)) return endGame("Draw", "Even match.");
    rTurn = AI;
    renderRegular();
    void regularAiTurn();
  }

  function resetRegular() {
    rBoard = Array(9).fill(null);
    rTurn = HUMAN;
    rLocked = false;
    setStatus("Your turn");
    buildRegularBoardDOM();
    renderRegular();
  }

  // ---------------------------
  // Gameplay (Ultimate)
  // ---------------------------

  async function ultimateAiTurn() {
    if (uLocked) return;
    uLocked = true;
    setStatus("AI thinking...");
    renderUltimate();
    await new Promise((r) => setTimeout(r, 220));

    const mv = uPickAIMove();
    uApplyMove(mv.lb, mv.c, AI);

    const g = uGlobalWinner(uLocalWinners);
    if (g === AI) return endGame("AI wins", "Ultimate is tough. Rematch?");
    if (g === "D") return endGame("Draw", "Global draw.");

    uTurn = HUMAN;
    uLocked = false;
    setStatus(uForcedLocal === null ? "Your turn (any board)" : `Your turn (board ${uForcedLocal + 1})`);
    renderUltimate();
  }

  function onUltimateCell(lb, c) {
    if (uLocked || uTurn !== HUMAN) return;
    if (uLocalWinners[lb]) return;
    if (uForcedLocal !== null && uForcedLocal !== lb) return;
    const abs = uLocalOffset(lb) + c;
    if (uCells[abs]) return;

    clearHint();
    uApplyMove(lb, c, HUMAN);

    const g = uGlobalWinner(uLocalWinners);
    if (g === HUMAN) return endGame("You win", "Global three-in-a-row!");
    if (g === "D") return endGame("Draw", "Global draw.");

    uTurn = AI;
    renderUltimate();
    void ultimateAiTurn();
  }

  function resetUltimate() {
    uCells = Array(81).fill(null);
    uLocalWinners = Array(9).fill(null);
    uForcedLocal = null;
    uTurn = HUMAN;
    uLocked = false;
    setStatus("Your turn (any board)");
    buildUltimateBoardDOM();
    renderUltimate();
  }

  // ---------------------------
  // Mode switching + init
  // ---------------------------

  function resetGame() {
    closeDialog();
    clearHint();
    mode = elMode.value === "ultimate" ? "ultimate" : "regular";
    difficulty = /** @type any */ (elDifficulty.value);
    if (mode === "regular") resetRegular();
    else resetUltimate();
  }

  elMode.addEventListener("change", resetGame);
  elDifficulty.addEventListener("change", () => {
    difficulty = /** @type any */ (elDifficulty.value);
    if (mode === "regular") renderRegular();
    else renderUltimate();
  });
  elNewGame.addEventListener("click", resetGame);
  function showHint() {
    clearHint();
    if (mode === "regular") {
      if (rLocked || rTurn !== HUMAN) {
        setStatus("Hint: wait for your turn.");
        renderRegular();
        return;
      }
      const moves = rAvailableMoves(rBoard);
      if (!moves.length) return;
      let idx = moves[0];
      if (difficulty === "easy") {
        const winNow = rFindImmediateMove(rBoard, HUMAN);
        if (winNow !== null) idx = winNow;
        else idx = rPickRandomMove(rBoard);
      } else if (difficulty === "medium") {
        const winNow = rFindImmediateMove(rBoard, HUMAN);
        if (winNow !== null) idx = winNow;
        else {
          let bestScore = -Infinity;
          for (const mv of moves) {
            const next = rBoard.slice();
            next[mv] = HUMAN;
            const score = -rMediumScore(next, 1, true);
            if (score > bestScore) {
              bestScore = score;
              idx = mv;
            }
          }
        }
      } else {
        const res = rMinimax(rBoard.slice(), 0, false, -Infinity, Infinity);
        idx = res.move ?? idx;
      }
      hintMove = { mode: "regular", idx };
      setStatus(`Hint: play cell ${idx + 1}.`);
      renderRegular();
      return;
    }

    if (uLocked || uTurn !== HUMAN) {
      setStatus("Hint: wait for your turn.");
      renderUltimate();
      return;
    }
    const moves = uValidMoves();
    if (!moves.length) return;
    let move = moves[0];
    if (difficulty === "easy") {
      move = uPickRandomMove();
    } else if (difficulty === "medium") {
      let bestScore = -Infinity;
      for (const mv of moves) {
        const nextCells = uCells.slice();
        uSetLocalCell(mv.lb, mv.c, HUMAN, nextCells);
        const nextWinners = uRecomputeLocalWinners(nextCells);
        const nextForced = nextWinners[mv.c] ? null : mv.c;
        const score = -uEvalPosition(nextCells, nextWinners, nextForced);
        if (score > bestScore) {
          bestScore = score;
          move = mv;
        }
      }
    } else {
      // Hard hint mirrors strongest currently-available policy.
      let bestScore = -Infinity;
      for (const mv of moves) {
        const nextCells = uCells.slice();
        uSetLocalCell(mv.lb, mv.c, HUMAN, nextCells);
        const nextWinners = uRecomputeLocalWinners(nextCells);
        const nextForced = nextWinners[mv.c] ? null : mv.c;
        const score = -uEvalPosition(nextCells, nextWinners, nextForced);
        if (score > bestScore) {
          bestScore = score;
          move = mv;
        }
      }
    }
    hintMove = { mode: "ultimate", lb: move.lb, c: move.c };
    setStatus(`Hint: board ${move.lb + 1}, cell ${move.c + 1}.`);
    renderUltimate();
  }
  elHintBtn.addEventListener("click", showHint);
  elPlayAgain.addEventListener("click", resetGame);
  elCloseDialog.addEventListener("click", closeDialog);

  elDialog.addEventListener("click", (e) => {
    const rect = elDialog.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    if (!inside) closeDialog();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDialog();
  });

  // First render
  elMode.value = mode;
  elDifficulty.value = difficulty;
  resetGame();
})();
