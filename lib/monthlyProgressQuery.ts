import { getProgressRecords } from "./dailyProgressQuery";
import { buildMonthlyProgress } from "./monthlyProgress";
import { monthEnd, monthStart } from "./monthDates";

export async function getMonthlyProgress(month: string, today: string, fullLiftIds: number[]) {
  const through = monthEnd(month) < today ? monthEnd(month) : today;
  const result = await getProgressRecords(monthStart(month), through, true);
  return { error: result.error, data: buildMonthlyProgress(month, today, result.records, fullLiftIds) };
}
