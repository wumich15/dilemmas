import {
  auth, isConfigured, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendSignInLinkToEmail, isSignInWithEmailLink,
  signInWithEmailLink, signOut, updateProfile,
} from "./firebase.js";
import * as mp from "./multiplayer.js";
import * as history from "./history.js";
import { catalogIds, catalogError, textFor, optionsFor, sourceFor } from "./catalog.js";
import { pickSingleplayerQueue } from "./selection.js";
import { pointsForChoice, tallyChoices } from "./scoring.js";

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

/* ---------- views ---------- */
function showView(name) {
  for (const view of document.querySelectorAll(".view")) view.hidden = true;
  $("view-" + name).hidden = false;
  document.body.dataset.view = name;
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
  history: new Map(),
  signature: "",
};
let roomUnsubs = [];
let roundUnsubs = [];
let choicesUnsub = null;

function stopRound() {
  roundUnsubs.forEach((fn) => fn());
  roundUnsubs = [];
  if (choicesUnsub) choicesUnsub();
  choicesUnsub = null;
  Object.assign(state, {
    round: null, choices: [], submitted: [],
    myChoice: null, scoredRound: 0, recordedRound: 0,
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

/* ---------- auth ---------- */
state.history = history.localHistory();
if (!isConfigured) {
  setError("global-error", "Firebase is not configured yet — see README.md. Singleplayer still works.");
}
if (catalogError) setError("global-error", "Could not load dilemmas.json: " + catalogError.message);

if (isConfigured) {
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    $("btn-auth").textContent = user ? "Account" : "Sign in";
    $("auth-signed-out").hidden = !!user;
    $("auth-signed-in").hidden = !user;
    $("auth-who").textContent = user ? "Signed in as " + user.email : "";
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
  if (!dilemmaId || state.history.has(dilemmaId)) return;
  const seenAt = Date.now();
  state.history.set(dilemmaId, seenAt);
  try {
    if (state.user) await history.recordRemote(state.user.uid, dilemmaId, null);
    else history.recordLocal(dilemmaId);
  } catch (error) {
    state.history.delete(dilemmaId);
  }
}

function requireAuth() {
  if (!isConfigured) {
    setError("global-error", "Firebase is not configured yet — see README.md.");
    return false;
  }
  if (!state.user) {
    setError("auth-error", "Sign in first.");
    showView("auth");
    return false;
  }
  return true;
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
    if (["auth/invalid-action-code", "auth/expired-action-code", "auth/invalid-email"].includes(error?.code)) {
      try { localStorage.removeItem(EMAIL_LINK_KEY); } catch {}
    }
    setError("auth-error", "That sign-in link is invalid or expired. Request a new one.");
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
$("btn-signout").addEventListener("click", async () => {
  stopRoom();
  await signOut(auth);
  showView("home");
});

/* ---------- home ---------- */
$("btn-auth").addEventListener("click", () => { setError("auth-error", ""); showView("auth"); });
$("btn-rooms").addEventListener("click", () => {
  setError("rooms-error", "");
  if (requireAuth()) showView("rooms");
});
$("btn-singleplayer").addEventListener("click", () => { startSingleplayer(); showView("single"); });

/* ---------- create / join ---------- */
$("btn-create-room").addEventListener("click", async () => {
  if (!requireAuth()) return;
  setError("rooms-error", "");
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
  const code = $("join-code").value.trim().toUpperCase();
  try {
    await mp.joinRoom(code, state.user);
    enterRoom(code);
  } catch (error) { setError("rooms-error", error.message); }
});
$("btn-leave").addEventListener("click", async () => {
  const { code, user } = state;
  stopRoom();
  showView("home");
  try { await mp.leaveRoom(code, user.uid); } catch {}
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
  setError("room-error", error.message);
}

function watchRound(code, n) {
  roundUnsubs.push(mp.onSnapshot(mp.roundRef(code, n), (snap) => {
    state.round = snap.exists() ? snap.data() : null;
    if (state.round && state.round.phase !== "answer" && !choicesUnsub) {
      choicesUnsub = mp.onSnapshot(mp.choicesRef(code, n), (choiceSnap) => {
        state.choices = choiceSnap.docs.map((d) => ({ player: d.id, ...d.data() }));
        update();
      }, roomFailed);
      mp.myChoice(code, n, state.user.uid).then((choice) => { state.myChoice = choice; update(); }).catch(() => {});
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

async function hostTick() {
  const { code, room, round, roundNumber, players, submitted } = state;
  if (!isHost() || !room || hostBusy) return;
  if (room.status === "selecting") {
    if (state.contrib.length < players.length || players.length === 0) return;
    hostBusy = true;
    try { await mp.finalizeSelection(code, room); }
    catch (error) { setError("room-error", error.message); }
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
    setError("room-error", error.message);
  } finally {
    hostBusy = false;
  }
}

async function scoreTick() {
  const { code, round, roundNumber, players, choices, myChoice, user } = state;
  if (!round || round.phase !== "results" || state.scoredRound === roundNumber) return;
  // Wait for every choice to arrive locally before calculating the majority.
  if (players.length === 0 || choices.length < players.length || !Number.isInteger(myChoice)) return;
  state.scoredRound = roundNumber;
  try {
    await mp.recordScore(code, user.uid, roundNumber, pointsForChoice(myChoice, choices));
  } catch (error) {
    state.scoredRound = 0;
    setError("room-error", error.message);
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
    setError("room-error", error.message);
  }
}

function historyTick() {
  const { round, roundNumber } = state;
  if (!round || !round.dilemmaId || state.recordedRound === roundNumber) return;
  state.recordedRound = roundNumber;
  recordSeen(round.dilemmaId);
}

function update() {
  hostTick();
  contributeTick();
  historyTick();
  scoreTick();
  const signature = JSON.stringify([
    state.room, state.roundNumber, state.contrib.length, state.round, state.myChoice,
    state.players.map((p) => [p.uid, p.name, p.score]),
    state.submitted.length,
    state.choices.map((v) => [v.player, v.optionIndex]),
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
    catch (error) { setError("room-error", error.message); start.disabled = false; }
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

function renderChoiceAnswer(body, round, players) {
  body.append(dilemmaBlock(round));
  const done = state.submitted.includes(state.user.uid);
  if (done) {
    body.append(el("p", `Choice submitted. Waiting for everyone (${state.submitted.length} of ${players.length}).`));
    return;
  }
  const options = round.options || optionsFor(round.dilemmaId);
  const fieldset = document.createElement("fieldset");
  fieldset.className = "choice-list";
  fieldset.append(el("legend", "Choose one"));
  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "choice-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "round-choice";
    radio.value = String(index);
    label.append(radio, el("span", option));
    fieldset.append(label);
  });
  const submit = el("button", "Submit choice");
  submit.type = "button";
  submit.addEventListener("click", async () => {
    const selected = fieldset.querySelector("input:checked");
    if (!selected) return setError("room-error", "Choose an option first.");
    submit.disabled = true;
    setError("room-error", "");
    try { state.myChoice = await mp.submitChoice(state.code, state.roundNumber, state.user.uid, Number(selected.value)); }
    catch (error) { setError("room-error", error.message); submit.disabled = false; }
  });
  body.append(fieldset, submit);
}

function renderChoiceResults(body, round, players) {
  body.append(dilemmaBlock(round), el("h2", "Results"));
  const options = round.options || optionsFor(round.dilemmaId);
  const counts = tallyChoices(state.choices);
  const list = el("ol");
  options.forEach((option, index) => {
    const count = counts.get(index) || 0;
    const percent = players.length ? Math.round((count / players.length) * 100) : 0;
    list.append(el("li", `${option} — ${percent}% (${count} of ${players.length})`));
  });
  body.append(list);
  const points = pointsForChoice(state.myChoice, state.choices);
  body.append(el("p", "The most common choice earns one point. If the top choice is tied, everyone earns one point."));
  body.append(el("p", `You earned ${points} point${points === 1 ? "" : "s"} this round.`));
  renderScoreboard(body, players, "Scores");
  if (!isHost()) {
    body.append(el("p", "Waiting for the host."));
    return;
  }
  const last = state.roundNumber >= state.room.totalRounds;
  const next = el("button", last ? "Finish game" : "Next round");
  next.type = "button";
  next.addEventListener("click", async () => {
    next.disabled = true;
    try { await mp.nextRound(state.code, state.room); }
    catch (error) { setError("room-error", error.message); next.disabled = false; }
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

function startSingleplayer() {
  // Unseen dilemmas first; the queue is rebuilt whenever it runs out.
  queue = pickSingleplayerQueue(catalogIds, state.history, catalogIds.length);
  queueIndex = 0;
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
  const fieldset = document.createElement("fieldset");
  fieldset.className = "choice-list";
  fieldset.append(el("legend", "Choose one"));
  options.hidden = false;
  optionsFor(id).forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "choice-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "single-choice";
    radio.value = String(index);
    label.append(radio, el("span", option));
    fieldset.append(label);
  });
  options.append(fieldset);
  recordSeen(id);
}

$("single-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!document.querySelector("#single-options input:checked")) return;
  queueIndex += 1;
  renderSingle();
});
