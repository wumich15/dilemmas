# moral dilemma

A minimal moral-dilemma game: singleplayer prompts, and multiplayer rooms where
everyone answers the same dilemma, reads the answers anonymously, and votes for
the best one.

No build step. The site is plain HTML, CSS, and ES modules; Firebase is loaded
from its CDN.

## Run it

```sh
npm run config       # writes js/config.js from .env (npm start does this too)
npm start            # serves this directory on http://localhost:5173
```

Any static server works — the app must be served over http, not opened as a
`file://` URL, because it uses ES modules and fetches `dilemmas.json`.

Singleplayer works immediately. Accounts and rooms need Firebase.

## Firebase setup

1. Create a Firebase project, then add a **Web app** to it.
2. `cp .env.example .env`, paste the console's values into `.env`, and run
   `npm run config`. That generates `js/config.js`, which is git-ignored, so a
   working copy of the app never carries one project's ids into the repository.
   The values themselves are not secrets: Firebase web config is public by
   design and is served to every browser that loads the page. The security
   boundary is `firestore.rules`.
3. In **Authentication → Sign-in method**, enable **Email/Password**.
4. Create a **Cloud Firestore** database.
5. Deploy the rules: `npx firebase deploy --only firestore:rules`.

The security rules in `firestore.rules` are what keep the game honest, so deploy
them before playing with anyone.

## How a round works

1. The host picks a number of rounds and starts the game.
2. Everyone answers the same dilemma. Answers stay unreadable until all are in.
3. Answers are revealed anonymously in one shuffled order, the same for everyone.
4. Everyone votes for the best answer, one vote each, never their own.
5. Points are awarded and the host moves on; the last round shows the final
   scoreboard.

Points per round: 2/1/0 for two to four players, 3/2/1 for five or more. Tied
answers take the same placement and the placements they consume are skipped, so
two answers tied for first are followed by a third-place answer.

## Data model

```
rooms/{code}                      hostUid, status, totalRounds, currentRound,
                                  candidates[], dilemmaIds[]
  players/{uid}                   name, score, roundScores
  pool/{dilemmaId}                count — how many players here have seen it
  contrib/{uid}                   marks that a player reported their counts
  rounds/{n}                      dilemmaId, dilemma, phase, order[]
    answers/{responseId}          text            (no author field)
    authors/{uid}                 responseId      (readable only by that player)
    submitted/{uid}               a public "answered" marker, no content
    votes/{uid}                   responseId
users/{uid}/history/{dilemmaId}   dilemmaId, seenAt   (private to that user)
```

Ownership of an answer lives in `authors/{uid}`, which only its owner can read,
so no player — the host included — can connect a player to an answer. Answers
themselves are unreadable until the answering phase closes, and the rules refuse
a vote for your own answer without exposing whose it is.

Dilemma history is private per user. To pick dilemmas a room has not seen, each
player reports only *counts* into `rooms/{code}/pool`; the host then picks the
least-seen candidates from that list. Nobody reads anyone's history.

## Dilemmas

`dilemmas.json` is the 64-entry catalog: `{ id, theme, text, source }`. Every
entry is source-backed and includes a citation URL; the final 24 entries form a
college-focused pack covering admissions, academic integrity, campus speech,
athletics, and student safety. Regenerate it with
`python3 tools/generate_dilemmas.py`, or replace the file — nothing scrapes or
generates dilemmas at runtime.

## Tests

```sh
npm test             # scoring, dilemma selection, and a headless-Chrome smoke test
npm run test:rules   # security rules against the Firestore emulator
```

`js/config.js` is generated, so run `npm run config` after cloning (or just
`npm start` / `npm test`, which run it first). `npm test` drives the real page with the Chrome installed on this machine; set
`CHROME_PATH` if yours lives elsewhere. `npm run test:rules` needs a Java
runtime, which the Firebase emulator requires (`brew install openjdk`).

## MVP limits

- Scores are computed and written by each player's own client. The rules stop
  anyone from editing another player's score, but an edited client could inflate
  its own. Moving scoring server-side needs Cloud Functions.
- A player who closes the tab without leaving stays in the room, and the round
  waits for them.
- Room codes are four characters and rooms are never cleaned up.
