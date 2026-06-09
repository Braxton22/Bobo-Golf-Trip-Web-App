// Open-Meteo (free, no API key) weather fetch keyed off course lat/long.
// https://open-meteo.com/

export type DayForecast = {
  date: string; // ISO yyyy-mm-dd
  tempMax: number; // °F
  tempMin: number;
  precipPct: number; // 0..100
  windMax: number; // mph
  weatherCode: number;
  conditions: string;
};

const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Severe storm",
};

export async function fetchForecast(opts: {
  latitude: number;
  longitude: number;
  days?: number;
}): Promise<DayForecast[]> {
  const days = Math.max(1, Math.min(7, opts.days ?? 3));
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(opts.latitude));
  url.searchParams.set("longitude", String(opts.longitude));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,windspeed_10m_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("windspeed_unit", "mph");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(days));

  // Cache for 30 minutes; the leaderboard/info page will re-fetch as needed.
  const res = await fetch(url, { next: { revalidate: 60 * 30 } });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const json = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
      weathercode: number[];
      windspeed_10m_max: number[];
    };
  };
  const d = json.daily;
  if (!d) return [];
  return d.time.map((date, i) => ({
    date,
    tempMax: Math.round(d.temperature_2m_max[i]),
    tempMin: Math.round(d.temperature_2m_min[i]),
    precipPct: Math.round(d.precipitation_probability_max[i] ?? 0),
    windMax: Math.round(d.windspeed_10m_max[i] ?? 0),
    weatherCode: d.weathercode[i],
    conditions: WMO[d.weathercode[i]] ?? "—",
  }));
}
