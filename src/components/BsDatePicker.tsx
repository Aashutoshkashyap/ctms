'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NepaliDate from 'nepali-date-converter';
import {
  adToBsParts,
  BS_MONTHS,
  BS_WEEKDAYS,
  bsInputValue,
  bsToAdDate,
  daysInBsMonth,
  todayAdDate,
  toNepaliDigits,
} from '../lib/nepaliDate';

type Props = {
  value: string;
  onChange: (adDate: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  'aria-label'?: string;
};

export default function BsDatePicker({
  value,
  onChange,
  required,
  disabled,
  className = '',
  id,
  name,
  min,
  max,
  placeholder = 'YYYY-MM-DD BS',
  'aria-label': ariaLabel,
}: Props) {
  const selected = adToBsParts(value || todayAdDate()) || { year: 2083, month: 0, day: 1 };
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected.year);
  const [viewMonth, setViewMonth] = useState(selected.month);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const days = useMemo(() => daysInBsMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const firstWeekday = useMemo(() => new NepaliDate(viewYear, viewMonth, 1).getDay(), [viewYear, viewMonth]);

  const selectDay = (day: number) => {
    const adDate = bsToAdDate({ year: viewYear, month: viewMonth, day });
    if ((min && adDate < min) || (max && adDate > max)) return;
    onChange(adDate);
    setOpen(false);
  };

  const toggleCalendar = () => {
    const current = adToBsParts(value || todayAdDate());
    if (current) {
      setViewYear(current.year);
      setViewMonth(current.month);
    }
    setOpen(state => !state);
  };

  const changeMonth = (offset: number) => {
    const next = viewMonth + offset;
    if (next < 0) {
      setViewYear(year => year - 1);
      setViewMonth(11);
    } else if (next > 11) {
      setViewYear(year => year + 1);
      setViewMonth(0);
    } else {
      setViewMonth(next);
    }
  };

  const selectedParts = adToBsParts(value);
  return (
    <div ref={rootRef} className={`bs-date-picker relative ${className}`}>
      <div className="relative">
        <input
          id={id}
          name={name}
          value={bsInputValue(value)}
          readOnly
          onClick={toggleCalendar}
          required={required}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={ariaLabel || 'Bikram Sambat date'}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-11 text-slate-900"
        />
        <button
          type="button"
          disabled={disabled}
          aria-label="Open Bikram Sambat calendar"
          aria-expanded={open}
          onMouseDown={event => event.preventDefault()}
          onClick={toggleCalendar}
          className="absolute inset-y-1 right-1 rounded-md px-2.5 text-blue-700 hover:bg-blue-50 disabled:text-slate-400"
        >
          BS
        </button>
      </div>
      {open && !disabled && (
        <div className="absolute left-0 z-[80] mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50" aria-label="Previous BS month">‹</button>
            <div className="text-center">
              <div className="font-extrabold">{BS_MONTHS[viewMonth]}</div>
              <div className="text-xs font-semibold text-slate-600">{toNepaliDigits(viewYear)} BS</div>
            </div>
            <button type="button" onClick={() => changeMonth(1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50" aria-label="Next BS month">›</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-500">
            {BS_WEEKDAYS.map(day => <div key={day} className="py-1">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
            {Array.from({ length: days }, (_, index) => index + 1).map(day => {
              const adDate = bsToAdDate({ year: viewYear, month: viewMonth, day });
              const outsideRange = Boolean((min && adDate < min) || (max && adDate > max));
              const active = selectedParts?.year === viewYear && selectedParts.month === viewMonth && selectedParts.day === day;
              return <button
                key={day}
                type="button"
                disabled={outsideRange}
                onClick={() => selectDay(day)}
                className={`aspect-square rounded-lg text-sm font-semibold ${active ? 'bg-blue-700 text-white' : 'text-slate-700 hover:bg-blue-50'} disabled:cursor-not-allowed disabled:text-slate-300`}
              >{toNepaliDigits(day)}</button>;
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
            <span className="font-semibold text-slate-500">Bikram Sambat</span>
            <button type="button" onClick={() => {
              const today = todayAdDate();
              const todayBs = adToBsParts(today);
              if (todayBs) {
                setViewYear(todayBs.year);
                setViewMonth(todayBs.month);
                onChange(today);
                setOpen(false);
              }
            }} className="font-bold text-blue-700">आज</button>
          </div>
        </div>
      )}
    </div>
  );
}
