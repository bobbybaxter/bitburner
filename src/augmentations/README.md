## Bitburner Augmentation Scripts

### [`info.js`](info.js) (37.6 / / 32.6 GB)

List owned augmentations or show stats of a named augmentation.

Example: List installed augmentations

```
> run /augmentations/info.js
```

Example: Show stats of a specific augmentation (supports autocomplete)

```
> run /augmentations/info.js Cranial Signal Processors - Gen III

Cranial Signal Processors - Gen III
Status: Not Owned
Price: $550.0m
Value: 1.279x
Stats: {
  "hacking_mult": 1.09,
  "hacking_speed_mult": 1.02,
  "hacking_money_mult": 1.15
}
Prereqs: ["Cranial Signal Processors - Gen II"] ✗
Factions:
  BitRunners: 158k / 50k rep ✓
  The Black Hand: 186k / 50k rep ✓
  NiteSec: 451k / 50k rep ✓
```

---

### [`buy.js`](buy.js) (38.1 / / 35.6 GB)

List the best augmentations available now, most expensive first. Optionally buy them. Use `--cheap` to buy cheapest first instead.

Usage:

```
/augmentations/buy.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ] [ --cheap ]
```

Example: See all augs that increase hacking or hacknet stats

```
> run /augmentations/buy.js hacking hacknet

Augmentation Buying Plan: hacking, hacknet
  'Neuralstimulator' (1.16x) from Sector-12 for $3.0b
  'Neural-Retention Enhancement' (1.10x) from NiteSec for $250.0m
  'Embedded Netburner Module' (1.04x) from NiteSec for $250.0m
  'Cranial Signal Processors - Gen I' (1.13x) from NiteSec for $70.0m
  'Cranial Signal Processors - Gen II' (1.16x) from NiteSec for $125.0m
  'Power Recirculation Core' (1.08x) from NiteSec for $180.0m
  ...
```

Example: Buy all augs that increase hacking, including NeuroFlux Governor repeatedly

```
> run /augmentations/buy.js hacking --begin
```

Example: Buy the cheapest hacking augs first

```
> run /augmentations/buy.js hacking --begin --cheap
```

---

### [`unlock.js`](unlock.js) (39.1 / / 34.1 GB)

List the best augmentations available soon, sorted by least reputation required. Optionally work for those factions (and accept their faction invites). Use `--cheap` to prioritize cheapest augs first.

Usage:

```
/augmentations/unlock.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ] [ --cheap ]
```

Example: Show all augs that improve combat or crime, and the closest faction to selling them

```
> run /augmentations/unlock.js combat crime

Augmentation Unlocking Plan: combat, crime
	 1.78k more rep - Speakers for the Dead for 'The Shadow's Simulacrum' (1.18x)
	 37.0k more rep - Tian Di Hui for 'Neuroreceptor Management Implant' (1.25x)
	 62.5k more rep - NiteSec for 'Graphene BrachiBlades Upgrade' (1.40x)
	 70.7k more rep - The Syndicate for 'Bionic Legs' (1.30x)
	 89.0k more rep - The Black Hand for 'The Black Hand' (1.50x)
  ...
```

Example: Work for all factions that will unlock hacking augmentations

```
> run /augmentations/unlock.js hacking --begin
```

When `--begin` is set, the script also tries to fulfill missing faction invite requirements automatically (travel between cities, gym/university training, hacknet upgrades, dark-web programs, applying for company jobs, committing crimes for karma, installing backdoors, paying via corp `bribe`, etc.) before joining and grinding rep.

---

### [`graft.js`](graft.js) (50.1 / / 43.1 GB)

List the best augmentations available to graft, sorted by (multipliers / time). Optionally graft them. Use `--cheap` to graft cheapest first.

Usage:

```
/augmentations/graft.js [ hacking | charisma | combat | crime | faction | hacknet | bladeburner | all ... ] [ --begin ] [ --cheap ]
```

Example: List all augmentations that increase charisma or faction rep gain.

```
> run /augmentations/graft.js charisma faction

Augmentation Grafting Plan: charisma, faction
    $15.9b (1.2 hr) for (1.96x) 'Unstable Circadian Modulator'
     $4.1b (1.1 hr) for (1.86x) 'Enhanced Social Interaction Implant'
     $8.3b (1.5 hr) for (2.12x) 'SmartJaw'
    $22.5b (1.3 hr) for (1.84x) 'PC Direct-Neural Interface NeuroNet Injector'
  ...
```

Example: Graft all augmentations that increase hacking stats.

```
> run /augmentations/graft.js hacking --begin
```

Example: Graft the cheapest hacking augmentations first.

```
> run /augmentations/graft.js hacking --begin --cheap
```

---

### See Also

- [`/sleeves/buy-augs.js`](../sleeves/buy-augs.js) - Buy augmentations for sleeves.

- [`/gang/buy-augs.js`](../gang/buy-augs.js) - Buy equipment for gang members.

- [`/player/prestige.js`](../player/prestige.js) - Run final activities before installing augmentations.
