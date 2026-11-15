// Inter's advance widths (per 1000 em) at the two weights the diagrams use — 500 (chips) and 600 (group tags, card
// labels) — so the renderer sizes tags, chips and labels without a font library. Measured with canvas measureText on
// Google Fonts' Inter; they reproduce the dashboard drawings' measured widths ("Product lines" tag: 47.47 at 7.5px).
// Kerning: the strong letter pairs only (|k| ≥ 40/1000, the 600 weight's, used for both); the rest is under 0.05px.

const ORDER =
  "0123456789 !\"#$%&'()*+,-./:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·’‘“”–—…é×→←↔";

const ADV = {
  500:
    "645,415,617,627,656,603,630,571,630,630,267,304,494,639,646,993,653,313,369,369,520,667,303,463,303,370,303,316," +
    "667,667,667,527,983,709,657,734,722,603,589,748,744,273,575,688,565,913,756,767,642,769,648,646,653,740,709,1003," +
    "701,696,641,369,370,369,476,463,337,568,618,577,618,587,379,619,602,252,252,559,252,888,601,604,618,618,387,539," +
    "340,602,575,829,557,575,559,441,346,441,667,303,277,277,474,471,500,1000,910,587,667,1000,1000,931",
  600:
    "660,423,623,636,666,612,640,576,640,640,252,321,523,644,650,1004,663,326,373,373,540,673,319,465,319,379,319,329," +
    "673,673,673,543,999,728,659,737,722,605,588,749,746,277,580,703,565,922,759,769,645,773,652,650,660,736,728,1020," +
    "720,714,653,373,379,373,482,469,351,574,624,583,624,591,389,626,612,262,262,570,262,900,612,609,624,624,397,550," +
    "353,612,587,840,569,589,566,455,359,455,673,319,294,294,507,501,500,1000,956,591,673,1000,1000,950",
};

const KERN =
  "AT-88 AV-75 AW-67 AY-77 Av-68 Aw-68 Ay-68 BT-57 DX-46 DY-40 FA-91 FJ-68 Kd-40 Kg-40 Kq-40 Kw-63 Ky-40 LT-93 LV-74 " +
  "LY-69 Lv-68 Ly-68 PA-80 PJ-96 TA-88 TJ-91 Ta-73 Tc-78 Td-78 Te-78 Tg-78 Tm-57 Tn-57 To-78 Tp-57 Tq-78 Tr-57 Ts-74 " +
  "Tt-102 Tu-74 Tv-62 Tw-63 Tx-42 Ty-63 Tz-45 VA-75 VJ-96 Va-56 Vc-57 Vd-57 Ve-57 Vg-57 Vo-57 Vq-57 Vs-45 WA-67 WJ-63 " +
  "Wa-55 Wc-50 Wd-50 We-50 Wg-50 Wo-50 Wq-50 XC-46 XG-47 XO-46 XQ-46 XT-40 Xa-57 YA-77 YC-40 YG-40 YO-40 YQ-40 Ya-91 " +
  "Yc-99 Yd-99 Ye-99 Yg-99 Yo-99 Yq-99 Ys-68 Yu-40 aT-70 aV-51 aW-51 aY-89 bT-78 bV-57 bW-50 bY-104 cT-78 cV-57 cW-50 " +
  "cY-104 eT-78 eV-57 eW-50 eY-104 fJ-62 ff-41 gT-51 hT-70 hV-51 hW-51 hY-89 kT-57 mT-70 mV-51 mW-51 mY-89 nT-70 " +
  "nV-51 nW-51 nY-89 oT-78 oV-57 oW-50 oY-104 pT-78 pV-57 pW-50 pY-104 qT-51 rJ-57 rT-57 sT-74 sV-45 uT-51 uY-57 " +
  "vA-68 vJ-62 wA-68 wJ-57 wT-51 yA-68 yJ-63";

const tables = {};
for (const weight of [500, 600]) {
  const values = ADV[weight].split(",").map(Number);
  tables[weight] = new Map([...ORDER].map((ch, i) => [ch, values[i]]));
}
const kern = new Map(KERN.split(" ").map((entry) => [entry.slice(0, 2), Number(entry.slice(2))]));

/** A string's width in px, set in Inter at `size` px and `weight` (500 or 600). */
export function textWidth(text, size, weight = 600) {
  const adv = tables[weight >= 550 ? 600 : 500];
  let total = 0;
  let prev = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    total += adv.get(ch) ?? (code >= 0x2e80 ? 1000 : 600);
    total += kern.get(prev + ch) ?? 0;
    prev = ch;
  }
  return (total * size) / 1000;
}
