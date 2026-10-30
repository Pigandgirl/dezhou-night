import { audio } from './audio.js';
import { StoryCinema3D } from './story-cinema.js';

const STORY_KEY = 'pokerStoryProgress';

const CHAPTERS = [
  {
    id: 'tide',
    index: '01',
    title: '潮汐晚宴',
    place: '海岛餐厅 · 台风夜',
    subtitle: '一场没有客人的晚宴',
    genre: '悬疑 · 入门',
    theme: 'tide',
    opponent: '林晚',
    rivalMark: '林',
    stack: 200,
    sb: 5,
    bb: 10,
    objective: '赢下与林晚的单挑，拿到 1207 房卡',
    intro: '台风封岛前的最后一晚，海边餐厅只亮着三盏灯。',
    afterWin: '你拿到了房卡。走廊尽头，那间本该空着的 1207 房，门开着。',
    lines: [
      { role: '旁白', text: '台风封岛前的最后一晚，海边餐厅只亮着三盏灯。' },
      { role: '林晚', text: '这桌牌，赢的人带走房卡。输的人，留在岛上。' },
      { role: '你', text: '我只想知道，昨晚宴会厅里少了谁。' },
      { role: '旁白', text: '潮声压过音乐。她把一张房卡压在筹码下面，牌局开始。' },
    ],
  },
  {
    id: 'menu',
    index: '02',
    title: '最后一道菜',
    place: '海崖餐厅 · 午夜',
    subtitle: '主厨不接受差评',
    genre: '悬疑 · 进阶',
    theme: 'menu',
    opponent: '主厨',
    rivalMark: '厨',
    stack: 160,
    sb: 10,
    bb: 20,
    objective: '赢下与主厨的单挑，带食客离开餐厅',
    intro: '海崖餐厅今晚只接待一桌客人，菜单上没有价格。',
    afterWin: '主厨摘下围裙，把后门钥匙推到你面前。远处的警笛正沿着海岸线靠近。',
    lines: [
      { role: '旁白', text: '海崖餐厅今晚只接待一桌客人。窗外是黑色的海。' },
      { role: '主厨', text: '菜单上没有牌。但最后一道菜，要用筹码来点。' },
      { role: '你', text: '如果我赢了呢？' },
      { role: '主厨', text: '那你和你的朋友，可以活着离开餐厅。' },
    ],
  },
];

function readProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORY_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function writeProgress(set) {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify([...set]));
  } catch { /* 存储不可用时忽略 */ }
}

export class StoryMode {
  constructor({ hud, onStart, onExit, onVisibility }) {
    this.hud = hud;
    this.onStart = onStart;
    this.onExit = onExit;
    this.onVisibility = onVisibility;
    this.current = null;
    this.lineIndex = 0;
    this.typingTimer = null;
    this.typing = false;
    this.fullText = '';
    this.progress = readProgress();
    this.cinema = null;
    this.cinemaFailed = false;

    this.el = {
      screen: document.getElementById('storyScreen'),
      bg: document.getElementById('storyBg'),
      select: document.getElementById('storySelect'),
      chapters: document.getElementById('storyChapters'),
      progress: document.getElementById('storyProgress'),
      detail: document.getElementById('storyDetail'),
      stage: document.getElementById('storyStage'),
      title: document.getElementById('storyDetailTitle'),
      sub: document.getElementById('storyDetailSub'),
      place: document.getElementById('storyPlace'),
      objective: document.getElementById('storyObjective'),
      rival: document.getElementById('storyRival'),
      rivalMark: document.getElementById('storyRivalMark'),
      rivalName: document.getElementById('storyRivalName'),
      leadMark: document.getElementById('storyLeadMark'),
      role: document.getElementById('dialogueRole'),
      index: document.getElementById('dialogueIndex'),
      text: document.getElementById('dialogueText'),
      btnBack: document.getElementById('btnStoryBack'),
      btnSkip: document.getElementById('btnStorySkip'),
      btnNext: document.getElementById('btnStoryNext'),
      result: document.getElementById('storyResult'),
      resultKicker: document.getElementById('resultKicker'),
      resultTitle: document.getElementById('resultTitle'),
      resultText: document.getElementById('resultText'),
      btnResultNext: document.getElementById('btnResultNext'),
      btnResultRetry: document.getElementById('btnResultRetry'),
      btnResultBack: document.getElementById('btnResultBack'),
    };

    this.el.btnBack?.addEventListener('click', () => this.back());
    this.el.btnSkip?.addEventListener('click', () => this.startChapter());
    this.el.btnNext?.addEventListener('click', () => this.nextLine());
    this.el.btnResultNext?.addEventListener('click', () => this.resultNext());
    this.el.btnResultRetry?.addEventListener('click', () => this.resultRetry());
    this.el.btnResultBack?.addEventListener('click', () => this.resultBack());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.el.screen?.classList.contains('hidden')) this.back();
    });
    this.renderChapters();
  }

  ensureCinema() {
    if (this.cinema || this.cinemaFailed) return this.cinema;
    try {
      const canvas = document.getElementById('storyCanvas');
      if (canvas) this.cinema = new StoryCinema3D(canvas);
    } catch (error) {
      this.cinemaFailed = true;
      console.warn('[story] 3D cinema unavailable, using CSS stage', error?.message || error);
    }
    return this.cinema;
  }

  get isOpen() {
    return Boolean(this.el.screen && !this.el.screen.classList.contains('hidden'));
  }

  open() {
    this.el.select?.classList.remove('hidden');
    this.el.detail?.classList.add('hidden');
    this.renderChapters();
    this.ensureCinema();
    this.el.screen?.classList.remove('hidden');
    this.el.screen?.classList.add('is-open');
    if (this.cinema) {
      this.el.screen?.classList.add('cinema-ready');
      this.cinema.showSelect();
    }
    document.body.classList.add('story-open');
    this.onVisibility?.(true);
    audio.click();
  }

  close() {
    this.el.screen?.classList.add('hidden');
    this.el.screen?.classList.remove('is-open');
    document.body.classList.remove('story-open');
    this.cinema?.pause();
    this.onVisibility?.(false);
    this.stopTyping();
  }

  renderChapters() {
    if (!this.el.chapters) return;
    const done = this.progress.size;
    if (this.el.progress) this.el.progress.textContent = `${Math.min(done, CHAPTERS.length)} / ${CHAPTERS.length} 已完成`;
    this.el.chapters.innerHTML = CHAPTERS.map((chapter) => {
      const completed = this.progress.has(chapter.id);
      return `
        <button class="story-card theme-${chapter.theme}${completed ? ' completed' : ''}" type="button" data-story="${chapter.id}">
          <span class="story-card-art" aria-hidden="true">
            <i class="card-sky"></i><i class="card-sun"></i><i class="card-sea"></i>
            <i class="card-building"></i><i class="card-lights"></i><i class="card-vignette"></i>
          </span>
          <span class="story-card-copy">
            <em>CHAPTER ${chapter.index} · ${chapter.genre}</em>
            <b>${chapter.title}</b>
            <small>${chapter.place}</small>
            <span class="story-card-foot">
              <i>${completed ? '已完成' : '开始任务'}</i>
              <strong>${chapter.objective}</strong>
            </span>
          </span>
          ${completed ? '<span class="story-card-stamp">CLEARED</span>' : ''}
        </button>
      `;
    }).join('');
    this.el.chapters.querySelectorAll('[data-story]').forEach((card) => {
      card.addEventListener('click', () => this.selectChapter(card.dataset.story));
    });
  }

  selectChapter(id) {
    const chapter = CHAPTERS.find((item) => item.id === id);
    if (!chapter) return;
    this.current = chapter;
    this.lineIndex = 0;
    this.el.select?.classList.add('hidden');
    this.el.detail?.classList.remove('hidden');
    this.el.screen?.classList.remove('theme-tide', 'theme-menu');
    this.el.screen?.classList.add(`theme-${chapter.theme}`);
    this.el.bg?.classList.remove('theme-tide', 'theme-menu');
    this.el.bg?.classList.add(`theme-${chapter.theme}`);
    this.el.stage?.classList.remove('theme-tide', 'theme-menu');
    this.el.stage?.classList.add(`theme-${chapter.theme}`);
    this.el.stage?.classList.remove('camera-in');
    requestAnimationFrame(() => this.el.stage?.classList.add('camera-in'));
    this.el.title.textContent = chapter.title;
    this.el.sub.textContent = `CHAPTER ${chapter.index} · ${chapter.genre}`;
    this.el.place.textContent = chapter.place;
    this.el.objective.textContent = `目标 · ${chapter.objective}`;
    this.el.rivalMark.textContent = chapter.rivalMark;
    this.el.rivalName.textContent = chapter.opponent;
    this.el.leadMark.textContent = '你';
    this.ensureCinema();
    if (this.cinema) {
      this.el.screen?.classList.add('cinema-ready');
      this.cinema.loadChapter(chapter.id);
    }
    audio.click();
    this.showLine();
  }

  showLine() {
    const chapter = this.current;
    if (!chapter) return;
    const line = chapter.lines[this.lineIndex];
    if (!line) return;
    this.stopTyping();
    this.el.role.textContent = line.role;
    this.el.index.textContent = `${String(this.lineIndex + 1).padStart(2, '0')} / ${String(chapter.lines.length).padStart(2, '0')}`;
    this.el.text.textContent = '';
    this.cinema?.setShot(this.lineIndex);
    this.el.btnNext.textContent = this.lineIndex >= chapter.lines.length - 1 ? '开始牌局 →' : '继续 →';
    this.fullText = line.text;
    this.typing = true;
    let index = 0;
    this.typingTimer = setInterval(() => {
      index += 1;
      this.el.text.textContent = this.fullText.slice(0, index);
      if (index >= this.fullText.length) this.stopTyping();
    }, 24);
  }

  stopTyping() {
    if (this.typingTimer) clearInterval(this.typingTimer);
    this.typingTimer = null;
    this.typing = false;
  }

  nextLine() {
    if (!this.current) return;
    if (this.typing) {
      this.stopTyping();
      this.el.text.textContent = this.fullText;
      return;
    }
    if (this.lineIndex < this.current.lines.length - 1) {
      this.lineIndex += 1;
      this.showLine();
      audio.click();
      return;
    }
    this.startChapter();
  }

  startChapter() {
    if (!this.current) return;
    const chapter = this.current;
    audio.click();
    this.hud.setLobbyMode('single');
    this.close();
    this.onStart({
      seats: 2,
      stack: chapter.stack,
      sb: chapter.sb,
      bb: chapter.bb,
      story: chapter,
    });
  }

  back() {
    audio.click();
    if (!this.el.detail?.classList.contains('hidden')) {
      this.el.detail.classList.add('hidden');
      this.el.select?.classList.remove('hidden');
      this.cinema?.showSelect();
      this.stopTyping();
      return;
    }
    this.close();
  }

  showResult({ won = false, chapter = this.current } = {}) {
    if (!chapter) return;
    this.current = chapter;
    this.lastResult = { won, chapter };
    if (won) {
      this.progress.add(chapter.id);
      writeProgress(this.progress);
    }
    this.renderChapters();
    this.el.resultKicker.textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    this.el.resultTitle.textContent = won ? '任务完成' : '任务失败';
    this.el.resultText.textContent = won
      ? chapter.afterWin
      : '牌局输了，但故事还没有结束。重新坐下，把这一手赢回来。';
    const next = CHAPTERS[CHAPTERS.indexOf(chapter) + 1];
    this.el.btnResultNext.classList.toggle('hidden', !won || !next);
    this.el.btnResultNext.textContent = next ? `进入下一关 · ${next.title}` : '回到章节';
    this.el.btnResultRetry.classList.toggle('hidden', won);
    this.el.result.classList.remove('hidden');
    this.el.screen?.classList.add('hidden');
    this.cinema?.pause();
    document.body.classList.remove('story-open');
    document.body.classList.add('story-result-open');
    audio.setMusic(false);
  }

  hideResult() {
    this.el.result?.classList.add('hidden');
    document.body.classList.remove('story-result-open');
  }

  async leaveGame() {
    this.hideResult();
    try {
      await this.onExit?.();
    } finally {
      this.open();
    }
  }

  async resultNext() {
    const next = this.lastResult?.won
      ? CHAPTERS[CHAPTERS.indexOf(this.lastResult.chapter) + 1]
      : null;
    await this.leaveGame();
    if (next) this.selectChapter(next.id);
  }

  async resultRetry() {
    const chapter = this.lastResult?.chapter || this.current;
    await this.leaveGame();
    if (chapter) this.selectChapter(chapter.id);
  }

  async resultBack() {
    await this.leaveGame();
  }
}

export { CHAPTERS };
