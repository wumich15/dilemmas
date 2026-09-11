# dilemma — MVP

## Goal

Build a minimal website for a moral dilemma game. Focus only on the playable MVP described here. Keep the interface, code, and backend simple.

## 1. Build the landing page

- Use the website name **dilemma**, lowercase.
- Use **Times New Roman** throughout.
- Keep the design as simplistic as possible.
- Show the website name and the primary play actions:
  - **Singleplayer**
  - **Sign in / Sign up**
  - **Create / Join a room**
- Keep a simple utility header for theme, percentage visibility, and returning Home from any non-home view.
- Avoid subtitles, taglines, descriptions, and filler text. Elsewhere, show only necessary controls, game content, status, and errors.

## 2. Add Firebase authentication and storage

- Use Firebase as the backend.
- Support email/password sign up, sign in, and sign out with Firebase Authentication.
- Support anonymous Firebase Authentication so players can choose **Play as guest** for multiplayer. Guests may enter any optional username for the room scoreboard; usernames are display-only and do not need to be unique.
- Guests who leave the username blank receive sequential display names such as **Guest (1)** and **Guest (2)** within a room.
- Also support passwordless email-link sign in. Send a link using the app's current URL, remember only the pending email address in local storage, and complete sign-in when the link returns to the app. If the email is not remembered, ask the user to enter it before completing the link. Clear the remembered address after success or an invalid or expired link.
- Use Cloud Firestore for rooms, players, rounds, multiple-choice selections, and scores, with live updates for multiplayer.
- Protect room data and player actions with Firebase Security Rules. Players must not be able to edit other players' choices or scores.
- A player may read their own choice while a round is open so submission retries work; other players' choices remain private until results.

## 3. Add rooms

- Let a player create a room and become its host.
- Let other players join using a short room code.
- Show the players waiting in the room.
- Let the host choose a positive number of rounds before starting, and show that count to everyone.
- Multiplayer always uses multiple-choice rounds.
- There is no free-response mode or response-type setting; every game answer is a catalog-backed radio choice.
- Require at least two players to start multiplayer.

## 4. Implement the multiplayer round

1. Show the same dilemma to everyone, along with the current round and total rounds.
2. Show the dilemma's catalog options. Each player selects exactly one option.
3. After a player submits, show every option's global percentage across all site submissions. After all selections are submitted, also show the room counts used for scoring.
4. Award one point to players who chose the unique most common option. If the most common choice is tied, award everyone one point.
5. Let the host advance to the next round and show the final scoreboard after the last round.

### Points per round

- Points accumulate across rounds.
- A tied most-common choice gives one point to every player.

## 5. Add basic singleplayer

- Show one catalog dilemma at a time.
- Let the player select an option, see global percentages for every option, and then continue to the next dilemma.
- Singleplayer has no question limit, voting, scoring, or computer opponents.

## 6. Track global response percentages

- Record every multiple-choice submission from singleplayer and multiplayer in a public, anonymous Firestore aggregate keyed by dilemma ID.
- Use a transaction so concurrent submissions update the global total and the selected option count without losing writes.
- Display the selected dilemma's percentage immediately after submission, including a percentage beside every option.
- Let players hide or show percentages with the persistent **Hide percentages / Show percentages** utility toggle. Hiding affects display only; submissions continue to count globally.

## 7. Use the dilemma catalog

- Load dilemmas from `dilemmas.json`. Each entry has a stable `id`, unique `theme`, prompt `text`, a contextual `options` array for multiple-choice, and source metadata.
- Keep every catalog entry traceable to its cited source. Paraphrase source material rather than copying it verbatim.
- Keep the catalog replaceable. Do not add runtime scraping, content generation, or external content integrations yet.
- The current catalog contains 53 source-backed entries, including a 14-entry ordinary student-life pack. Keep these entries grounded in reputable university or public-interest guidance and preserve the source URL when adding or revising them.

## 8. Track dilemmas per user

- Every user must have a private dilemma history. For signed-in users, store it in Firestore keyed by their Firebase Auth user ID. For signed-out singleplayer sessions, keep the history in local storage and merge it into the account history after sign-in.
- Store the stable dilemma ID and the time it was shown or completed. Do not store a user's choice in this history.
- When starting a new singleplayer game, filter out dilemmas that user has already seen whenever enough unseen entries remain.
- When creating or starting a multiplayer room, choose dilemmas that all current players have not seen when enough shared options remain. If the shared unseen pool is too small, prefer dilemmas seen by the fewest players, then choose randomly.
- Record a dilemma for each user when the round begins, and make the write idempotent so reconnects cannot create duplicate history records.
- Never expose one user's dilemma history to another user. A host may see only the current game state, not players' personal histories.
- Do not let repeat avoidance block a game. If every catalog entry has been seen, reset the selection priority and continue with the least recently seen entries.

## 9. Navigation and setup notes

- The Home utility button stops room subscriptions and removes the current player from an active room before returning to the landing page.
- Guest multiplayer requires the Anonymous provider to be enabled in Firebase Authentication → Sign-in method.

## MVP boundaries and verification

- The singleplayer behavior and tie rule above are provisional MVP defaults.
- Do not add timers, chat, matchmaking, elaborate profiles, global leaderboards, or other extra features. Global response percentages are aggregate round feedback, not a leaderboard.
- Verify password sign up/sign in, email-link send and completion, room creation/joining, synchronized multiple-choice rounds, majority scoring and ties, the host's round count, the final scoreboard, private per-user history, and repeat avoidance for both singleplayer and multiplayer.
- Keep this project focused on completing that flow before expanding scope.
