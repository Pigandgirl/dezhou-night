// Lobby visual smoke: guest page, settings-only login, logged-in page.
// Run: node qa/shot-lobby.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, freePort, sleep, makeUser,
} from './lib/env.mjs';
import { BrowserPage } from './lib/browser.mjs';

const outDir = path.join(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const sandbox = createSandbox({
  users: [makeUser({
    username: 'shot_user', name: '玩家一号', plays: 10, chips: 320, points: 1280,
    tokens: [{ token: 'shot_token', at: Date.now() }],
  })],
  label: 'lobby-shot',
});
let server;
let page;
try {
  const port = await freePort();
  server = await startServer(sandbox, { port });
  page = await new BrowserPage('lobby').launch();
  await page.goto(`http://127.0.0.1:${port}/play`, 4500);
  await page.waitFor(`!!window.__poker`, 8000);
  await sleep(1200);
  const guest = await page.eval(`JSON.stringify({
    mode: window.__poker.hud.mode,
    online: document.getElementById('onlineCount')?.textContent,
    modes: document.querySelectorAll('.mode-card').length,
    player: document.getElementById('playerName')?.textContent,
    loginHidden: document.getElementById('loginOverlay')?.classList.contains('hidden'),
    accountBar: document.getElementById('accountBar') ? 'present' : 'removed',
    redeem: document.getElementById('redeemModal') ? 'present' : 'removed',
    quick: !!document.getElementById('btnQuickMatch'),
  })`);
  console.log('guest', guest);
  await page.screenshot(path.join(outDir, 'lobby.png'));

  await page.eval(`document.getElementById('btnLobbyGear').click()`);
  await sleep(700);
  const guestSettings = await page.eval(`JSON.stringify({
    loginVisible: !document.getElementById('btnLobbyLogin').classList.contains('hidden'),
    loginText: document.getElementById('btnLobbyLogin').textContent.trim(),
    exitText: document.getElementById('btnLobbyExit').textContent.trim(),
    redeem: !!document.getElementById('btnLobbyRedeem'),
  })`);
  console.log('guest settings', guestSettings);
  await page.screenshot(path.join(outDir, 'lobby-settings.png'));

  await page.eval(`document.getElementById('btnLobbyLogin').click()`);
  await sleep(500);
  const overlay = await page.eval(`!document.getElementById('loginOverlay').classList.contains('hidden')`);
  console.log('login overlay', overlay);
  await page.eval(`document.querySelector('.login-tab[data-tab="register"]').click()`);
  await sleep(250);
  const registerUi = await page.eval(`JSON.stringify({
    nameVisible: !document.getElementById('loginName').classList.contains('hidden'),
    labelVisible: !document.getElementById('loginNameLabel').classList.contains('hidden'),
    autocomplete: document.getElementById('loginName').getAttribute('autocomplete'),
    placeholder: document.getElementById('loginName').getAttribute('placeholder'),
  })`);
  console.log('register nickname ui', registerUi);
  const reg = JSON.parse(registerUi);
  if (!reg.nameVisible || !reg.labelVisible) throw new Error(`register nickname missing: ${registerUi}`);
  await page.eval(`document.querySelector('.login-tab[data-tab="login"]').click()`);
  await sleep(200);
  await page.eval(`(() => {
    document.getElementById('loginUser').value = 'shot_user';
    document.getElementById('loginPass').value = 'pass1234';
    document.getElementById('btnLoginSubmit').click();
    return true;
  })()`);
  await sleep(2500);
  const logged = await page.eval(`JSON.stringify({
    player: document.getElementById('playerName')?.textContent,
    level: document.getElementById('playerLevel')?.textContent,
    chips: document.getElementById('resChips')?.textContent,
    points: document.getElementById('resPoints')?.textContent,
    plays: document.getElementById('resPlays')?.textContent,
    loginBtnHidden: document.getElementById('btnLobbyLogin')?.classList.contains('hidden'),
    logoutHidden: document.getElementById('btnLobbyLogout')?.classList.contains('hidden'),
    overlayHidden: document.getElementById('loginOverlay')?.classList.contains('hidden'),
    profile: document.getElementById('lobbyProfile')?.textContent.replace(/\\s+/g, ' ').slice(0, 100),
  })`);
  console.log('logged', logged);
  const roomExit = await page.eval(`(() => {
    const overlay = document.getElementById('roomOverlay');
    overlay.classList.remove('hidden');
    const modal = overlay.querySelector('.room-modal');
    const button = document.getElementById('btnRoomLeave');
    const delta = Math.round(button.getBoundingClientRect().top - modal.getBoundingClientRect().top);
    const text = button.textContent.trim();
    overlay.classList.add('hidden');
    return JSON.stringify({ delta, text });
  })()`);
  console.log('room exit top', roomExit);
  if (JSON.parse(roomExit).delta > 80) throw new Error('room leave is not top-right');

  const settingsUi = await page.eval(`JSON.stringify({
    nicknameVisible: !document.getElementById('btnLobbyNickname')?.classList.contains('hidden'),
    nicknameText: document.getElementById('btnLobbyNickname')?.textContent.trim(),
    exitTop: Boolean(document.getElementById('btnLobbyExitTop')),
    handle: document.querySelector('#lobbyProfile .profile-main em')?.textContent,
  })`);
  console.log('settings ui', settingsUi);
  await page.screenshot(path.join(outDir, 'lobby-settings-user.png'));
  await page.eval(`document.getElementById('btnLobbyNickname').click()`);
  await sleep(300);
  const nicknameUi = await page.eval(`JSON.stringify({
    settingsHidden: document.getElementById('lobbySettingsModal').classList.contains('hidden'),
    nicknameVisible: !document.getElementById('nicknameModal').classList.contains('hidden'),
    focused: document.activeElement === document.getElementById('nicknameInput'),
  })`);
  console.log('nickname ui', nicknameUi);
  const nick = JSON.parse(nicknameUi);
  if (!nick.settingsHidden || !nick.nicknameVisible) throw new Error(`nickname modal layering bug: ${nicknameUi}`);
  await page.screenshot(path.join(outDir, 'lobby-nickname.png'));
  await page.eval(`(() => {
    document.getElementById('nicknameInput').value = '夜航玩家';
    document.getElementById('btnNicknameSave').click();
    return true;
  })()`);
  await sleep(1400);
  const renamed = await page.eval(`JSON.stringify({
    player: document.getElementById('playerName')?.textContent,
    profileName: document.querySelector('#lobbyProfile .profile-main b')?.textContent,
    nicknameHidden: document.getElementById('nicknameModal')?.classList.contains('hidden'),
    error: document.getElementById('nicknameError')?.textContent,
  })`);
  console.log('renamed', renamed);
  await page.screenshot(path.join(outDir, 'lobby-after-nickname.png'));
  await page.eval(`document.getElementById('btnLobbySettingsBack').click()`);
  await sleep(500);
  await page.eval(`document.querySelector('[data-mode="friend"]').click()`);
  await sleep(400);
  await page.eval(`document.getElementById('btnCreateRoom').click()`);
  await sleep(300);
  await page.screenshot(path.join(outDir, 'lobby-create-room.png'));
  await page.eval(`(() => {
    document.getElementById('createPass').value = '246';
    document.getElementById('createChips').value = '240';
    document.getElementById('createBlind').value = '5/10';
    document.getElementById('createLoserSpectate').checked = true;
    document.getElementById('btnCreateConfirm').click();
    return true;
  })()`);
  await sleep(1600);
  const roomUi = await page.eval(`JSON.stringify({
    overlay: !document.getElementById('roomOverlay').classList.contains('hidden'),
    chips: document.getElementById('hostRoomChips')?.value,
    blind: document.getElementById('hostRoomBlind')?.value,
    spectate: document.getElementById('hostRoomSpectate')?.checked,
    hostPanel: !document.getElementById('hostRoomSettings')?.classList.contains('hidden'),
    hint: document.getElementById('roomHint')?.textContent,
  })`);
  console.log('room ui', roomUi);
  const parsedRoom = JSON.parse(roomUi);
  if (!parsedRoom.overlay || !parsedRoom.hostPanel) throw new Error('host room settings missing');
  if (parsedRoom.chips !== '240' || parsedRoom.blind !== '5/10' || !parsedRoom.spectate) {
    throw new Error(`room config mismatch: ${roomUi}`);
  }
  await page.eval(`(() => {
    document.getElementById('hostRoomChips').value = '300';
    document.getElementById('btnHostRoomSave').click();
    return true;
  })()`);
  await sleep(900);
  await page.screenshot(path.join(outDir, 'lobby-room-host.png'));
  await page.eval(`document.getElementById('btnRoomLeave').click()`);
  await sleep(700);
  await page.eval(`window.__poker.hud.setLobbyMode('match'); window.__poker.hud.refreshMatchRooms(); true`);
  await sleep(600);
  await page.screenshot(path.join(outDir, 'lobby-match.png'));
  await page.screenshot(path.join(outDir, 'lobby-user.png'));
  console.log('errors', page.errors.filter((e) => !/vibrate|favicon/i.test(e)));
} finally {
  await page?.close();
  stopServer(server);
  await sleep(500);
}
