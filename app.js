'use strict';

// ---------- 保存データ ----------
const KEY = 'az104-trainer-v1';
const QMAP = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const DMAP = Object.fromEntries(DOMAINS.map(d => [d.id, d]));
const PASS = 700;

function freshState() {
  return { stats: {}, wrong: [], lessons: {}, cards: {}, mocks: [], streak: { last: null, count: 0 }, total: 0 };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(freshState(), JSON.parse(raw));
  } catch (e) {}
  return freshState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
let S = load();

// ---------- 小物 ----------
const $view = document.getElementById('view');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (c, n) => n ? Math.round(c / n * 100) : 0;
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 選択肢の順番をシャッフルして、正解の位置も付け直す
function prep(q) {
  const order = shuffle(q.choices.map((_, i) => i));
  return { ...q, choices: order.map(i => q.choices[i]), answer: order.indexOf(q.answer) };
}
function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d);
}
function touchStreak() {
  const t = dayKey();
  if (S.streak.last === t) return;
  S.streak.count = S.streak.last === yesterdayKey() ? S.streak.count + 1 : 1;
  S.streak.last = t;
}
function streakNow() {
  return (S.streak.last === dayKey() || S.streak.last === yesterdayKey()) ? S.streak.count : 0;
}
function record(q, correct) {
  const st = S.stats[q.d] || (S.stats[q.d] = { c: 0, n: 0 });
  st.n++;
  if (correct) st.c++;
  S.total++;
  const i = S.wrong.indexOf(q.id);
  if (correct) { if (i >= 0) S.wrong.splice(i, 1); }
  else if (i < 0) S.wrong.push(q.id);
  touchStreak();
  save();
}
function overall() {
  let c = 0, n = 0;
  for (const d of DOMAINS) { const st = S.stats[d.id]; if (st) { c += st.c; n += st.n; } }
  return { c, n };
}
const MARKS = ['A', 'B', 'C', 'D', 'E'];

// ---------- 画面切り替え ----------
let session = null;
let timerId = null;
let quizSel = { d: 'all', n: 10 };
let cardSel = 'all';
let deck = null;
let confirmReset = false;

const TAB_OF = { home: 'home', lessons: 'lessons', quiz: 'quiz', cards: 'cards', stats: 'stats' };

function go(name, arg) {
  clearInterval(timerId); timerId = null;
  if (TAB_OF[name]) {
    session = null;
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  }
  document.querySelector('.tabbar').style.pointerEvents = '';
  document.querySelector('.tabbar').style.opacity = '';
  VIEWS[name](arg);
  window.scrollTo(0, 0);
}
function render(html) { $view.innerHTML = html; }

// ---------- ホーム ----------
function nextLesson() {
  return LESSONS.find(l => !S.lessons[l.id]) || LESSONS.find(l => S.lessons[l.id] < 3) || LESSONS[0];
}
const VIEWS = {};
VIEWS.home = () => {
  const o = overall();
  const nl = nextLesson();
  render(`
    <div class="card">
      <div class="stat-row">
        <div class="stat"><div class="num">🔥 ${streakNow()}</div><div class="lbl">連続学習（日）</div></div>
        <div class="stat"><div class="num">${S.total}</div><div class="lbl">解いた問題</div></div>
        <div class="stat"><div class="num">${o.n ? pct(o.c, o.n) + '%' : '—'}</div><div class="lbl">全体の正答率</div></div>
      </div>
    </div>
    <div class="grid">
      <button class="tile" data-act="lesson" data-arg="${nl.id}"><span class="big">📘</span><b>レッスン</b><span>次は「${esc(nl.title)}」</span></button>
      <button class="tile" data-act="tab" data-arg="quiz"><span class="big">✏️</span><b>分野別クイズ</b><span>全 ${QUESTIONS.length} 問</span></button>
      <button class="tile" data-act="review"><span class="big">🔁</span><b>間違えた問題</b><span>${S.wrong.length} 問</span></button>
      <button class="tile" data-act="mockMenu"><span class="big">⏱️</span><b>模擬試験</b><span>時間制限つき</span></button>
      <button class="tile" data-act="tab" data-arg="cards"><span class="big">🃏</span><b>暗記カード</b><span>${TERMS.length} 語</span></button>
      <button class="tile" data-act="tab" data-arg="stats"><span class="big">📊</span><b>成績</b><span>苦手分野をチェック</span></button>
    </div>
    <h3>出題範囲（試験での割合）</h3>
    <div class="card">
      ${DOMAINS.map(d => `<div class="bar-top"><span>${esc(d.name)}</span><span class="v">${d.weight}</span></div>`).join('')}
    </div>
    <p class="muted">問題は公式の出題範囲をもとにしたオリジナルです。本番の問題とは異なります。</p>
  `);
};

// ---------- レッスン ----------
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
VIEWS.lessons = () => {
  render(`
    <h2>レッスン</h2>
    <p class="muted">短いポイントを読んで、すぐクイズで確認。1 レッスン 3 分ほどです。</p>
    ${LESSONS.map((l, i) => `
      <button class="card lesson" data-act="lesson" data-arg="${l.id}">
        <span class="no">${i + 1}</span>
        <span class="body"><b>${esc(l.title)}</b><br><span class="muted">${esc(DMAP[l.d].name)}</span></span>
        <span class="stars" aria-label="星 ${S.lessons[l.id] || 0} 個">${stars(S.lessons[l.id] || 0)}</span>
      </button>`).join('')}
  `);
};
VIEWS.lesson = id => {
  const l = LESSONS.find(x => x.id === id);
  session = { mode: 'lesson', lesson: l, items: l.steps.map(s => s.point ? s : prep(s)), i: 0, picked: null, results: [] };
  renderPractice();
};

// ---------- 問題（分野別・復習） ----------
VIEWS.quiz = () => {
  const chip = (key, val, label) => `<button class="chip ${quizSel[key] === val ? 'on' : ''}" data-act="sel" data-arg="${key}:${val}">${label}</button>`;
  render(`
    <h2>分野別クイズ</h2>
    <div class="card">
      <h3 style="margin-top:0">分野</h3>
      <div class="chips">${chip('d', 'all', 'すべて')}${DOMAINS.map(d => chip('d', d.id, esc(d.name))).join('')}</div>
      <h3>問題数</h3>
      <div class="chips">${chip('n', 5, '5 問')}${chip('n', 10, '10 問')}${chip('n', 0, 'ぜんぶ')}</div>
      <button class="btn" data-act="startQuiz">スタート</button>
    </div>
    <div class="grid">
      <button class="tile" data-act="review"><span class="big">🔁</span><b>間違えた問題</b><span>${S.wrong.length} 問</span></button>
      <button class="tile" data-act="mockMenu"><span class="big">⏱️</span><b>模擬試験</b><span>本番形式で腕だめし</span></button>
    </div>
  `);
};
function startPractice(mode, qs) {
  session = { mode, items: qs.map(prep), i: 0, picked: null, results: [] };
  go('session');
}
VIEWS.session = () => renderPractice();

function renderPractice() {
  const s = session;
  const it = s.items[s.i];
  const total = s.items.length;
  const label = s.mode === 'lesson' ? esc(s.lesson.title) : s.mode === 'review' ? '復習' : '分野別クイズ';
  let body;
  if (it.point) {
    body = `
      <div class="point"><span class="tag">💡 ポイント</span><br>${esc(it.point)}</div>
      <button class="btn" data-act="next">わかった！ クイズへ</button>`;
  } else {
    const answered = s.picked !== null;
    const ok = answered && s.picked === it.answer;
    body = `
      ${it.d && s.mode !== 'lesson' ? `<div class="muted">${esc(DMAP[it.d].name)}</div>` : ''}
      <div class="question">${esc(it.q)}</div>
      ${it.choices.map((c, i) => {
        let cls = '';
        if (answered) { if (i === it.answer) cls = 'ok'; else if (i === s.picked) cls = 'ng'; }
        const mk = answered && i === it.answer ? '✓' : answered && i === s.picked ? '✗' : MARKS[i];
        return `<button class="choice ${cls}" data-act="pick" data-arg="${i}" ${answered ? 'disabled' : ''}><span class="mk">${mk}</span><span>${esc(c)}</span></button>`;
      }).join('')}
      ${answered ? `
        <div class="feedback ${ok ? 'ok' : 'ng'}"><strong>${ok ? '✓ 正解！' : '✗ 不正解'}</strong>${esc(it.explain)}</div>
        <button class="btn" data-act="next">${s.i + 1 < total ? '次へ' : '結果を見る'}</button>` : ''}`;
  }
  render(`
    <div class="qhead"><span>${label}</span><span>${s.i + 1} / ${total}</span></div>
    <div class="progress"><i style="width:${(s.i) / total * 100}%"></i></div>
    ${body}
  `);
}

function finishPractice() {
  const s = session;
  const c = s.results.filter(r => r.correct).length;
  const n = s.results.length;
  const wrong = s.results.filter(r => !r.correct);
  let head = '';
  let again = '';
  if (s.mode === 'lesson') {
    const st = c === n ? 3 : c >= n - 1 ? 2 : 1;
    S.lessons[s.lesson.id] = Math.max(S.lessons[s.lesson.id] || 0, st);
    save();
    const idx = LESSONS.indexOf(s.lesson);
    const nxt = LESSONS[idx + 1];
    head = `<div class="stars" style="font-size:32px;color:var(--warn)">${stars(st)}</div>`;
    again = `<button class="btn" data-act="lesson" data-arg="${nxt ? nxt.id : s.lesson.id}">${nxt ? '次のレッスンへ' : 'もう一度'}</button>
             <button class="btn sub" data-act="tab" data-arg="lessons">レッスン一覧</button>`;
  } else {
    again = `<button class="btn" data-act="${s.mode === 'review' ? 'review' : 'startQuiz'}">もう一度</button>
             ${S.wrong.length ? `<button class="btn sub" data-act="review">間違えた問題を復習（${S.wrong.length} 問）</button>` : ''}
             <button class="btn sub" data-act="tab" data-arg="home">ホームへ</button>`;
  }
  render(`
    <div class="card result-score">
      ${head}
      <div class="num">${c} / ${n}</div>
      <div class="muted">正答率 ${pct(c, n)}%</div>
      <p style="margin-top:8px">${c === n ? '完璧です！🎉' : c / n >= 0.7 ? 'いい調子！' : '解説を読んで、もう一度挑戦しよう'}</p>
    </div>
    ${wrong.length ? `<h3>間違えた問題</h3><div class="card">${wrong.map(r => reviewItem(r.q, r.picked)).join('')}</div>` : ''}
    ${again}
  `);
  session = null;
}
function reviewItem(q, picked) {
  return `<div class="review-item">
    <div><b>${esc(q.q)}</b></div>
    <div class="ans"><span class="fail">✗ あなた：${picked === null ? '未回答' : esc(q.choices[picked])}</span><br>
    <span class="pass">✓ 正解：${esc(q.choices[q.answer])}</span></div>
    <div class="muted" style="margin-top:4px">${esc(q.explain)}</div>
  </div>`;
}

// ---------- 模擬試験 ----------
const MOCKS = [
  { n: 20, min: 40, label: 'ミニ模試', desc: '20 問・40 分' },
  { n: 40, min: 80, label: '本番形式', desc: '40 問・80 分' },
];
VIEWS.mockMenu = () => {
  render(`
    <h2>模擬試験</h2>
    <p class="muted">途中で答えは表示されません。最後に採点し、1000 点満点で ${PASS} 点以上が合格ラインです（本番と同じ基準）。</p>
    ${MOCKS.map((m, i) => `
      <button class="card tile" style="width:100%" data-act="startMock" data-arg="${i}">
        <b>${m.label}</b><span>${m.desc}</span>
      </button>`).join('')}
    ${S.mocks.length ? `<p class="muted">前回：${S.mocks[S.mocks.length - 1].score} 点</p>` : ''}
  `);
};
function startMock(k) {
  const m = MOCKS[k];
  // 分野ごとに偏りが出ないよう、各分野から順番に取り出す
  const pools = DOMAINS.map(d => shuffle(QUESTIONS.filter(q => q.d === d.id)));
  const picked = [];
  while (picked.length < Math.min(m.n, QUESTIONS.length)) {
    for (const p of pools) if (p.length && picked.length < m.n) picked.push(p.pop());
  }
  session = { mode: 'mock', items: shuffle(picked).map(prep), i: 0, picks: picked.map(() => null), deadline: Date.now() + m.min * 60000, confirm: false };
  go('mock');
}
VIEWS.mock = () => {
  const tb = document.querySelector('.tabbar');
  tb.style.pointerEvents = 'none'; tb.style.opacity = '.4';
  renderMock();
  timerId = setInterval(tickMock, 1000);
};
function remaining() { return Math.max(0, session.deadline - Date.now()); }
function fmt(ms) { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function tickMock() {
  const r = remaining();
  const el = document.getElementById('timer');
  if (el) { el.textContent = '⏱ ' + fmt(r); el.classList.toggle('low', r < 5 * 60000); }
  if (r <= 0) finishMock();
}
function renderMock() {
  const s = session;
  const it = s.items[s.i];
  const n = s.items.length;
  const left = s.picks.filter(p => p === null).length;
  render(`
    <div class="qhead"><span>模擬試験　${s.i + 1} / ${n}</span><span id="timer" class="timer">⏱ ${fmt(remaining())}</span></div>
    <div class="progress"><i style="width:${(n - left) / n * 100}%"></i></div>
    <div class="question">${esc(it.q)}</div>
    ${it.choices.map((c, i) => `<button class="choice ${s.picks[s.i] === i ? 'sel' : ''}" data-act="mpick" data-arg="${i}"><span class="mk">${MARKS[i]}</span><span>${esc(c)}</span></button>`).join('')}
    <div class="row">
      <button class="btn sub" data-act="mmove" data-arg="-1" ${s.i === 0 ? 'disabled' : ''}>← 前へ</button>
      <button class="btn sub" data-act="mmove" data-arg="1" ${s.i === n - 1 ? 'disabled' : ''}>次へ →</button>
    </div>
    <div class="qnav">${s.picks.map((p, i) => `<button class="${p !== null ? 'done' : ''} ${i === s.i ? 'cur' : ''}" data-act="mjump" data-arg="${i}">${i + 1}</button>`).join('')}</div>
    ${s.confirm ? `
      <div class="card" style="margin-top:12px">
        <p>${left ? `未回答が <b>${left} 問</b> あります。` : ''}採点しますか？</p>
        <div class="row"><button class="btn sub" data-act="mcancel">戻る</button><button class="btn" data-act="msubmit">採点する</button></div>
      </div>` : `<button class="btn" data-act="mconfirm">採点する</button>`}
    <button class="btn sub" data-act="mquit">中断する（記録されません）</button>
  `);
  tickMock();
}
function finishMock() {
  clearInterval(timerId); timerId = null;
  const s = session;
  const per = {};
  let c = 0;
  s.items.forEach((q, i) => {
    const ok = s.picks[i] === q.answer;
    if (ok) c++;
    (per[q.d] = per[q.d] || { c: 0, n: 0 }).n++;
    if (ok) per[q.d].c++;
    record(q, ok);
  });
  const n = s.items.length;
  const score = Math.round(c / n * 1000);
  S.mocks.push({ date: dayKey(), score, c, n });
  save();
  const wrong = s.items.map((q, i) => ({ q, picked: s.picks[i] })).filter(r => r.picked !== r.q.answer);
  session = null;
  go('tab_quiz_reset');
  render(`
    <div class="card result-score">
      <div class="muted">模擬試験の結果</div>
      <div class="num">${score}</div>
      <div class="muted">/ 1000 点（${c} / ${n} 問正解）</div>
      <p style="margin-top:8px" class="${score >= PASS ? 'pass' : 'fail'}">${score >= PASS ? '✓ 合格ライン突破！' : `✗ 合格ライン（${PASS} 点）まであと ${PASS - score} 点`}</p>
    </div>
    <h3>分野ごとの結果</h3>
    <div class="card">${barChart(per)}</div>
    ${wrong.length ? `<h3>見直し（${wrong.length} 問）</h3><div class="card">${wrong.map(r => reviewItem(r.q, r.picked)).join('')}</div>` : ''}
    ${S.wrong.length ? `<button class="btn" data-act="review">間違えた問題を復習する</button>` : ''}
    <button class="btn sub" data-act="tab" data-arg="home">ホームへ</button>
  `);
}
// 採点後は「問題」タブを選択状態に戻す（画面は結果表示のまま）
VIEWS.tab_quiz_reset = () => {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === 'quiz'));
};

// ---------- 暗記カード ----------
VIEWS.cards = () => {
  if (!deck || deck.filter !== cardSel) buildDeck(false);
  renderCards();
};
function buildDeck(onlyAgain) {
  let list = TERMS.filter(t => cardSel === 'all' || t.d === cardSel);
  if (onlyAgain) list = list.filter(t => S.cards[t.id] !== 'known');
  // まだ覚えていないカードを先に出す
  const notKnown = shuffle(list.filter(t => S.cards[t.id] !== 'known'));
  const known = shuffle(list.filter(t => S.cards[t.id] === 'known'));
  deck = { filter: cardSel, list: notKnown.concat(known), i: 0, flipped: false };
}
function renderCards() {
  const all = TERMS.filter(t => cardSel === 'all' || t.d === cardSel);
  const known = all.filter(t => S.cards[t.id] === 'known').length;
  const chip = (val, label) => `<button class="chip ${cardSel === val ? 'on' : ''}" data-act="cardSel" data-arg="${val}">${label}</button>`;
  const t = deck.list[deck.i];
  render(`
    <h2>暗記カード</h2>
    <div class="chips">${chip('all', 'すべて')}${DOMAINS.map(d => chip(d.id, esc(d.name))).join('')}</div>
    <div class="qhead"><span>覚えた ${known} / ${all.length}</span><span>${t ? `${deck.i + 1} / ${deck.list.length}` : ''}</span></div>
    <div class="progress"><i style="width:${pct(known, all.length)}%"></i></div>
    ${t ? `
      <button class="flash ${deck.flipped ? 'flip' : ''}" data-act="flip" aria-label="カードをめくる">
        <div class="inner">
          <div class="face front"><div class="muted">${esc(DMAP[t.d].name)}</div><div class="term">${esc(t.term)}</div><div class="hint">タップしてめくる</div></div>
          <div class="face back"><div><b>${esc(t.term)}</b><br>${esc(t.def)}</div></div>
        </div>
      </button>
      <div class="row">
        <button class="btn sub" data-act="cardMark" data-arg="again">🤔 まだ</button>
        <button class="btn" data-act="cardMark" data-arg="known">👍 覚えた</button>
      </div>` : `
      <div class="card empty"><div class="big">🎉</div><p>一周しました！</p></div>
      <div class="row">
        <button class="btn sub" data-act="cardRestart" data-arg="all">最初から</button>
        <button class="btn" data-act="cardRestart" data-arg="again" ${known === all.length ? 'disabled' : ''}>「まだ」だけ</button>
      </div>`}
  `);
}

// ---------- 成績 ----------
// 分野ごとの正答率を横棒で表示（点線は合格の目安 70%）
function barChart(stats) {
  return `<div class="bars">${DOMAINS.map(d => {
    const st = stats[d.id];
    const p = st && st.n ? pct(st.c, st.n) : null;
    return `<div class="bar-row" title="${esc(d.name)}：${p === null ? '未挑戦' : `${p}%（${st.c} / ${st.n} 問）`}">
      <div class="bar-top"><span>${esc(d.name)}</span><span class="v">${p === null ? '未挑戦' : `${p}%（${st.c}/${st.n}）`}</span></div>
      <div class="track">${p === null ? '' : `<div class="fill" style="width:${p}%"></div>`}<div class="target"></div></div>
    </div>`;
  }).join('')}</div>
  <div class="legend-note">点線＝合格の目安（70%）</div>`;
}
VIEWS.stats = () => {
  const o = overall();
  const weak = DOMAINS.filter(d => S.stats[d.id] && S.stats[d.id].n >= 3)
    .sort((a, b) => pct(S.stats[a.id].c, S.stats[a.id].n) - pct(S.stats[b.id].c, S.stats[b.id].n))[0];
  const lessonsDone = LESSONS.filter(l => S.lessons[l.id]).length;
  const cardsKnown = TERMS.filter(t => S.cards[t.id] === 'known').length;
  render(`
    <h2>成績</h2>
    <div class="card">
      <div class="stat-row">
        <div class="stat"><div class="num">${o.n ? pct(o.c, o.n) + '%' : '—'}</div><div class="lbl">全体の正答率</div></div>
        <div class="stat"><div class="num">${lessonsDone}/${LESSONS.length}</div><div class="lbl">レッスン</div></div>
        <div class="stat"><div class="num">${cardsKnown}/${TERMS.length}</div><div class="lbl">覚えた用語</div></div>
      </div>
    </div>
    <h3>分野ごとの正答率</h3>
    <div class="card">${barChart(S.stats)}</div>
    ${weak && pct(S.stats[weak.id].c, S.stats[weak.id].n) < 70 ? `
      <div class="card"><p>いちばんの苦手は <b>${esc(weak.name)}</b> です。</p>
      <button class="btn" data-act="weakQuiz" data-arg="${weak.id}">この分野を練習する</button></div>` : ''}
    <h3>模擬試験の記録</h3>
    <div class="card">
      ${S.mocks.length ? S.mocks.slice(-10).reverse().map(m => `
        <div class="bar-top"><span>${m.date}（${m.c}/${m.n} 問）</span><span class="${m.score >= PASS ? 'pass' : 'fail'}">${m.score >= PASS ? '✓' : '✗'} ${m.score} 点</span></div>`).join('')
      : '<p class="muted" style="margin:0">まだ受けていません</p>'}
    </div>
    <h3>データ</h3>
    ${confirmReset ? `
      <div class="card"><p>学習記録をすべて消去します。元に戻せません。</p>
      <div class="row"><button class="btn sub" data-act="resetNo">やめる</button><button class="btn danger" data-act="resetYes">消去する</button></div></div>`
      : `<button class="btn sub" data-act="resetAsk">学習記録をリセット</button>`}
  `);
};

// ---------- 操作 ----------
const ACT = {
  tab: t => go(t),
  lesson: id => go('lesson', id),
  review: () => {
    const qs = shuffle(S.wrong.map(id => QMAP[id]).filter(Boolean));
    if (!qs.length) {
      render(`<div class="card empty"><div class="big">🎉</div><p>間違えた問題はありません！</p>
        <button class="btn" data-act="tab" data-arg="quiz">問題を解く</button></div>`);
      return;
    }
    startPractice('review', qs);
  },
  sel: arg => {
    const [k, v] = arg.split(':');
    quizSel[k] = k === 'n' ? Number(v) : v;
    VIEWS.quiz();
  },
  startQuiz: () => {
    const pool = shuffle(QUESTIONS.filter(q => quizSel.d === 'all' || q.d === quizSel.d));
    startPractice('practice', quizSel.n ? pool.slice(0, quizSel.n) : pool);
  },
  weakQuiz: d => { quizSel = { d, n: 10 }; ACT.startQuiz(); },
  pick: i => {
    const s = session;
    if (s.picked !== null) return;
    s.picked = Number(i);
    const it = s.items[s.i];
    const correct = s.picked === it.answer;
    s.results.push({ q: it, picked: s.picked, correct });
    if (s.mode === 'lesson') { touchStreak(); save(); }
    else record(it, correct);
    renderPractice();
  },
  next: () => {
    const s = session;
    s.i++; s.picked = null;
    if (s.i >= s.items.length) finishPractice();
    else { renderPractice(); window.scrollTo(0, 0); }
  },
  mockMenu: () => go('mockMenu'),
  startMock: k => startMock(Number(k)),
  mpick: i => { session.picks[session.i] = Number(i); renderMock(); },
  mmove: d => { session.i += Number(d); session.confirm = false; renderMock(); window.scrollTo(0, 0); },
  mjump: i => { session.i = Number(i); session.confirm = false; renderMock(); window.scrollTo(0, 0); },
  mconfirm: () => { session.confirm = true; renderMock(); window.scrollTo(0, document.body.scrollHeight); },
  mcancel: () => { session.confirm = false; renderMock(); },
  msubmit: () => finishMock(),
  mquit: () => go('quiz'),
  cardSel: v => { cardSel = v; buildDeck(false); renderCards(); },
  flip: () => { deck.flipped = !deck.flipped; document.querySelector('.flash').classList.toggle('flip', deck.flipped); },
  cardMark: v => {
    const t = deck.list[deck.i];
    S.cards[t.id] = v;
    touchStreak(); save();
    deck.i++; deck.flipped = false;
    renderCards();
  },
  cardRestart: v => { buildDeck(v === 'again'); renderCards(); },
  resetAsk: () => { confirmReset = true; VIEWS.stats(); },
  resetNo: () => { confirmReset = false; VIEWS.stats(); },
  resetYes: () => { S = freshState(); save(); deck = null; confirmReset = false; VIEWS.stats(); },
};

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tabbar button');
  if (tabBtn) { confirmReset = false; go(tabBtn.dataset.tab); return; }
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled && ACT[b.dataset.act]) ACT[b.dataset.act](b.dataset.arg);
});

// ---------- オフライン対応 ----------
const offlineBadge = document.getElementById('offline');
const updateOnline = () => { offlineBadge.hidden = navigator.onLine; };
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

go('home');
