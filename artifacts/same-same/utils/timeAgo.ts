export function timeAgo(date: Date | number): string {
  const now = Date.now();
  const then = typeof date === "number" ? date : date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return diffMin === 1 ? "1 minute ago" : `${diffMin} minutes ago`;
  if (diffHour < 24) return diffHour === 1 ? "1 hour ago" : `${diffHour} hours ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return `${Math.floor(diffDay / 7)} weeks ago`;
}

export function simulatedPostedAt(minutesAgo: number): Date {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}
