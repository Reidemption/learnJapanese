/** "4:07", or "1:02:07" past an hour. Negative times read as 0:00. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** "3.4 s" per question, to one decimal place. */
export function formatAverage(ms: number, count: number): string {
  return count > 0 ? `${(ms / count / 1000).toFixed(1)} s` : "0.0 s";
}
