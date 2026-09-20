# Parked prototype content

Material from the original `src/data/*.ts` prototype that has **not** been migrated
into `content/decks/` yet. Nothing here is lost; it is waiting for a later phase.

- N4 entries below -> Phase 6 (N4 content).
- The N5 cloze sentences in `src/data/{particles,verbs,grammar,numbers}.ts` -> Phase 3.5,
  when the matching grammar decks get written. `src/data/` stays in the tree until
  Phase 3 rewires the UI, then it is deleted.

## vocabulary (N4 lines)

```ts
    meaning("v4-1", "N4", [seg("遅", "おく"), seg("れる")], "to be late", ["to hurry", "to wait", "to continue"]),
    meaning("v4-2", "N4", [seg("続", "つづ"), seg("ける")], "to continue", ["to stop", "to begin", "to forget"]),
    meaning("v4-3", "N4", [seg("足", "た"), seg("りる")], "to be enough", ["to walk", "to add", "to remain"]),
    meaning("v4-4", "N4", [seg("必", "ひつ"), seg("要", "よう")], "necessary", ["possible", "dangerous", "convenient"]),
    meaning("v4-5", "N4", [seg("機", "き"), seg("会", "かい")], "opportunity", ["machine", "meeting", "plan"]),
    meaning("v4-6", "N4", [seg("安", "あん"), seg("全", "ぜん")], "safe", ["cheap", "peace", "simple"]),
    meaning("v4-7", "N4", [seg("経", "けい"), seg("験", "けん")], "experience", ["experiment", "economy", "exam"]),
    meaning("v4-8", "N4", [seg("説", "せつ"), seg("明", "めい")], "explanation", ["announcement", "translation", "opinion"]),
    meaning("v4-9", "N4", [seg("準", "じゅん"), seg("備", "び")], "preparation", ["reservation", "practice", "homework"]),
    meaning("v4-10", "N4", [seg("返", "へん"), seg("事", "じ")], "reply", ["return (object)", "letter", "promise"]),
    meaning("v4-11", "N4", [seg("壊", "こわ"), seg("れる")], "to break (intransitive)", ["to fix", "to lose", "to drop"]),
    meaning("v4-12", "N4", [seg("遠", "えん"), seg("慮", "りょ")], "restraint / holding back", ["distance", "worry", "politeness only"]),
    reading("v4-r1", "N4", [seg("将"), seg("来")], "しょうらい", ["しょうだい", "きらい", "みらい"]),
```

## kanji (N4 lines)

```ts
    meaning("k4-1", "N4", [seg("駅", "えき")], "station", ["building", "stop", "platform"]),
    meaning("k4-2", "N4", [seg("急", "きゅう")], "sudden / hurry", ["slow", "danger", "quiet"]),
    meaning("k4-3", "N4", [seg("着", "ちゃく")], "arrive / wear", ["leave", "send", "wait"]),
    meaning("k4-4", "N4", [seg("発", "はつ")], "depart / emit", ["arrive", "start (school)", "speak"]),
    meaning("k4-5", "N4", [seg("考", "こう")], "think", ["know", "see", "ask"]),
    meaning("k4-6", "N4", [seg("待", "たい")], "wait", ["hold", "use", "stand"]),
    meaning("k4-7", "N4", [seg("持", "じ")], "hold / have", ["wait", "use", "carry (on back)"]),
    meaning("k4-8", "N4", [seg("使", "し")], "use", ["make", "do", "send"]),
    reading("k4-9", "N4", [seg("考"), seg("える")], "かんがえる", ["かんえる", "こうえる", "おもう"]),
    reading("k4-10", "N4", [seg("知"), seg("る")], "しる", ["ちる", "きる", "ひる"]),
    reading("k4-11", "N4", [seg("待"), seg("つ")], "まつ", ["もつ", "たつ", "かつ"]),
    reading("k4-12", "N4", [seg("急"), seg("ぐ")], "いそぐ", ["いそく", "きゅうぐ", "はしる"]),
```

## particles (N4 lines)

```ts
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
```

## verbs (N4 lines)

```ts
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
```

## grammar (N4 lines)

```ts
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
```

## numbers (N4 lines)

```ts
    meaning("n4-1", "N4", [seg("千", "せん")], "thousand", ["hundred", "ten thousand", "ten"]),
    meaning("n4-2", "N4", [seg("万", "まん")], "ten thousand", ["thousand", "million", "hundred"]),
    reading("n4-3", "N4", [seg("九"), seg("時")], "くじ", ["きゅうじ", "ここのじ", "くどき"]),
    reading("n4-4", "N4", [seg("四"), seg("人")], "よにん", ["よんにん", "しにん", "よったり"]),
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
      "N4",
```
