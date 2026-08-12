# Card art generation batch — 46 remaining cards

Style already locked and approved (the Fire Dragon test image): painterly storybook fantasy,
warm/dramatic lighting, **no border, no text, no icons, no logos, no UI elements** — the
illustration fills the frame edge to edge. The PSA-slab casing, label bar (school + name) and
grade seal are all real HTML/CSS in `cardFace()`, layered on top — nothing about them should be
baked into the image.

**Generation settings for every card:**
- Model: `nano_banana` (same as the approved test)
- Aspect ratio: `3:4`
- Append this exact suffix to every prompt below (already included in each line, don't drop it):
  `ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI
  elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail
  digital painting style matching a premium fantasy trading card game`

**Filenames — save each result exactly as named**, into `public/assets/cards/`:
`public/assets/cards/<id>.jpg` (id is the first column below). Once all 46 land there, ping me and
I'll wire them into `cards.js` (with a fallback to the existing shared school art for anything
still missing) and run them through the compression pipeline.

Already done: `fire_dragon` ✅ (the approved test image — reuse it, no need to regenerate).

---

## 🔥 Fire (red/orange/gold, warm night sky, embers)

| id | prompt |
|---|---|
| fire_cat | Painterly storybook fantasy illustration of a small, spry fire-orange cat with ember-tipped fur darting across scorched stone, warm dramatic lighting, dark violet night sky, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| fire_elf | Painterly storybook fantasy illustration of a quick-tempered fire elf archer with molten-gold hair and glowing amber eyes, wreathed in curling flame, warm dramatic lighting, dark violet night sky, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| firebolt | Painterly storybook fantasy illustration of a single searing bolt of orange-red fire streaking through a dark violet night sky, trailing embers and smoke, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| fireball | Painterly storybook fantasy illustration of a massive roiling fireball hurtling through the night sky, orange-gold core with dark smoke trailing behind, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| meteor | Painterly storybook fantasy illustration of a blazing meteor crashing down from a starry violet sky onto a mountain ridge, explosion of fire and embers on impact, dramatic warm lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## ❄️ Ice (cyan/blue/white, frost, moonlit)

| id | prompt |
|---|---|
| ice_golem | Painterly storybook fantasy illustration of a hulking golem made of solid blue-white ice standing guard on a frozen crag, cold moonlit lighting, dark starry sky, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| frost_giant | Painterly storybook fantasy illustration of a towering frost giant wielding a jagged ice club atop a snowy peak, cold moonlit lighting, aurora in the dark sky, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| ice_wyrm | Painterly storybook fantasy illustration of an ancient serpentine ice wyrm coiled through a glacier cavern, pale blue scales glowing faintly, cold moonlit lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| ice_armor | Painterly storybook fantasy illustration of glowing crystalline blue armor plates of solid ice forming in mid-air, frost mist swirling, cold moonlit lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| frost_shield | Painterly storybook fantasy illustration of a shimmering shield of translucent blue ice forming a protective barrier, frost crystals radiating outward, cold moonlit lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| blizzard | Painterly storybook fantasy illustration of a raging blizzard sweeping across a frozen mountain valley, howling wind and driving snow lit by pale moonlight, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## ⚡ Storm (violet/purple, lightning, storm clouds)

| id | prompt |
|---|---|
| storm_bat | Painterly storybook fantasy illustration of a small crackling purple storm bat with lightning-veined wings darting through dark clouds, dramatic violet lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| storm_shark | Painterly storybook fantasy illustration of a sleek storm shark surging through a wall of rain and lightning, electric-violet energy crackling along its fins, dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| storm_titan | Painterly storybook fantasy illustration of a colossal titan made of swirling storm clouds and lightning, arms raised against a violet sky split by thunderbolts, dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| storm_shift | Painterly storybook fantasy illustration of a jagged bolt of violet-white lightning striking down through storm clouds, dramatic high-contrast lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| lightning | Painterly storybook fantasy illustration of a massive branching lightning bolt tearing across a churning violet storm sky, dramatic high-contrast lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| tempest | Painterly storybook fantasy illustration of a devastating tempest, a swirling vortex of storm clouds and lightning bearing down on a distant tower, dramatic violet lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## 🐉 Myth (emerald/gold, ancient ruins, legendary)

| id | prompt |
|---|---|
| myth_walker | Painterly storybook fantasy illustration of an ancient stone guardian of legend striding through emerald jungle ruins, moss and gold inlay on weathered stone, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| minotaur | Painterly storybook fantasy illustration of a powerful minotaur charging through a crumbling emerald-lit labyrinth, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| hydra | Painterly storybook fantasy illustration of a legendary multi-headed hydra rising from an emerald swamp among ancient ruins, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| basilisk | Painterly storybook fantasy illustration of a massive basilisk serpent coiled among emerald-green ruins, golden eyes glowing, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| myth_blast | Painterly storybook fantasy illustration of a burst of emerald-green mythic energy exploding outward with ancient runes glowing in the light, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## 🌿 Life (pink/rose/soft green, blooming, warm soft light)

| id | prompt |
|---|---|
| pixie | Painterly storybook fantasy illustration of a tiny glowing pixie with rose-pink wings hovering among blooming flowers, soft warm golden-hour lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| unicorn | Painterly storybook fantasy illustration of a graceful unicorn with a glowing rose-gold mane standing in a blooming meadow, soft warm lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| satyr | Painterly storybook fantasy illustration of a wise satyr playing a wooden flute in a sunlit blooming grove, soft warm golden lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| healing_wave | Painterly storybook fantasy illustration of a gentle wave of rose-pink and soft green healing light rippling outward over blooming flowers, soft warm lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| rebirth | Painterly storybook fantasy illustration of a phoenix-like burst of soft rose and gold light blooming into new life from a single glowing flower, soft warm lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## 💀 Death (pale grey/violet, bone, spectral, moody)

| id | prompt |
|---|---|
| skeleton | Painterly storybook fantasy illustration of an animated bone skeleton warrior standing in a misty pale-violet graveyard, moody moonlit lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| ghoul | Painterly storybook fantasy illustration of a hunched ghoul creature emerging from pale mist among ancient tombstones, moody violet-grey lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| vampire | Painterly storybook fantasy illustration of an elegant vampire in a tattered dark cloak standing in a moonlit pale-violet crypt, moody dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| reaper | Painterly storybook fantasy illustration of an imposing death reaper cloaked in tattered grey robes holding a glowing scythe amid pale violet mist, moody dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| dark_pact | Painterly storybook fantasy illustration of a swirling pale-violet spectral pact sealing between two ghostly hands over an ancient tome, moody moonlit lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## ⚖️ Balance (gold/amber, warm neutral arcane light)

| id | prompt |
|---|---|
| balance_blade | Painterly storybook fantasy illustration of a glowing golden-amber arcane blade hovering in radiant light, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| novice | Painterly storybook fantasy illustration of a young apprentice wizard in golden-amber robes casting their first spell in a warmly lit academy courtyard, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| balance_streak | Painterly storybook fantasy illustration of a streak of golden-amber arcane energy slicing cleanly through the air, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| sunbird | Painterly storybook fantasy illustration of a radiant golden sunbird with amber-scaled wings soaring against a warm glowing sky, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| balance_dragon | Painterly storybook fantasy illustration of a majestic golden-amber dragon with perfectly balanced light and shadow scales coiled atop a sunlit spire, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| elixir | Painterly storybook fantasy illustration of a glowing golden-amber health elixir potion bottle radiating warm restorative light, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| golden_golem | Painterly storybook fantasy illustration of a towering golden-amber golem of solid metal standing guard, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| master_wand | Painterly storybook fantasy illustration of an ornate master's wand of gold and amber wood glowing with radiant arcane light, warm balanced lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| arcane_guardian | Painterly storybook fantasy illustration of an imposing golden-amber arcane guardian statue come to life, glowing runes across its armored chest, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## 🌀 Field cards (persistent effects)

| id | prompt |
|---|---|
| arcane_nexus | Painterly storybook fantasy illustration of a glowing golden-amber arcane nexus, a floating crystalline structure radiating rings of magical energy over an academy courtyard, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| radiant_aura | Painterly storybook fantasy illustration of a radiant rose-pink and soft green healing aura blooming outward over a garden of flowers, soft warm lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| storm_conduit | Painterly storybook fantasy illustration of a towering violet storm conduit, a crystal spire channeling lightning down from swirling clouds, dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

## 🪤 Trap cards (face-down effects)

| id | prompt |
|---|---|
| fire_trap | Painterly storybook fantasy illustration of a hidden fire trap rune glowing red-orange beneath scorched stone, about to ignite, warm dramatic lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |
| mana_ward | Painterly storybook fantasy illustration of a hidden ice-blue mana ward rune glowing faintly beneath frosted stone, ready to trigger, cold moonlit lighting, ornate but NOT framed with any border or vignette, no text, no letters, no icons, no UI elements, no logos, full-bleed illustration filling the entire frame edge to edge, high detail digital painting style matching a premium fantasy trading card game |

