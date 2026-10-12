# Concept: Characters

[README](../../README.md) · [User guide](../USER_GUIDE.md) · [Developer guide](../DEVELOPMENT.md)

Status: concept, not built yet. It describes a library of recurring characters for VulKara: one person, creature or
mascot that looks the same in many pictures, on different models, in different scenes.

## The problem

A prompt describes a person in words. Every new seed, model or scene gives another face, other proportions and
other clothes. People who make picture stories, comics, children's books, game assets or product mascots need the
same character again and again. Today that means writing the same long description each time, and still the face
wanders.

## Three ways to keep a character the same

| Way | How it works | How well the character stays | Models | Effort |
| --- | --- | --- | --- | --- |
| **1. Profile** | The features (age, hair, eyes, build, clothing, style) are kept as a fixed part of the prompt | low: face and proportions wander | all | small |
| **2. Reference pictures** | The character is in 2–4 reference pictures (portrait, full body) that a model with a reference input takes into account ("the same person in scene X") | medium to good | models with a reference input: FLUX.2 [klein], Qwen-Image Edit | medium |
| **3. Character LoRA** | The app trains a LoRA of the character from 15–25 pictures; the character then has a name, e.g. "Max" | best, also across poses, light and clothing | the model family it was trained for (SDXL, FLUX.2 [klein], Krea 2) | medium; training exists already |

The three ways build on each other. The concept uses all of them, and the app picks the strongest one the chosen
model can use.

## The library

A new page **Characters** in the library group of the navigation (next to Models, History, Favourites), with an
icon from the app's set (`users`).

```
┌ Characters ─────────────────────────────────────────────── [ + New character ] ┐
│  Search …                                                                       │
│                                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                                       │
│  │ portrait │  │ portrait │  │ portrait │                                       │
│  │          │  │          │  │          │                                       │
│  ├──────────┤  ├──────────┤  ├──────────┤                                       │
│  │ Max      │  │ Lina     │  │ Captain  │                                       │
│  │ photo    │  │ comic    │  │ anime    │                                       │
│  │ ● LoRA SDXL ● refs     │ ○ profile   │                                       │
│  └──────────┘  └──────────┘  └──────────┘                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Each card shows the portrait, the name, the style and which ways exist for it (a dot per way: profile, reference
pictures, a LoRA per model family). A click opens the character.

## Creating a character (assistant)

1. **Profile in fields, not free text:** name, style (photo, painting, comic, anime, 3D), sex or none, age, build,
   skin, hair (colour, length, style), eyes, face (shape, marks such as freckles or a scar), clothing (everyday, and
   an optional signature piece), and a free note. The fields become a fixed prompt part in a stable order; a field
   left empty is left out.
2. **Portrait candidates:** the app paints 6–8 portraits from the profile with the chosen model (seeds in a row).
   You pick one. "More" paints the next ones; any field can be changed in between.
3. **Character sheet:** from the chosen portrait a reference model (FLUX.2 [klein]) paints the views: front, three
   quarters, side, full body standing, full body from behind, in neutral light and plain clothing on a plain ground.
   You remove the ones that do not match and let it paint them again.
4. **Optional: train with one click.** The sheet plus a few more pictures (different expressions, light, clothing)
   become the training set for a LoRA of the family you use. Captions are written from the profile. Training exists
   already: on an M2 SDXL takes about 20 minutes, FLUX.2 [klein] 4B one to two hours; the Mac stays awake.

```
┌ New character ───────────────────────────────────── step 2 of 4 ┐
│ Profile ✓   Portrait ●   Sheet ○   Training ○                    │
│                                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                                     │
│  │ 1  │ │ 2  │ │ 3  │ │ 4  │      Model  [ FLUX.2 [klein] 4B ▾ ]  │
│  └────┘ └────┘ └────┘ └────┘      [ More ]                       │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                                     │
│  │ 5  │ │ 6  │ │ 7  │ │ 8  │      Pick the portrait that is      │
│  └────┘ └────┘ └────┘ └────┘      the character.                 │
│                                          [ Back ]  [ Use this ]  │
└──────────────────────────────────────────────────────────────────┘
```

## Using a character

- **In the prompt:** `@Max` anywhere in the prompt, with completion of the names while typing. On the generate pages
  a **Character** field in the panel does the same for those who prefer choosing.
- **The strongest way the model allows:**
  1. the character's LoRA, when one exists for the family of the chosen model (with its trigger word),
  2. else the reference pictures, when the model takes references,
  3. else the profile as prompt text.

  An (!) badge next to the field says when only a weaker way was possible ("This model can only use the profile:
  the face may vary").
- Scene, model and all settings stay free. The profile's clothing can be replaced by the scene's ("in a raincoat").
- **Two characters in one picture:** reference pictures and profiles handle two characters fairly well; two LoRAs of
  people in one picture tend to mix their faces, so with two characters the app takes LoRA for one and references
  for the other, and says so.

## The character's page

```
┌ Max ─────────────────────────────────────────────── [ Use in Text to image ] ┐
│ ┌─────────┐  Style photo · created 11.10.2026                                 │
│ │portrait │  Profile  age 35 · short brown hair · green eyes · beard …  [Edit] │
│ └─────────┘                                                                   │
│ Sheet       [front] [¾] [side] [full] [back]                    [Paint again] │
│ LoRAs       SDXL ✓ (22 pictures, 24 min)   FLUX.2 [klein] –  [Train]        │
│ Pictures    the results that used Max (from the history)                      │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Where it is kept

- One folder per character in the data folder: `characters/<id>/character.json` (profile, names of the sheet
  pictures, the LoRAs bound to it per family), `sheet/*.png`, `portrait.png`.
- A LoRA trained for a character stays a normal LoRA in the LoRA folder (also usable without the character) and is
  bound to it by its id.
- The history keeps which character a job used, so the character's page can list its pictures.

## Content protection and rights

- The content filter, the consent question and the prompt check apply to every step as on the other pages:
  creating, the sheet and every use. A character can not be made explicit where the rules of the app forbid it.
- **No real people without their consent.** A character made from a photo of a real person (as reference or training
  picture) asks the consent question first and is marked as such. The app gives no way to take a character from a
  name of a known person; such prompts are refused as elsewhere.
- Face adapters (InstantID, PuLID) would let a single photo be enough. Their licences and their use for real faces
  are the reason they are not part of this concept; they can be judged later.

## How it fits into the code

| Part | Where | New or existing |
| --- | --- | --- |
| Library, assistant, character page | `src/renderer/src/pages/CharactersPage.vue`, components for the sheet | new |
| Characters in the data folder | `src/main/characters.ts` (list, save, bind LoRA), IPC `characters:*` | new |
| `@Name` and the Character field | `src/shared/characters.ts` (resolve to LoRA, references or profile text), the generate pages | new |
| Reference pictures for FLUX.2 [klein] | the engine's edit path with several input pictures | extend |
| Training from the sheet | Training page and `train.py` | exists, gets a "from character" source |
| Content checks | `queue.ts`, `content_policy.ts` | exist |

## Stages, each usable on its own

1. **Library, profile and `@Name`** (one session): the library, the assistant's profile step, portrait candidates,
   `@Name` with the profile as prompt text.
2. **Character sheet with reference pictures** (two sessions): the views painted by FLUX.2 [klein], references used
   by models that take them.
3. **Training from the sheet, LoRA bound to the character** (one session).

## Open questions

- Should a character be shareable (export and import a folder with profile, sheet and LoRAs)?
- How many pictures does the sheet need for a good LoRA on FLUX.2 [klein]? To be measured in stage 3.
- Video: Wan takes a start picture; a character's portrait or sheet view could be offered as start picture.
