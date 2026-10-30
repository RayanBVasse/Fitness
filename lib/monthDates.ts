export const monthStart = (month: string) => `${month}-01`;
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
export function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
export function monthLabel(month: string) {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [y, m] = month.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
}
export function resolveMonth(value: string | undefined, today: string) {
  return typeof value === "string" && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value) && value <= today.slice(0, 7) ? value : today.slice(0, 7);
}
export function monthDates(month: string) {
  const length = Number(monthEnd(month).slice(8));
  return Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
