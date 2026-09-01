export const CONSULTANT_FIRST_DELAY = 5_000;
export const CONSULTANT_REOPEN_DELAY = 10_000;
export const WHEEL_AFTER_CONSULTANT_DELAY = 5_000;
export const ORDER_RELOAD_DELAY = 5_000;

export function shouldScheduleWheel(closeCount: number) {
  return closeCount >= 1;
}
