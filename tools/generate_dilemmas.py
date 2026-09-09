#!/usr/bin/env python3
"""Write the curated, source-inspired game catalog."""

from __future__ import annotations

import json
from pathlib import Path


OUTPUT = Path(__file__).resolve().parents[1] / "dilemmas.json"

SITTING_DOWN = {
    "type": "inspiration",
    "title": "Extreme Hypothetical Moral Dilemma Questions",
    "url": "https://areyousittingdown.games/blogs/questions/extreme-hypothetical-moral-dilemma-questions",
}
PARADE = {
    "type": "inspiration",
    "title": "250 Best Would You Rather Questions",
    "url": "https://parade.com/964027/parade/would-you-rather-questions/",
}
REDDIT = {
    "type": "community_inspiration",
    "title": "r/WouldYouRather",
    "url": "https://www.reddit.com/r/WouldYouRather/",
}


def entry(theme: str, text: str, options: list[str], citation: dict[str, str]) -> dict:
    return {
        "id": "",
        "theme": theme,
        "text": text,
        "options": options,
        "source": citation,
    }


def reddit_source(title: str, path: str) -> dict[str, str]:
    return {
        "type": "community_inspiration",
        "title": title,
        "url": f"https://www.reddit.com/r/WouldYouRather/comments/{path}",
    }


CATALOG = [
    # Social and slightly uncomfortable: adapted into new, lighter scenarios
    # from Are You Sitting Down?'s public dilemma list.
    entry(
        "The parking-lot dent",
        "You scrape a parked car in an empty lot. The mark is noticeable, nobody saw it, and leaving your details could cost most of your savings. What do you do?",
        ["Leave a note with your details", "Wait nearby for the owner", "Drive away", "Leave cash but no name"],
        SITTING_DOWN,
    ),
    entry(
        "The old confession",
        "Your closest friend admits they stole something valuable years ago. Nobody was hurt, the owner was quietly repaid, and your friend has changed. Do you tell anyone?",
        ["Keep the confidence", "Encourage them to confess", "Tell the owner yourself", "Ask for more context first"],
        SITTING_DOWN,
    ),
    entry(
        "The sibling's secret",
        "Your sibling admits they told a major lie to their partner. Revealing it could end the relationship; keeping it makes you part of the secret. What is your move?",
        ["Keep the secret", "Give them a deadline to confess", "Tell their partner", "Refuse to get involved"],
        SITTING_DOWN,
    ),
    entry(
        "The suspicious reviews",
        "Your boss asks you to hide honest one-star reviews before a product launch. It is legal, your team needs the launch, and refusing may cost your job. What do you do?",
        ["Hide the reviews", "Refuse", "Escalate it inside the company", "Warn customers anonymously"],
        SITTING_DOWN,
    ),
    entry(
        "The unwanted warning",
        "A friend is about to make a huge life choice that you think will go badly. They are excited and have not asked for advice. Do you step in?",
        ["Say exactly what you think", "Ask if they want your honest view", "Stay quiet", "Talk to someone close to them"],
        SITTING_DOWN,
    ),
    entry(
        "The terrible audition",
        "Your friend asks if they are ready for an important audition tomorrow. They are not, but brutal honesty might wreck their confidence. What do you say?",
        ["Be completely honest", "Give gentle, specific feedback", "Build their confidence", "Avoid answering"],
        SITTING_DOWN,
    ),
    entry(
        "One hour of mind-reading",
        "You may hear one person's unfiltered thoughts for an hour. They will never know unless you tell them. How do you use it?",
        ["Choose someone close to me", "Choose someone powerful", "Choose a stranger", "Refuse the power"],
        SITTING_DOWN,
    ),
    entry(
        "Invisible until midnight",
        "You are completely invisible and untraceable until midnight. You cannot extend it. What kind of day do you have?",
        ["Secretly help people", "Snoop somewhere forbidden", "Pull harmless pranks", "Stay home until it wears off"],
        SITTING_DOWN,
    ),
    entry(
        "The memory eraser",
        "You can make one person forget every memory involving you. Your own memories remain. Would you use it?",
        ["On an ex", "On someone I hurt", "On someone who hurt me", "I would not use it"],
        SITTING_DOWN,
    ),
    entry(
        "The sealed envelope",
        "An envelope contains the exact date and cause of your death. The prediction cannot be changed. Do you open it?",
        ["Open it immediately", "Save it for later", "Let someone else decide", "Destroy it unopened"],
        SITTING_DOWN,
    ),
    entry(
        "A warning from future you",
        "Your future self appears for ten seconds and says only, “Cancel tomorrow.” You have several plans and no other clues. What do you cancel?",
        ["Everything", "Only the biggest plan", "Nothing", "Ask everyone else to cancel too"],
        SITTING_DOWN,
    ),
    entry(
        "Your pet finally talks",
        "Your pet suddenly speaks perfect English and says, “We need to discuss what you do when you think you're alone.” What is your first response?",
        ["Ask what they saw", "Offer a bribe", "Change the subject", "Start recording"],
        SITTING_DOWN,
    ),

    # Quick, clean tradeoffs inspired by Parade's public Would You Rather list.
    entry(
        "A glimpse ahead",
        "Would you rather see a few minutes into your own future or get one brief look at the world a century from now?",
        ["See ten minutes ahead", "See a century ahead", "Take neither"],
        PARADE,
    ),
    entry(
        "Every song is a command",
        "For one year, every song you hear forces a reaction. Which curse do you take?",
        ["Sing along every time", "Dance every time", "Avoid music for the year"],
        PARADE,
    ),
    entry(
        "Love or the jackpot",
        "Choose one guaranteed outcome: meet the love of your life today, or win a life-changing lottery next year.",
        ["Meet true love today", "Win the lottery next year", "Leave both to chance"],
        PARADE,
    ),
    entry(
        "Nothing stays private",
        "One part of your private life becomes available to everyone you know. Which do you expose?",
        ["My unfiltered thoughts", "My complete browsing history", "My camera roll", "My spending history"],
        PARADE,
    ),
    entry(
        "Respect or influence",
        "You can be admired by everyone but have no special authority, or gain enormous influence while nobody personally respects you.",
        ["Universal respect", "Enormous influence", "A little of both", "Neither"],
        PARADE,
    ),
    entry(
        "The household upgrade",
        "You receive one free household service for life. Which improves your life most?",
        ["A personal chef", "A daily cleaner", "A personal assistant", "Free repairs forever"],
        PARADE,
    ),
    entry(
        "Your movie career",
        "Pick your one appearance in movie history.",
        ["A tiny role in a beloved classic", "The lead in a legendary flop", "A stunt double in an action hit", "A voice in an animated cult favorite"],
        PARADE,
    ),
    entry(
        "The punctuality curse",
        "For the rest of your life, you can never arrive exactly on time. Which way are you cursed?",
        ["Always ten minutes late", "Always twenty minutes early", "A random one each day"],
        PARADE,
    ),
    entry(
        "Pause or rewind",
        "You get one remote control button for your life. It works once per day, but only for you.",
        ["Pause for ten minutes", "Rewind one minute", "Fast-forward one boring hour", "Mute one person for five minutes"],
        PARADE,
    ),
    entry(
        "Words or whispers",
        "Choose one social superpower, with no way to turn it off.",
        ["Take back anything I say", "Hear every conversation about me", "Know whenever someone lies to me"],
        PARADE,
    ),
    entry(
        "Wear your truth",
        "Your body must reveal something personal to everyone who sees you. Which version do you choose?",
        ["Skin color shows my mood", "Temporary tattoos show yesterday's actions", "A subtitle shows my current thought"],
        PARADE,
    ),
    entry(
        "The unusual talent",
        "Which career sounds better?",
        ["World's best at something silly", "Solidly average at something prestigious", "Great at something nobody knows I do"],
        PARADE,
    ),
    entry(
        "A year away",
        "You may either travel anywhere for a year with every basic expense covered, or stay home and receive a large cash payment.",
        ["Travel for free for a year", "Take $50,000", "Split it into six months and $25,000"],
        PARADE,
    ),
    entry(
        "Daily friction remover",
        "Which tiny inconvenience disappears from your life forever?",
        ["Every traffic light is green", "I never wait in a line", "My devices never need charging", "I always find parking"],
        PARADE,
    ),
    entry(
        "Wishes on delay",
        "A wish service offers two plans. Which contract do you sign?",
        ["One wish granted today", "Ten wishes granted in twenty years", "No wishes with hidden fine print"],
        PARADE,
    ),
    entry(
        "A universal translator",
        "You can understand and speak with one enormous group. Who gets included?",
        ["Every human language", "Every animal", "Every computer system", "Every version of myself in the multiverse"],
        PARADE,
    ),

    # Community-inspired prompts: new combinations based on the playful,
    # constraint-heavy style found on r/WouldYouRather.
    entry(
        "Your next fictional universe",
        "You must spend a year inside either the last video game you played or the last movie or series you watched. You keep your real-world abilities.",
        ["The video-game universe", "The movie or series universe", "Let a coin choose"],
        reddit_source("Last game or last show universe", "1uy8g4p"),
    ),
    entry(
        "Truth without a voice",
        "Pick a power: know the truth behind any question but never explain what you learned, or make anyone believe one claim per day even when it is false.",
        ["Know any truth but stay silent", "Make one claim believed each day", "Refuse both"],
        reddit_source("Truth or persuasion", "1k9vogw"),
    ),
    entry(
        "A power with baggage",
        "Choose one impressive power and accept its permanent drawback.",
        ["Flight, but with enormous visible wings", "Teleportation, but three trips a year go somewhere random", "Super speed, but stopping is difficult", "Strength, but I become unusually fragile"],
        reddit_source("Balanced superpowers", "16d0jqw"),
    ),
    entry(
        "Overpowered in the past",
        "You become incredibly strong, fast, and hard to injure, but must live out your life in one historical setting with no trip home.",
        ["Ancient Egypt", "Ancient Rome", "Medieval Scotland", "Keep my normal life and no powers"],
        reddit_source("Powers in another era", "nevts5"),
    ),
    entry(
        "The internet becomes real",
        "Choose your strange new reality.",
        ["Every hypothetical I answer comes true", "I may borrow one ridiculous minor power each month", "The internet stays fictional"],
        reddit_source("Would You Rather answers become real", "17cpl47"),
    ),
    entry(
        "Mystery power or safe pick",
        "A machine offers either a random major superpower or one useful but modest ability you choose in advance.",
        ["Take the random major power", "Always know when someone is bluffing", "Fix any object I own", "Never need sleep"],
        REDDIT,
    ),
    entry(
        "Pick a perk",
        "You may install exactly one upgrade. Which would improve your life the most?",
        ["Instant repairs", "Perfect social timing", "Change my appearance at will", "Travel to places I have photographed", "Read nearby minds", "Heal much faster"],
        reddit_source("Choose three perks", "1kj2z3k"),
    ),
    entry(
        "Independent clones",
        "You can create up to five copies of yourself. They share your memories at creation but immediately gain free will. Do you take the ability?",
        ["Yes, and treat them as equals", "Yes, but create only one", "Yes, only for emergencies", "No—too complicated"],
        reddit_source("Minor superpowers", "15o2hmp"),
    ),
    entry(
        "The delayed fortune",
        "You can receive enough money to change your life now, or an absurd fortune after a long wait. Both are guaranteed and tax-free.",
        ["$1 million today", "$1 billion in fifteen years", "Give the choice to my future self"],
        REDDIT,
    ),
    entry(
        "Fast travel rules",
        "You may teleport only to places where you personally took a photo. One accidental background photo counts. What is your first strategy?",
        ["Build a worldwide photo map", "Keep it to places I trust", "Sell trips to other people", "Decline the power"],
        REDDIT,
    ),
    entry(
        "One room knows",
        "Whenever you enter a room, you may instantly become either its funniest person or its smartest person—but everyone knows you used a power.",
        ["Always choose funniest", "Always choose smartest", "Choose based on the room", "Never use it"],
        REDDIT,
    ),
    entry(
        "The tiny luck budget",
        "Once a day, you can make one unlikely event slightly more likely. The unused luck never carries over. What gets most of your boosts?",
        ["Money and work", "Friends and relationships", "Travel and adventures", "Helping strangers"],
        REDDIT,
    ),
]


def main() -> None:
    seen_themes: set[str] = set()
    seen_texts: set[str] = set()
    for number, item in enumerate(CATALOG, start=1):
        item["id"] = f"dilemma-{number:04d}"
        if len(item["options"]) < 2 or len(set(item["options"])) != len(item["options"]):
            raise ValueError(f"missing or duplicate options for {item['theme']}")
        if item["theme"] in seen_themes or item["text"] in seen_texts:
            raise ValueError(f"duplicate dilemma at {number}")
        seen_themes.add(item["theme"])
        seen_texts.add(item["text"])
        if not item["source"].get("url"):
            raise ValueError(f"missing source URL at {number}")
    OUTPUT.write_text(json.dumps(CATALOG, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(CATALOG)} source-inspired dilemmas to {OUTPUT}")


if __name__ == "__main__":
    main()
