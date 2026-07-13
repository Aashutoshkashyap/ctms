import NepaliDate from 'nepali-date-converter';

export type BsDateParts = {
  year: number;
  month: number;
  day: number;
};

export const BS_MONTHS = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'आश्विन',
  'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फाल्गुण', 'चैत्र',
];

export const BS_WEEKDAYS = ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'];

const pad = (value: number) => String(value).padStart(2, '0');

export function toNepaliDigits(value: string | number) {
  return String(value).replace(/\d/g, digit => '०१२३४५६७८९'[Number(digit)]);
}

export function adToBsParts(adDate?: string | null): BsDateParts | null {
  if (!adDate) return null;
  try {
    const [year, month, day] = adDate.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return null;
    const converted = new NepaliDate(new Date(year, month - 1, day)).getBS();
    return { year: converted.year, month: converted.month, day: converted.date };
  } catch {
    return null;
  }
}

export function bsToAdDate(parts: BsDateParts): string {
  const converted = new NepaliDate(parts.year, parts.month, parts.day);
  const ad = converted.getAD();
  return `${ad.year}-${pad(ad.month + 1)}-${pad(ad.date)}`;
}

export function formatBsDate(adDate?: string | null, options?: { long?: boolean; nepaliDigits?: boolean }) {
  const parts = adToBsParts(adDate);
  if (!parts) return adDate || '—';
  const output = options?.long
    ? `${parts.day} ${BS_MONTHS[parts.month]} ${parts.year} BS`
    : `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)} BS`;
  return options?.nepaliDigits === false ? output : toNepaliDigits(output);
}

export function formatBsDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatBsDate(value.slice(0, 10));
  const time = date.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: true,
  });
  return `${formatBsDate(value.slice(0, 10), { long: true })} · ${toNepaliDigits(time)}`;
}

export function replaceAdDatesWithBs(value: string) {
  return value.replace(/\b\d{4}-\d{2}-\d{2}\b/g, date => formatBsDate(date, { long: true }));
}

export function bsInputValue(adDate?: string | null) {
  const parts = adToBsParts(adDate);
  if (!parts) return '';
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)}`;
}

export function parseBsInput(value: string): BsDateParts | null {
  const normalized = value
    .trim()
    .replace(/[०-९]/g, digit => String('०१२३४५६७८९'.indexOf(digit)))
    .replaceAll('/', '-');
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  if (parts.year < 2000 || parts.year > 2099 || parts.month < 0 || parts.month > 11 || parts.day < 1 || parts.day > 32) return null;
  try {
    const date = new NepaliDate(parts.year, parts.month, parts.day);
    if (date.getYear() !== parts.year || date.getMonth() !== parts.month || date.getDate() !== parts.day) return null;
    return parts;
  } catch {
    return null;
  }
}

export function daysInBsMonth(year: number, month: number) {
  for (let day = 32; day >= 28; day -= 1) {
    try {
      const date = new NepaliDate(year, month, day);
      if (date.getYear() === year && date.getMonth() === month && date.getDate() === day) return day;
    } catch {
      // Continue until the last valid day is found.
    }
  }
  return 30;
}

export function todayAdDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addAdDays(adDate: string, days: number) {
  const date = new Date(`${adDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffAdDays(fromDate: string, toDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}
