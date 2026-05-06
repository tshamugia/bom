export function parseLeadTimeDays(input: string | null | undefined): number | null {
  if (!input) return null;
  const matches = input.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches.map(Number).filter(n => Number.isFinite(n) && n >= 0);
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum / nums.length;
}
