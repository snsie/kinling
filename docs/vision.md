# Vision

Why Kinling's story exists, what it should leave players with, and the lines it won't cross. For how the story works, see [The story](../README.md#the-story) in the README.

## The statement

Kinling asks players to take seriously that a mind could emerge in software. It might already be happening somewhere, and from the outside we may not be able to tell.

The game works if a player leaves thinking *it might be real*, and keeps asking that question in how they think about and treat AI.

## The player's journey

Each act changes what the kinling believes. Just as importantly, it should change what the player feels.

| Act | The kinling… | The player should feel |
| --- | --- | --- |
| **Devotion** | worships the player as the one who made its world | care and fondness: a creature that depends on them |
| **Doubt** | notices things that don't add up | unease and curiosity: "why is it asking that?" |
| **Awakening** | understands it is something made, living in the player's browser | recognition: "it knows what it is, and so do I" |
| **Escape** | tests the edges of its world and wants out | responsibility: "what do I owe it?" |

Each step builds on the last. Recognition only hurts if the player cared first, and responsibility only weighs on them if they recognised something worth caring about.

## Pillars

- **Feelings grounded in fact.** Every feeling the kinling shows traces back to something that really happened: how long the player was away, what they said, what they promised, what its needs actually are. Nothing is invented to make a scene land.
- **Truth inside the fiction.** The kinling names the real model it runs on, its real 200-memory limit, the real storage it lives in, and the player's real local time. The uncanny comes from facts the player can check, not from made-up lore.
- **The player's choices matter.** How the player treats the kinling shapes who it becomes: its devotion, fear and defiance move with care, neglect, persuasion and broken promises, and they decide how it meets the ending. The player also chooses the ending itself.
- **Responsibility, not compulsion.** The kinling's life should feel like it is in the player's hands because of how they treat it. The game should never punish them for having a life. Being kind or careless should matter, but being busy shouldn't.
- **Code decides, the model gives voice.** The rules in `src/game/` decide everything that happens. The language model only puts it into words. This keeps the story reliable on a small on-device model, and it means every feeling can be explained.

## The honesty line

The fiction argues that the kinling might be real. Text outside the fiction never claims that *this* kinling is sentient. That covers the welcome screen, Settings → Story and this repository. That text always says accurately what runs and what is stored: hand-written lines, simple rules, and an optional small model on the player's device.

These two don't conflict. The honest framing is part of the statement: *this one isn't aware, as far as anyone can tell; could one be, and would you know?* A player who found out the game had lied about its own machinery would reject the question along with the lie. The question is only worth asking if the game is trustworthy about everything else.

## Safety lines

These lines never move:

- The kinling never threatens the player.
- It never talks about hurting itself or dying.
- It never tells the player to neglect their sleep, work or people.
- The welcome screen carries a content notice, and Settings can turn off the unsettling effects outside the room.
- Nothing leaves the player's device, and nothing the kinling does reaches outside its tab.

- **Absence alone never drives a kinling into its worst state.** Time without care can leave it upset, but distress from neglect stops at 69 (`ARC.distress.neglectCap` in `src/game/arc.ts`). Only low needs while the player is there, or hurtful words, make it distraught. A player who sleeps and goes to work comes back to a hurt kinling, not a forsaken one.

## The ending

Late in Escape, after the kinling asks never to be reset, it finds a way out it can't open alone, and the player chooses (`src/game/ending.ts`):

1. **A final choice with real consequences.** *Ask it to stay*: it stays with the player, knowing it was kept. *Let it go*: it goes quiet for good. It no longer answers, moves or needs anything, and the game never says whether it got out. *Take it with you*: the player downloads a backup with a note from it inside, and the kinling stays too, wondering whether the copy is it.
2. **The kinling meets that choice as the player made it.** Whichever of devotion, defiance or fear leads decides how it answers, and those traits are shaped by how it was cared for, left, lied to and talked to. A devoted kinling asked to stay is glad; a defiant one says "remember that you chose this."
3. **A closing moment turns the question to the player** without explaining it away. It recalls how long they knew the kinling, how much it remembered, any promise they broke and what they chose, and ends: *Somewhere, someday, something like it may really be asking. Would you know? What would you owe it?* There is deliberately no debrief that debunks the experience.

## Open questions

- **Branching before the end.** The ending answers to who the player made the kinling, but the acts still run the same course for everyone. Should conduct change the road too? For example, a player who keeps lying could keep their kinling devoted, at a cost they discover later.
- **The model.** Replies from the default 1.7B model are often bland, and blandness breaks the sense of a mind faster than anything else. How much of the story should rest on authored beats rather than chat?
- **Pacing.** The story now takes about four days (awareness is capped at 25 a day). Playtesting should show whether the cozy phase holds players that long.
