import type { Category } from "../types";
import { meaning, reading, seg } from "./helpers";

export const kanji: Category = {
  id: "kanji",
  title: "Kanji",
  titleJa: "漢字",
  questions: [
    meaning("k5-1", "N5", [seg("日", "にち")], "day / sun", ["moon", "fire", "eye"]),
    meaning("k5-2", "N5", [seg("人", "ひと")], "person", ["enter", "large", "child"]),
    meaning("k5-3", "N5", [seg("山", "やま")], "mountain", ["river", "forest", "stone"]),
    meaning("k5-4", "N5", [seg("川", "かわ")], "river", ["mountain", "water", "sea"]),
    meaning("k5-5", "N5", [seg("学", "がく")], "study / learning", ["school (building)", "write", "word"]),
    meaning("k5-6", "N5", [seg("校", "こう")], "school", ["learn", "teacher", "room"]),
    meaning("k5-7", "N5", [seg("時", "とき")], "time / hour", ["wait", "week", "now"]),
    meaning("k5-8", "N5", [seg("車", "くるま")], "car / vehicle", ["train", "road", "station"]),
    meaning("k5-9", "N5", [seg("金", "きん")], "gold / money", ["silver", "store", "circle"]),
    meaning("k5-10", "N5", [seg("雨", "あめ")], "rain", ["cloud", "snow", "wind"]),
    reading("k5-11", "N5", [seg("見")], "み", ["けん", "しん", "め"], "kun reading of 見 in 見る"),
    reading("k5-12", "N5", [seg("食")], "た", ["しょく", "く", "じき"], "kun reading of 食 in 食べる"),
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
  ],
};
