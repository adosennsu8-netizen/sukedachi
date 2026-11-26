// 国土地理院の逆ジオコーダー（無料・APIキー不要）で座標→住所
type Muni = { pref: string; city: string };
let muniCache: Record<string, Muni> | null = null;

async function loadMuni(): Promise<Record<string, Muni>> {
  if (muniCache) return muniCache;
  const res = await fetch('https://maps.gsi.go.jp/js/muni.js', { cache: 'force-cache' });
  const txt = await res.text();
  const map: Record<string, Muni> = {};
  const re = /MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    const parts = m[2].split(',');
    map[String(parseInt(m[1], 10))] = {
      pref: parts[1],
      city: (parts[3] || '').replace(/[\s　]/g, ''),
    };
  }
  muniCache = map;
  return map;
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; pref: string | null }> {
  try {
    const res = await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
    );
    const j = await res.json();
    const muniCd = j?.results?.muniCd;
    const lv01: string = j?.results?.lv01Nm ?? '';
    if (muniCd) {
      const muni = (await loadMuni())[String(parseInt(muniCd, 10))];
      if (muni) {
        const town = lv01 && lv01 !== '－' ? lv01 : '';
        return { address: `${muni.pref}${muni.city}${town}`, pref: muni.pref };
      }
    }
  } catch (e) {
    console.error('reverseGeocode failed', e);
  }
  return { address: `緯度${lat.toFixed(5)} 経度${lng.toFixed(5)}`, pref: null };
}
