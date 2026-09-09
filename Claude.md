# moral dilemma — MVP

## Goal

Build a minimal website for a moral dilemma game. Focus only on the playable MVP described here. Keep the interface, code, and backend simple.

## 1. Build the landing page

- Use the website name **moral dilemma**, lowercase.
- Use **Times New Roman** throughout.
- Keep the design as simplistic as possible.
- Show the website name and only these three buttons:
  - **Singleplayer**
  - **Sign in / Sign up**
  - **Create / Join a room**
- Avoid subtitles, taglines, descriptions, and filler text. Elsewhere, show only necessary controls, game content, status, and errors.

## 2. Add Firebase authentication and storage

- Use Firebase as the backend.
- Support email/password sign up, sign in, and sign out with Firebase Authentication.
- Use Cloud Firestore for rooms, players, rounds, responses, votes, and scores, with live updates for multiplayer.
- Protect room data and player actions with Firebase Security Rules. Players must not be able to edit other players' responses, votes, or scores.
- Keep response ownership private from other players while retaining it internally for scoring.

## 3. Add rooms

- Let a player create a room and become its host.
- Let other players join using a short room code.
- Show the players waiting in the room.
- Let the host choose a positive number of rounds before starting, and show that count to everyone.
- Require at least two players to start multiplayer.

## 4. Implement the multiplayer round

1. Show the same placeholder dilemma to everyone, along with the current round and total rounds.
2. Each player types and submits one response. Keep responses hidden until everyone has submitted.
3. Reveal every response anonymously in a numbered list. Shuffle the order once per round and show that same order to everyone.
4. Each player votes for the answer they think is **best**. Allow one vote per player, with no self-voting.
5. After everyone has voted, show anonymous results and update the scores.
6. Let the host advance to the next round. After the final round, show the final scoreboard.

### Points per round

| Players | First place | Second place | Third place |
| --- | --- | --- | --- |
| 2–4 | 2 points | 1 point | 0 points |
| 5 or more | 3 points | 2 points | 1 point |

- Rank answers by the number of votes received. Points accumulate across rounds.
- MVP tie rule: tied answers receive the same placement points, and the next occupied placements are skipped. For example, two answers tied for first place take first and second, so the next answer ranks third.
- Answers with zero votes receive no points.
- The scoreboard may identify players, but never connect a player to a specific answer in the interface.

## 5. Add basic singleplayer

- Show one catalog dilemma at a time.
- Let the player type a response and continue to the next dilemma.
- For the MVP, singleplayer has no voting, scoring, or computer opponents.

## 6. Use the dilemma catalog

- Load dilemmas from `dilemmas.json`. Each entry has a stable `id`, unique `theme`, prompt `text`, and source metadata.
- Keep every catalog entry traceable to its cited source. Paraphrase source material rather than copying it verbatim.
- Keep the catalog replaceable. Do not add runtime scraping, content generation, or external content integrations yet.
- The current catalog contains 64 source-backed entries, including a 24-entry college-focused pack. Keep college entries grounded in reputable documented cases and preserve the source URL when adding or revising them.

## 7. Track dilemmas per user

- Every user must have a private dilemma history. For signed-in users, store it in Firestore keyed by their Firebase Auth user ID. For signed-out singleplayer sessions, keep the history in local storage and merge it into the account history after sign-in.
- Store the stable dilemma ID and the time it was shown or completed. Do not store a user's anonymous answer in this history unless it is needed for the active room.
- When starting a new singleplayer game, filter out dilemmas that user has already seen whenever enough unseen entries remain.
- When creating or starting a multiplayer room, choose dilemmas that all current players have not seen when enough shared options remain. If the shared unseen pool is too small, prefer dilemmas seen by the fewest players, then choose randomly.
- Record a dilemma for each user when the round begins, and make the write idempotent so reconnects cannot create duplicate history records.
- Never expose one user's dilemma history to another user. A host may see only the current game state, not players' personal histories.
- Do not let repeat avoidance block a game. If every catalog entry has been seen, reset the selection priority and continue with the least recently seen entries.

## MVP boundaries and verification

- The singleplayer behavior, voting restrictions, and tie rule above are provisional MVP defaults.
- Do not add timers, chat, matchmaking, elaborate profiles, global leaderboards, or other extra features.
- Verify sign up/sign in, room creation/joining, synchronized rounds, anonymous responses, voting, scoring for both player-count ranges and ties, the host's round count, the final scoreboard, private per-user history, and repeat avoidance for both singleplayer and multiplayer.
- Keep this project focused on completing that flow before expanding scope.
