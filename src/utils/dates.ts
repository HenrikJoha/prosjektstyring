import {
  addDays,
  startOfWeek,
  endOfWeek,
  format,
  isWeekend,
  getWeek,
  parseISO,
  isSameDay,
  isWithinInterval,
  differenceInDays,
  eachDayOfInterval,
  getYear,
  addWeeks,
  startOfDay,
} from 'date-fns';
import { nb } from 'date-fns/locale';

// Norwegian holidays (fixed dates and Easter-based)
export function getNorwegianHolidays(year: number): Date[] {
  const holidays: Date[] = [];
  
  // Fixed holidays
  holidays.push(new Date(year, 0, 1));   // Nyttårsdag
  holidays.push(new Date(year, 4, 1));   // Arbeidernes dag
  holidays.push(new Date(year, 4, 17));  // Grunnlovsdag
  holidays.push(new Date(year, 11, 25)); // 1. juledag
  holidays.push(new Date(year, 11, 26)); // 2. juledag
  
  // Easter-based holidays (using Gauss algorithm)
  const easter = calculateEaster(year);
  holidays.push(addDays(easter, -3));  // Skjærtorsdag
  holidays.push(addDays(easter, -2));  // Langfredag
  holidays.push(easter);                // 1. påskedag
  holidays.push(addDays(easter, 1));   // 2. påskedag
  holidays.push(addDays(easter, 39));  // Kristi himmelfartsdag
  holidays.push(addDays(easter, 49));  // 1. pinsedag
  holidays.push(addDays(easter, 50));  // 2. pinsedag
  
  return holidays;
}

// Gauss algorithm for calculating Easter
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month, day);
}

export function isHoliday(date: Date): boolean {
  const year = getYear(date);
  const holidays = getNorwegianHolidays(year);
  return holidays.some(holiday => isSameDay(holiday, date));
}

export function getHolidayName(date: Date): string | null {
  const year = getYear(date);
  const easter = calculateEaster(year);
  
  const holidayNames: { date: Date; name: string }[] = [
    { date: new Date(year, 0, 1), name: 'Nyttårsdag' },
    { date: new Date(year, 4, 1), name: 'Arbeidernes dag' },
    { date: new Date(year, 4, 17), name: 'Grunnlovsdag' },
    { date: new Date(year, 11, 25), name: '1. juledag' },
    { date: new Date(year, 11, 26), name: '2. juledag' },
    { date: addDays(easter, -3), name: 'Skjærtorsdag' },
    { date: addDays(easter, -2), name: 'Langfredag' },
    { date: easter, name: '1. påskedag' },
    { date: addDays(easter, 1), name: '2. påskedag' },
    { date: addDays(easter, 39), name: 'Kristi himmelfartsdag' },
    { date: addDays(easter, 49), name: '1. pinsedag' },
    { date: addDays(easter, 50), name: '2. pinsedag' },
  ];
  
  const holiday = holidayNames.find(h => isSameDay(h.date, date));
  return holiday?.name || null;
}

// Get weekdays (excluding weekends) for a date range
export function getWeekdaysInRange(start: Date, end: Date): Date[] {
  const days = eachDayOfInterval({ start, end });
  return days.filter(day => !isWeekend(day));
}

// Generate weeks for display
export interface WeekData {
  weekNumber: number;
  year: number;
  days: DayData[];
}

export interface DayData {
  date: Date;
  dateString: string;
  dayOfWeek: number;
  isHoliday: boolean;
  holidayName: string | null;
}

export function generateWeeks(startDate: Date, numberOfWeeks: number): WeekData[] {
  const weeks: WeekData[] = [];
  let currentWeekStart = startOfWeek(startDate, { weekStartsOn: 1 }); // Monday
  
  for (let w = 0; w < numberOfWeeks; w++) {
    const weekDays: DayData[] = [];
    
    // Only Monday to Friday (indices 0-4 from week start)
    for (let d = 0; d < 5; d++) {
      const date = addDays(currentWeekStart, d);
      weekDays.push({
        date,
        dateString: format(date, 'yyyy-MM-dd'),
        dayOfWeek: d,
        isHoliday: isHoliday(date),
        holidayName: getHolidayName(date),
      });
    }
    
    weeks.push({
      weekNumber: getWeek(currentWeekStart, { weekStartsOn: 1, firstWeekContainsDate: 4 }),
      year: getYear(currentWeekStart),
      days: weekDays,
    });
    
    currentWeekStart = addWeeks(currentWeekStart, 1);
  }
  
  return weeks;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nb-NO', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' kr';
}

export function formatDateShort(date: Date): string {
  return format(date, 'd', { locale: nb });
}

export function formatDateFull(date: Date): string {
  return format(date, 'EEEE d. MMMM', { locale: nb });
}

export function formatDateNorwegian(dateString: string): string {
  const date = parseISO(dateString);
  return format(date, 'd. MMM yyyy', { locale: nb });
}

export { 
  addDays, 
  parseISO, 
  format, 
  isSameDay, 
  isWithinInterval, 
  differenceInDays,
  startOfDay,
  eachDayOfInterval
};
