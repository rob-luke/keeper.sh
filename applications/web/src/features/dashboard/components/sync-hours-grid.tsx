import { useRef } from "react";
import type { PointerEvent } from "react";
import {
  DAY_LABELS,
  SYNC_HOURS_PER_DAY,
  formatHour,
  isSyncHourOn,
  setSyncHours,
  syncHourIndex,
} from "@keeper.sh/data-schemas";
import { cn } from "@/utils/cn";

interface SyncHoursGridProps {
  value: string;
  onChange: (updater: (previous: string) => string) => void;
}

const HOURS = Array.from({ length: SYNC_HOURS_PER_DAY }, (_, hour) => hour);
const DAYS = DAY_LABELS.map((_, day) => day);
const LABELLED_HOURS = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

const dayIndexes = (day: number): number[] => HOURS.map((hour) => syncHourIndex(day, hour));
const hourIndexes = (hour: number): number[] => DAYS.map((day) => syncHourIndex(day, hour));

const isRowOn = (value: string, indexes: number[]): boolean =>
  indexes.every((index) => value.charAt(index) === "1");

const readCellIndex = (clientX: number, clientY: number): number | null => {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest<HTMLElement>("[data-sync-hour]");
  if (!cell) {
    return null;
  }
  return Number(cell.dataset.syncHour);
};

export function SyncHoursGrid({ value, onChange }: SyncHoursGridProps) {
  const paintMode = useRef<boolean | null>(null);

  const paint = (index: number) => {
    const mode = paintMode.current;
    if (mode === null) {
      return;
    }
    onChange((previous) => setSyncHours(previous, [index], mode));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const index = readCellIndex(event.clientX, event.clientY);
    if (index === null) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    paintMode.current = value.charAt(index) !== "1";
    paint(index);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (paintMode.current === null) {
      return;
    }
    const index = readCellIndex(event.clientX, event.clientY);
    if (index !== null) {
      paint(index);
    }
  };

  const stopPainting = () => {
    paintMode.current = null;
  };

  const toggleRow = (indexes: number[]) => {
    onChange((previous) => setSyncHours(previous, indexes, !isRowOn(previous, indexes)));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-px">
        <span />
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            className="rounded-sm py-1 text-xs font-medium tracking-tight text-foreground-muted hover:text-foreground"
            onClick={() => toggleRow(dayIndexes(day))}
          >
            {DAY_LABELS[day]}
          </button>
        ))}
      </div>
      <div
        className="grid touch-none select-none grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-px"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPainting}
        onPointerCancel={stopPainting}
      >
        {HOURS.map((hour) => (
          <HourRow key={hour} hour={hour} value={value} onToggleHour={toggleRow} />
        ))}
      </div>
    </div>
  );
}

interface HourRowProps {
  hour: number;
  value: string;
  onToggleHour: (indexes: number[]) => void;
}

function HourRow({ hour, value, onToggleHour }: HourRowProps) {
  const label = LABELLED_HOURS.has(hour) && formatHour(hour);

  return (
    <>
      <button
        type="button"
        className="h-4 pr-1 text-right text-[10px] leading-4 tracking-tight text-foreground-muted tabular-nums hover:text-foreground"
        aria-label={`Toggle ${formatHour(hour)} on every day`}
        onClick={() => onToggleHour(hourIndexes(hour))}
      >
        {label}
      </button>
      {DAYS.map((day) => {
        const index = syncHourIndex(day, hour);
        const on = isSyncHourOn(value, day, hour);
        return (
          <div
            key={day}
            data-sync-hour={index}
            role="checkbox"
            aria-checked={on}
            aria-label={`${DAY_LABELS[day]} ${formatHour(hour)}`}
            className={cn(
              "h-4 cursor-pointer rounded-[3px] border border-border",
              on && "border-transparent bg-foreground",
            )}
          />
        );
      })}
    </>
  );
}
