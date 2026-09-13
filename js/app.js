import {
  auth, isConfigured, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInAnonymously, sendSignInLinkToEmail, isSignInWithEmailLink,
  signInWithEmailLink, signOut, updateProfile,
} from "./firebase.js";
import * as mp from "./multiplayer.js";
import * as history from "./history.js";
import { catalogIds, catalogError, textFor, optionsFor, sourceFor } from "./catalog.js";
import { pickSingleplayerQueue } from "./selection.js";
import { pointsForChoice, tallyChoices } from "./scoring.js";
import * as globalStats from "./stats.js";

const $ = (id) => document.getElementById(id);
const el = (tag, text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};

/* ---------- theme ---------- */
const themeButton = $("theme-toggle");
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "Light" : "Dark";
  try { localStorage.setItem("theme", theme); } catch {}
}
themeButton.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
let savedTheme = "light";
try { savedTheme = localStorage.getItem("theme") || "light"; } catch {}
applyTheme(savedTheme);

/* ---------- global percentage preference ---------- */
const statsToggle = $("stats-toggle");
const STATS_PREFERENCE_KEY = "moral-dilemma:show-percentages";
let showPercentages = true;
try { showPercentages = localStorage.getItem(STATS_PREFERENCE_KEY) !== "false"; } catch {}

function applyStatsPreference(value) {
  showPercentages = value;
  statsToggle.textContent = value ? "Hide percentages" : "Show percentages";
  statsToggle.setAttribute("aria-pressed", String(value));
  try { localStorage.setItem(STATS_PREFERENCE_KEY, String(value)); } catch {}
}
applyStatsPreference(showPercentages);

/* ---------- views ---------- */
function showView(name) {
  for (const view of document.querySelectorAll(".view")) view.hidden = true;
  $("view-" + name).hidden = false;
  document.body.dataset.view = name;
  $("home-button").hidden = name === "home";
}
for (const button of document.querySelectorAll("[data-back]")) {
  button.addEventListener("click", () => showView("home"));
}
function setError(id, message) {
  const node = $(id);
  node.textContent = message || "";
  node.hidden = !message;
}

/* ---------- state ---------- */
const state = {
  user: null,
  code: null,
  room: null,
  players: [],
  roundNumber: 0,
  round: null,
  choices: [],
  submitted: [],
  myChoice: null,
  contrib: [],
  scoredRound: 0,
  recordedRound: 0,
  contributedTo: null,
  globalStats: null,
  globalStatsId: null,
  globalStatsError: "",
  history: new Map(),
  signature: "",
};
let scoreRetries = 0;
let claimingHost = false;
let roomUnsubs = [];
let roundUnsubs = [];
let choicesUnsub = null;

function stopRound() {
  roundUnsubs.forEach((fn) => fn());
  roundUnsubs = [];
  if (choicesUnsub) choicesUnsub();
  choicesUnsub = null;
  scoreRetries = 0;
  Object.assign(state, {
    round: null, choices: [], submitted: [],
    myChoice: null, scoredRound: 0, recordedRound: 0,
    globalStats: null, globalStatsId: null, globalStatsError: "",
  });
}
function stopRoom() {
  stopRound();
  roomUnsubs.forEach((fn) => fn());
  roomUnsubs = [];
  Object.assign(state, {
    code: null, room: null, players: [], contrib: [], roundNumber: 0,
    scoredRound: 0, recordedRound: 0, contributedTo: null, signature: "",
  });
}

// Detaches the room's listeners before removing the player document, so the
// closing listeners never see the permission loss their own delete causes.
async function leaveCurrentRoom() {
  const { code, user } = state;
  stopRoom();
  if (!code || !user) return;
  try { await mp.leaveRoom(code, user.uid); } catch {}
}

async function goHome() {
  showView("home");
  await leaveCurrentRoom();
}

$("home-button").addEventListener("click", () => { void goHome(); });
statsToggle.addEventListener("click", () => {
  applyStatsPreference(!showPercentages);
  if (!$("view-single").hidden) renderSingle();
  if (!$("view-room").hidden) update();
});

/* ---------- auth ---------- */
state.history = history.localHistory();
if (!isConfigured) {
  setError("global-error", "Firebase is not configured yet — see README.md. Singleplayer still works.");
}
if (catalogError) setError("global-error", "Could not load dilemmas.json: " + catalogError.message);

if (isConfigured) {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    // A guest keeps the "Sign in" button so they can upgrade to a real account.
    const hasAccount = !!user && !user.isAnonymous;
    $("btn-auth").textContent = hasAccount ? "Account" : "Sign in";
    $("auth-signed-out").hidden = hasAccount;
    $("auth-signed-in").hidden = !hasAccount;
    $("auth-who").textContent = hasAccount ? "Signed in as " + user.email : "";
    if (!user) {
      state.history = history.localHistory();
      return;
    }
    try {
      // A signed-out session's history is folded into the account it signs in to.
      state.history = await history.mergeLocalInto(user.uid, await history.loadRemote(user.uid));
    } catch (error) {
      setError("auth-error", error.message);
    }
  });
}

// Records that this user has seen a dilemma. Writing the same dilemma twice is
// a no-op, so reconnects cannot duplicate history.
async function recordSeen(dilemmaId) {
  if (!dilemmaId) return false;
  if (state.history.has(dilemmaId)) return true;
  const seenAt = Date.now();
  state.history.set(dilemmaId, seenAt);
  try {
    if (state.user) await history.recordRemote(state.user.uid, dilemmaId, null);
    else history.recordLocal(dilemmaId);
    return true;
  } catch (error) {
    state.history.delete(dilemmaId);
    return false;
  }
}

function requireAuth() {
  if (!isConfigured) {
    setError("global-error", "Firebase is not configured yet — see README.md.");
    return false;
  }
  if (!state.user) {
    showView("choose");
    return false;
  }
  return true;
}

// A room with no dilemmas to serve cannot start a round, so refuse at the door
// rather than failing part-way through starting a game.
function requireCatalog(errorId) {
  if (catalogIds.length) return true;
  setError(errorId, "No dilemmas are loaded, so multiplayer is unavailable.");
  return false;
}

const EMAIL_LINK_KEY = "moral-dilemma:email-link";
const emailLinkStatus = $("auth-link-status");
const emailLinkButton = $("btn-email-complete");

function setEmailLinkStatus(message) {
  emailLinkStatus.textContent = message || "";
  emailLinkStatus.hidden = !message;
}

function emailLinkSettings() {
  return {
    url: window.location.origin + window.location.pathname,
    handleCodeInApp: true,
  };
}

async function completeEmailLink(email) {
  if (!isConfigured) {
    setError("auth-error", "Firebase is not configured yet — see README.md.");
    return;
  }
  const address = (email || "").trim();
  if (!address) {
    setError("auth-error", "Enter the email address that received the link.");
    return;
  }
  try {
    await signInWithEmailLink(auth, address, window.location.href);
    try { localStorage.removeItem(EMAIL_LINK_KEY); } catch {}
    window.history.replaceState({}, document.title, window.location.pathname);
    emailLinkButton.hidden = true;
    setEmailLinkStatus("Signed in with your email link.");
    showView("home");
  } catch (error) {
    const spent = ["auth/invalid-action-code", "auth/expired-action-code", "auth/invalid-email"]
      .includes(error?.code);
    if (spent) {
      try { localStorage.removeItem(EMAIL_LINK_KEY); } catch {}
    }
    // Only a spent link is worth requesting a new one for; anything else (a
    // dropped connection, a disabled account) needs its own message.
    setError("auth-error", spent
      ? "That sign-in link is invalid or expired. Request a new one."
      : error?.message || "Could not complete the sign-in link.");
  }
}

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("auth-error", "");
  try {
    await signInWithEmailAndPassword(auth, $("auth-email").value.trim(), $("auth-password").value);
  } catch (error) { setError("auth-error", error.message); }
});
$("auth-link-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("auth-error", "");
  setEmailLinkStatus("");
  if (!isConfigured) return setError("auth-error", "Firebase is not configured yet — see README.md.");
  const email = $("auth-link-email").value.trim();
  if (!email) return setError("auth-error", "Enter an email address.");
  try {
    await sendSignInLinkToEmail(auth, email, emailLinkSettings());
    try { localStorage.setItem(EMAIL_LINK_KEY, email); } catch {}
    setEmailLinkStatus("Check your email for a sign-in link. Keep this tab open or return to it from the link.");
  } catch (error) { setError("auth-error", error.message); }
});
$("btn-email-complete").addEventListener("click", () => completeEmailLink($("auth-link-email").value));
if (isConfigured && isSignInWithEmailLink(auth, window.location.href)) {
  showView("auth");
  let rememberedEmail = "";
  try { rememberedEmail = localStorage.getItem(EMAIL_LINK_KEY) || ""; } catch {}
  $("auth-link-email").value = rememberedEmail;
  emailLinkButton.hidden = false;
  if (rememberedEmail) {
    completeEmailLink(rememberedEmail);
  } else {
    setEmailLinkStatus("Enter the email address that received the link, then complete sign-in.");
  }
}
$("btn-signup").addEventListener("click", async () => {
  setError("auth-error", "");
  try {
    const credential = await createUserWithEmailAndPassword(
      auth, $("auth-email").value.trim(), $("auth-password").value);
    const name = $("auth-name").value.trim();
    if (name) await updateProfile(credential.user, { displayName: name });
  } catch (error) { setError("auth-error", error.message); }
});
$("guest-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("guest-error", "");
  if (!isConfigured) return setError("guest-error", "Firebase is not configured yet — see README.md.");
  const button = $("guest-form").querySelector("button");
  button.disabled = true;
  try {
    const credential = await signInAnonymously(auth);
    const name = $("guest-name").value.trim();
    if (name) await updateProfile(credential.user, { displayName: name });
    showView("rooms");
  } catch (error) {
    setError("guest-error", error?.code === "auth/operation-not-allowed"
      ? "Guest play is not enabled yet. Enable Anonymous sign-in in Firebase."
      : error.message);
  } finally {
    button.disabled = false;
  }
});
$("btn-signout").addEventListener("click", async () => {
  // Leave first: once signed out, nobody may delete this player document, and an
  // abandoned seat stalls the room everyone else is still playing in.
  await leaveCurrentRoom();
  await signOut(auth);
  showView("home");
});

/* ---------- home ---------- */
$("btn-auth").addEventListener("click", () => { setError("auth-error", ""); showView("auth"); });
$("btn-rooms").addEventListener("click", () => {
  setError("rooms-error", "");
  if (!requireCatalog("global-error")) return;
  if (requireAuth()) showView("rooms");
});
$("btn-choose-account").addEventListener("click", () => { setError("auth-error", ""); showView("auth"); });
$("btn-choose-guest").addEventListener("click", () => {
  setError("guest-error", "");
  $("guest-name").value = "";
  showView("guest");
  $("guest-name").focus();
});
$("btn-singleplayer").addEventListener("click", () => { startSingleplayer(); showView("single"); });

/* ---------- create / join ---------- */
$("btn-create-room").addEventListener("click", async () => {
  if (!requireAuth()) return;
  setError("rooms-error", "");
  if (!requireCatalog("rooms-error")) return;
  const totalRounds = Number($("create-rounds").value);
  if (!Number.isInteger(totalRounds) || totalRounds < 1 || totalRounds > 20) {
    return setError("rooms-error", "Rounds must be a whole number from 1 to 20.");
  }
  try {
    enterRoom(await mp.createRoom(state.user, totalRounds));
  } catch (error) { setError("rooms-error", error.message); }
});
$("join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireAuth()) return;
  setError("rooms-error", "");
  if (!requireCatalog("rooms-error")) return;
  const code = $("join-code").value.trim().toUpperCase();
  // An empty or malformed code would reach the SDK as an invalid document path
  // and surface as an internal Firestore error.
  if (!/^[A-Z0-9]{4}$/.test(code)) {
    return setError("rooms-error", "Enter the four-character room code.");
  }
  try {
    await mp.joinRoom(code, state.user);
    enterRoom(code);
  } catch (error) { setError("rooms-error", error.message); }
});
$("btn-leave").addEventListener("click", async () => {
  showView("home");
  await leaveCurrentRoom();
});

/* ---------- room subscriptions ---------- */
function enterRoom(code) {
  stopRoom();
  state.code = code;
  setError("room-error", "");
  showView("room");
  roomUnsubs.push(mp.onSnapshot(mp.roomRef(code), (snap) => {
    state.room = snap.exists() ? snap.data() : null;
    if (state.room && state.room.currentRound !== state.roundNumber) {
      state.roundNumber = state.room.currentRound;
      stopRound();
      if (state.roundNumber > 0) watchRound(code, state.roundNumber);
    }
    update();
  }, roomFailed));
  roomUnsubs.push(mp.onSnapshot(mp.contribRef(code), (snap) => {
    state.contrib = snap.docs.map((d) => d.id);
    update();
  }, roomFailed));
  roomUnsubs.push(mp.onSnapshot(mp.playersRef(code), (snap) => {
    state.players = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
    update();
  }, roomFailed));
}

function roomFailed(error) {
  setError("room-error", roomErrorMessage(error));
}

function isPermissionDenied(error) {
  return error?.code === "permission-denied"
    || /missing or insufficient permissions/i.test(error?.message || "");
}

function roomErrorMessage(error) {
  if (isPermissionDenied(error)) {
    return "Room access was lost. Leave the room and join again.";
  }
  return error?.message || "Something went wrong in this room.";
}

function watchRoundStats(round) {
  const dilemmaId = round?.dilemmaId;
  if (!dilemmaId || state.globalStatsId === dilemmaId) return;
  state.globalStatsId = dilemmaId;
  state.globalStats = null;
  state.globalStatsError = "";
  const optionCount = (round.options || optionsFor(dilemmaId)).length;
  if (!isConfigured) return;
  roundUnsubs.push(globalStats.watchGlobalStats(
    dilemmaId,
    optionCount,
    (value) => { state.globalStats = value; state.globalStatsError = ""; update(); },
    () => { state.globalStatsError = "Global percentages are unavailable right now."; update(); },
  ));
}

// Every player's choice becomes readable only once the round is in results, so
// the rules check the round's phase on the server. The host sees its own phase
// change locally before the server acknowledges it, so subscribe from the
// server-confirmed snapshot and retry a denial instead of treating it as fatal.
function watchChoices(code, n) {
  if (choicesUnsub) return;
  let attempts = 0;
  const attach = () => {
    choicesUnsub = mp.onSnapshot(mp.choicesRef(code, n), (choiceSnap) => {
      attempts = 0;
      state.choices = choiceSnap.docs.map((d) => ({ player: d.id, ...d.data() }));
      update();
    }, (error) => {
      choicesUnsub = null;
      if (isPermissionDenied(error) && state.roundNumber === n && attempts < 5) {
        attempts += 1;
        setTimeout(() => {
          if (state.roundNumber === n && state.round?.phase !== "answer") attach();
        }, 300 * attempts);
        return;
      }
      roomFailed(error);
    });
  };
  attach();
}

// A re-subscribe leaves state.myChoice empty even though the submission stands,
// so the "Your choice" list would render with nothing selected. The rules let a
// player read their own choice while the round is still open.
async function loadOwnChoice(code, n) {
  if (!state.user || Number.isInteger(state.myChoice)) return;
  try {
    const value = await mp.myChoice(code, n, state.user.uid);
    if (state.code !== code || state.roundNumber !== n) return;
    if (!Number.isInteger(value) || Number.isInteger(state.myChoice)) return;
    state.myChoice = value;
    update();
  } catch { /* the choice is optional context; the submitted marker still gates the form */ }
}

function watchRound(code, n) {
  void loadOwnChoice(code, n);
  roundUnsubs.push(mp.onSnapshot(mp.roundRef(code, n), { includeMetadataChanges: true }, (snap) => {
    state.round = snap.exists() ? snap.data() : null;
    watchRoundStats(state.round);
    if (state.round && state.round.phase !== "answer" && !snap.metadata.hasPendingWrites) {
      watchChoices(code, n);
    }
    update();
  }, roomFailed));
  roundUnsubs.push(mp.onSnapshot(mp.submittedRef(code, n), (snap) => {
    state.submitted = snap.docs.map((d) => d.id);
    update();
  }, roomFailed));
}

let hostBusy = false;
const isHost = () => state.room && state.user && state.room.hostUid === state.user.uid;

// Only the host can advance a room, so a room whose host has left would be stuck
// forever. The longest-present remaining player takes over.
async function claimHostTick() {
  const { code, room, players, user } = state;
  if (!room || !user || claimingHost || room.status === "finished") return;
  if (players.length === 0 || players.some((player) => player.uid === room.hostUid)) return;
  if (players[0].uid !== user.uid) return;
  claimingHost = true;
  try { await mp.claimHost(code, user.uid); }
  catch (error) { setError("room-error", roomErrorMessage(error)); }
  finally { claimingHost = false; }
}

async function hostTick() {
  const { code, room, round, roundNumber, players, submitted } = state;
  if (!isHost() || !room || hostBusy) return;
  if (room.status === "selecting") {
    if (state.contrib.length < players.length || players.length === 0) return;
    hostBusy = true;
    try { await mp.finalizeSelection(code, room); }
    catch (error) { setError("room-error", roomErrorMessage(error)); }
    finally { hostBusy = false; }
    return;
  }
  if (room.status !== "playing" || !round) return;
  hostBusy = true;
  try {
    if (round.phase === "answer" && players.length > 0 && submitted.length >= players.length) {
      await mp.showResults(code, roundNumber);
    }
  } catch (error) {
    setError("room-error", roomErrorMessage(error));
  } finally {
    hostBusy = false;
  }
}

// Submitted markers can never be deleted, so every client eventually agrees on
// exactly which choices belong to this round. Comparing against the live player
// roster instead would let clients tally different sets — and score differently —
// whenever someone leaves after submitting.
function choicesComplete() {
  return state.submitted.length > 0 && state.choices.length >= state.submitted.length;
}

async function scoreTick() {
  const { code, round, roundNumber, choices, user } = state;
  if (!round || round.phase !== "results" || state.scoredRound === roundNumber) return;
  if (!choicesComplete()) return;
  const myChoice = ownRoundChoice();
  if (!Number.isInteger(myChoice)) return;
  state.scoredRound = roundNumber;
  try {
    await mp.recordScore(code, user.uid, roundNumber, pointsForChoice(myChoice, choices));
    scoreRetries = 0;
  } catch (error) {
    state.scoredRound = 0;
    setError("room-error", roomErrorMessage(error));
    // Nothing else will necessarily arrive to re-run this, so retry rather than
    // leaving the round unscored.
    if (scoreRetries < 3) {
      scoreRetries += 1;
      const delay = 500 * scoreRetries;
      setTimeout(() => { if (state.roundNumber === roundNumber) update(); }, delay);
    }
  }
}

/* ---------- room rendering ---------- */
// Every player rates the candidate list against their own history. Only the
// per-dilemma totals are shared, never one player's history.
async function contributeTick() {
  const { code, room, user } = state;
  if (!room || room.status !== "selecting" || !user) return;
  if (state.contributedTo === code + ":" + (room.candidates || []).length) return;
  if (state.contrib.includes(user.uid)) return;
  state.contributedTo = code + ":" + (room.candidates || []).length;
  try {
    await mp.contribute(code, user.uid, room.candidates || [], state.history);
  } catch (error) {
    state.contributedTo = null;
    setError("room-error", roomErrorMessage(error));
  }
}

function historyTick() {
  const { round, roundNumber } = state;
  if (!round || !round.dilemmaId || state.recordedRound === roundNumber) return;
  state.recordedRound = roundNumber;
  void recordSeen(round.dilemmaId).then((recorded) => {
    // Clear the marker on failure so the next snapshot tries again.
    if (!recorded && state.roundNumber === roundNumber) state.recordedRound = 0;
  });
}

function ownRoundChoice() {
  if (Number.isInteger(state.myChoice)) return state.myChoice;
  return state.choices.find((choice) => choice.player === state.user?.uid)?.optionIndex ?? null;
}

function update() {
  claimHostTick();
  hostTick();
  contributeTick();
  historyTick();
  scoreTick();
  const signature = JSON.stringify([
    state.room, state.roundNumber, state.contrib.length, state.round, state.myChoice,
    state.players.map((p) => [p.uid, p.name, p.score, p.roundScores]),
    state.submitted,
    state.choices.map((v) => [v.player, v.optionIndex]),
    state.globalStats && [
      state.globalStats.total,
      [...state.globalStats.counts.entries()],
    ],
    state.globalStatsError,
    showPercentages,
  ]);
  if (signature === state.signature) return;
  state.signature = signature;
  renderRoom();
}

function renderRoom() {
  renderRoomBody();
}

function renderRoomBody() {
  const { room, round, roundNumber, players, code } = state;
  const header = $("room-header");
  const body = $("room-body");
  body.replaceChildren();
  if (!room) {
    header.textContent = "Room " + code;
    body.append(el("p", "This room no longer exists."));
    return;
  }
  header.textContent = room.status === "playing"
    ? `Room ${code} — round ${roundNumber} of ${room.totalRounds}`
    : `Room ${code}`;

  if (room.status === "lobby") return renderLobby(body, room, players);
  if (room.status === "selecting") {
    return void body.append(el("p", `Choosing dilemmas… (${state.contrib.length} of ${players.length})`));
  }
  if (room.status === "finished") {
    return renderScoreboard(body, players, "Final scoreboard");
  }
  if (!round) return void body.append(el("p", "Loading round…"));
  if (round.phase === "answer") {
    return renderChoiceAnswer(body, round, players);
  }
  return renderChoiceResults(body, round, players);
}

function renderLobby(body, room, players) {
  body.append(el("h2", "Players"));
  const list = el("ul");
  for (const player of players) list.append(el("li", player.name));
  body.append(list);
  if (!isHost()) {
    body.append(
      el("p", `Rounds: ${room.totalRounds}`),
      el("p", "Waiting for the host to start."),
    );
    return;
  }
  const input = el("input");
  input.id = "lobby-rounds";
  input.type = "number";
  input.min = "1";
  input.max = "20";
  input.value = String(room.totalRounds);
  input.addEventListener("change", () => {
    const value = Number(input.value);
    if (Number.isInteger(value) && value >= 1 && value <= 20) mp.setTotalRounds(state.code, value);
    else setError("room-error", "Rounds must be a whole number from 1 to 20.");
  });
  const settings = el("div");
  settings.className = "settings-panel";
  const setting = (labelText, control) => {
    const row = el("div");
    row.className = "setting-row";
    const label = el("label", labelText);
    label.htmlFor = control.id;
    row.append(label, control);
    return row;
  };
  settings.append(setting("Number of rounds", input));
  body.append(el("h2", "Game options"), settings);
  const start = el("button", "Start game");
  start.type = "button";
  start.disabled = players.length < 2;
  start.addEventListener("click", async () => {
    start.disabled = true;
    try { await mp.proposeSelection(state.code, room.totalRounds, catalogIds); }
    catch (error) { setError("room-error", roomErrorMessage(error)); start.disabled = false; }
  });
  body.append(start);
  if (players.length < 2) body.append(el("p", "At least two players are needed."));
}

function dilemmaBlock(round) {
  const node = el("p", round.dilemma || textFor(round.dilemmaId));
  node.className = "dilemma";
  const wrapper = document.createElement("div");
  wrapper.append(node);
  const source = sourceFor(round.dilemmaId);
  if (source && source.url) wrapper.append(sourceLine(source));
  return wrapper;
}

function sourceLine(source) {
  const line = el("p");
  line.className = "muted";
  const link = el("a", source.title || source.url);
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  const prefix = String(source.type).includes("inspiration") ? "Inspired by: " : "Source: ";
  line.append(prefix, link);
  return line;
}

function globalPercentage(stats, index) {
  if (!stats || !stats.total) return null;
  return Math.round(((stats.counts.get(index) || 0) / stats.total) * 100);
}

function choiceFieldset(options, {
  name,
  legend = "Choose one",
  disabled = false,
  selectedIndex = null,
  stats = null,
  includePercentages = false,
} = {}) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "choice-list";
  fieldset.append(el("legend", legend));
  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "choice-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = String(index);
    radio.disabled = disabled;
    radio.checked = index === selectedIndex;
    const choiceText = el("span", option);
    choiceText.className = "choice-label-text";
    label.append(radio, choiceText);
    if (includePercentages) {
      const percentage = globalPercentage(stats, index);
      const detail = el("span", percentage === null ? "—" : `${percentage}%`);
      detail.className = "choice-percentage";
      label.append(detail);
    }
    fieldset.append(label);
  });
  return fieldset;
}

function renderChoiceAnswer(body, round, players) {
  body.append(dilemmaBlock(round));
  const done = state.submitted.includes(state.user.uid) || Number.isInteger(state.myChoice);
  const options = round.options || optionsFor(round.dilemmaId);
  if (done) {
    body.append(choiceFieldset(options, {
      name: "round-choice",
      legend: "Your choice",
      disabled: true,
      selectedIndex: state.myChoice,
      stats: state.globalStats,
      includePercentages: showPercentages,
    }));
    if (state.globalStatsError && showPercentages) body.append(el("p", state.globalStatsError));
    body.append(el("p", `Choice submitted. Waiting for everyone (${state.submitted.length} of ${players.length}).`));
    body.append(...waitingOnControls(players));
    return;
  }
  const fieldset = choiceFieldset(options, { name: "round-choice" });
  const submit = el("button", "Submit choice");
  submit.type = "button";
  submit.addEventListener("click", async () => {
    const selected = fieldset.querySelector("input:checked");
    if (!selected) return setError("room-error", "Choose an option first.");
    submit.disabled = true;
    setError("room-error", "");
    const optionIndex = Number(selected.value);
    try {
      state.myChoice = await mp.submitChoice(state.code, state.roundNumber, state.user.uid, optionIndex);
      try {
        state.globalStats = await globalStats.recordGlobalResponse(
          state.round.dilemmaId, optionIndex, options.length);
      } catch {
        state.globalStatsError = "Your choice was submitted, but global percentages are unavailable right now.";
      }
      update();
    } catch (error) {
      setError("room-error", roomErrorMessage(error));
      submit.disabled = false;
    }
  });
  body.append(fieldset, submit);
  body.append(...waitingOnControls(players));
}

// A player who closed their tab still holds a seat, and the round only advances
// once everyone has submitted, so the host needs a way to clear that seat.
function waitingOnControls(players) {
  if (!isHost()) return [];
  const waiting = players.filter(
    (player) => player.uid !== state.user.uid && !state.submitted.includes(player.uid));
  if (waiting.length === 0) return [];
  const list = el("ul");
  for (const player of waiting) {
    const item = el("li");
    item.append(el("span", player.name));
    const remove = el("button", "Remove");
    remove.type = "button";
    remove.className = "inline-button";
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try { await mp.leaveRoom(state.code, player.uid); }
      catch (error) { setError("room-error", roomErrorMessage(error)); remove.disabled = false; }
    });
    item.append(remove);
    list.append(item);
  }
  return [el("h2", "Still choosing"), list];
}

function renderChoiceResults(body, round, players) {
  body.append(dilemmaBlock(round), el("h2", "Results"));
  const options = round.options || optionsFor(round.dilemmaId);
  const roundKey = String(state.roundNumber);
  const complete = choicesComplete();
  const scoresReady = complete && players.length > 0 && players.every(
    (player) => Object.prototype.hasOwnProperty.call(player.roundScores || {}, roundKey),
  );
  const tally = tallyChoices(state.choices);
  const list = el("ol");
  options.forEach((option, index) => {
    const item = el("li");
    item.append(el("span", option));
    // The room counts are what scoring used; the percentages are site-wide.
    if (complete) {
      const count = tally.get(index) || 0;
      const inRoom = el("span", `${count} in room`);
      inRoom.className = "room-count";
      item.append(inRoom);
    }
    if (showPercentages) {
      const percentage = globalPercentage(state.globalStats, index);
      const detail = el("span", percentage === null ? "—" : `${percentage}%`);
      detail.className = "choice-percentage";
      item.append(detail);
    }
    list.append(item);
  });
  body.append(list);
  body.append(el("p", "The most common choice earns one point. If the top choice is tied, everyone earns one point."));
  if (!complete) {
    body.append(el("p", "Collecting choices…"));
    return;
  }
  const points = pointsForChoice(ownRoundChoice(), state.choices);
  body.append(el("p", `You earned ${points} point${points === 1 ? "" : "s"} this round.`));
  if (scoresReady) renderScoreboard(body, players, "Scores");
  if (!isHost()) {
    body.append(el("p", scoresReady ? "Waiting for the host." : "Scoring…"));
    return;
  }
  // Advancing waits on the choices, not on every player having written their own
  // score: one player who has gone offline must not strand the whole room.
  if (!scoresReady) body.append(el("p", "Scoring…"));
  const last = state.roundNumber >= state.room.totalRounds;
  const next = el("button", last ? "Finish game" : "Next round");
  next.type = "button";
  next.addEventListener("click", async () => {
    next.disabled = true;
    try { await mp.nextRound(state.code, state.room); }
    catch (error) { setError("room-error", roomErrorMessage(error)); next.disabled = false; }
  });
  body.append(next);
}

function renderScoreboard(body, players, title) {
  body.append(el("h2", title));
  const list = el("ol");
  for (const player of players.slice().sort((a, b) => (b.score || 0) - (a.score || 0))) {
    list.append(el("li", `${player.name} — ${player.score || 0}`));
  }
  body.append(list);
}

/* ---------- singleplayer ---------- */
let queue = [];
let queueIndex = 0;
let singleSubmitted = false;
let singleSubmittedChoice = null;
let singleStats = null;
let singleStatsError = "";

function startSingleplayer() {
  // Unseen dilemmas first; the queue is rebuilt whenever it runs out.
  queue = pickSingleplayerQueue(catalogIds, state.history, catalogIds.length);
  queueIndex = 0;
  singleSubmitted = false;
  singleSubmittedChoice = null;
  singleStats = null;
  singleStatsError = "";
  renderSingle();
}

function renderSingle() {
  if (queueIndex >= queue.length) {
    queue = pickSingleplayerQueue(catalogIds, state.history, catalogIds.length);
    queueIndex = 0;
  }
  const id = queue[queueIndex];
  const source = $("single-source");
  const options = $("single-options");
  source.replaceChildren();
  options.replaceChildren();
  if (!id) {
    $("single-dilemma").textContent = "No dilemmas available.";
    return;
  }
  $("single-dilemma").textContent = textFor(id);
  $("single-dilemma").className = "dilemma";
  const meta = sourceFor(id);
  if (meta && meta.url) source.append(sourceLine(meta));
  options.hidden = false;
  const dilemmaOptions = optionsFor(id);
  options.append(choiceFieldset(dilemmaOptions, {
    name: "single-choice",
    legend: singleSubmitted ? "Your choice" : "Choose one",
    disabled: singleSubmitted,
    selectedIndex: singleSubmittedChoice,
    stats: singleStats,
    includePercentages: singleSubmitted && showPercentages,
  }));
  const submit = $("single-form").querySelector("button[type=submit]");
  submit.textContent = singleSubmitted ? "Next dilemma" : "Submit choice";
  submit.disabled = false;
  if (singleStatsError && showPercentages) options.append(el("p", singleStatsError));
  recordSeen(id);
}

$("single-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (singleSubmitted) {
    queueIndex += 1;
    singleSubmitted = false;
    singleSubmittedChoice = null;
    singleStats = null;
    singleStatsError = "";
    renderSingle();
    return;
  }
  const selected = document.querySelector("#single-options input:checked");
  if (!selected) return;
  const id = queue[queueIndex];
  const optionIndex = Number(selected.value);
  const optionCount = optionsFor(id).length;
  const submit = $("single-form").querySelector("button[type=submit]");
  submit.disabled = true;
  singleStatsError = "";
  try {
    singleStats = await globalStats.recordGlobalResponse(id, optionIndex, optionCount);
  } catch {
    singleStats = null;
    singleStatsError = "Your choice was submitted, but global percentages are unavailable right now.";
  }
  singleSubmittedChoice = optionIndex;
  singleSubmitted = true;
  renderSingle();
});
