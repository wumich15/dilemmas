# dilemmas

A minimal dilemma game: singleplayer prompts, and multiplayer rooms where
the host chooses free response or multiple-choice play. Free-response rooms can
reveal authors or keep them anonymous; multiple-choice rooms show aggregate
percentages.

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
3. In **Authentication → Sign-in method**, enable **Email/Password** and
   **Email link (passwordless sign-in)**. Add local development and production
   URLs to Firebase Authentication's authorized domains.
4. Create a **Cloud Firestore** database.
5. Deploy the rules: `firebase deploy --only firestore:rules` (see below).

The security rules in `firestore.rules` are what keep the game honest, so deploy
them before playing with anyone.

The sign-in view supports both passwords and passwordless email links. After
requesting a link, open it in the same browser; if you use another device,
enter the email address on the sign-in screen to complete the link.

## How a round works

1. The host picks a number of rounds, a game type, and whether free-response
   authors are anonymous.
2. In free-response mode, everyone answers the same dilemma. Answers stay
   unreadable until all are in, then everyone votes for the best answer.
3. In multiple-choice mode, everyone chooses one catalog option and the round
   ends by showing the percentage choosing each option.
4. Free-response points are awarded and the host moves on; the last round shows
   the final scoreboard.

Points per round: 2/1/0 for two to four players, 3/2/1 for five or more. Tied
answers take the same placement and the placements they consume are skipped, so
two answers tied for first are followed by a third-place answer.

## Data model

```
rooms/{code}                      hostUid, status, totalRounds, currentRound,
                                  mode, anonymous, candidates[], dilemmaIds[]
  players/{uid}                   name, score, roundScores
  pool/{dilemmaId}                count — how many players here have seen it
  contrib/{uid}                   marks that a player reported their counts
  rounds/{n}                      dilemmaId, dilemma, options[], phase, order[]
    answers/{responseId}          text, author    (author null when anonymous)
    choices/{uid}                 optionIndex    (private until results)
    authors/{uid}                 responseId      (readable only by that player)
    submitted/{uid}               a public "answered" marker, no content
    votes/{uid}                   responseId
users/{uid}/history/{dilemmaId}   dilemmaId, seenAt   (private to that user)
```

Ownership of an answer lives in `authors/{uid}`, which only its owner can read.
Answers themselves are unreadable until the answering phase closes. When a room
uses anonymous responses, the answer's `author` is null; when anonymity is off,
the display name is shown after the response phase. Multiple-choice selections
remain unreadable until results, then the client calculates each option's
percentage from the submitted choices.

Dilemma history is private per user. To pick dilemmas a room has not seen, each
player reports only *counts* into `rooms/{code}/pool`; the host then picks the
least-seen candidates from that list. Nobody reads anyone's history.

## Dilemmas

`dilemmas.json` is the 40-entry catalog: `{ id, theme, text, options, source }`. Every
entry is a concise, game-focused adaptation and includes its inspiration URL. The
mix covers social scenarios, playful tradeoffs, and imaginative hypotheticals.
Regenerate it with
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
