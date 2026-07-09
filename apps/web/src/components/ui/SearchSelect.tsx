"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { FiCheck, FiChevronDown, FiSearch } from "react-icons/fi";
import { cn } from "@/lib/cn";

export interface SearchSelectOption {
  value: string;
  /** Primary text — also what the search input filters on. */
  label: string;
  /** Extra search terms (ids, short names, aliases). */
  keywords?: string[];
  /** Options sharing a group render under one section header. */
  group?: string;
  /** Node rendered before the label (icon, badge). */
  leading?: React.ReactNode;
  /** Node rendered after the label (status badge). */
  trailing?: React.ReactNode;
  /** Listed but not selectable (still searchable, skipped by keyboard nav). */
  disabled?: boolean;
}

export interface SearchSelectProps {
  options: SearchSelectOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  align?: "start" | "center" | "end";
  /** Styles the trigger button (size, width, chrome). */
  triggerClassName?: string;
  /** Styles the popover panel (width, max-height). */
  contentClassName?: string;
  /** Overrides the trigger's inner content (chevron is always appended). */
  renderTrigger?: (selected: SearchSelectOption | null) => React.ReactNode;
}

const matches = (option: SearchSelectOption, query: string) => {
  const haystack = [option.label, option.group ?? "", ...(option.keywords ?? [])];
  return haystack.some((term) => term.toLowerCase().includes(query));
};

/**
 * SearchSelect — single-select combobox: a trigger button opening a popover
 * with a search input and a grouped, keyboard-navigable listbox. The generic
 * sibling of the native `Select`, for lists long enough to need filtering
 * (chain pickers use the `ChainSelect` wrapper in `components/chain/`).
 */
export const SearchSelect = ({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  disabled,
  id,
  ariaLabel,
  align = "start",
  triggerClassName,
  contentClassName,
  renderTrigger,
}: SearchSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listboxId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((option) => matches(option, q)) : options;
  }, [options, query]);

  // Grouped view of `filtered`, preserving option order within each group.
  const groups = React.useMemo(() => {
    const byLabel = new Map<string, SearchSelectOption[]>();
    for (const option of filtered) {
      const key = option.group ?? "";
      const bucket = byLabel.get(key);
      if (bucket) bucket.push(option);
      else byLabel.set(key, [option]);
    }
    return [...byLabel.entries()].map(([label, items]) => ({ label, items }));
  }, [filtered]);

  const setOpenAndReset = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  };

  const select = (option: SearchSelectOption) => {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
  };

  const activeOption = filtered[activeIndex];

  React.useEffect(() => {
    if (!open || !activeOption) return;
    listRef.current
      ?.querySelector(`[data-value="${CSS.escape(activeOption.value)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeOption]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      // Skip disabled options; give up after a full loop (all disabled).
      setActiveIndex((i) => {
        let next = i;
        for (let step = 0; step < filtered.length; step += 1) {
          next = (next + delta + filtered.length) % filtered.length;
          if (!filtered[next]?.disabled) return next;
        }
        return i;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeOption) select(activeOption);
    }
  };

  return (
    // `modal` keeps focus handling sane when the select sits inside a Radix
    // Dialog (Modal) — the popover content is portaled outside DialogContent.
    <Popover.Root modal open={open} onOpenChange={setOpenAndReset}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-border bg-surface text-foreground",
            "transition-colors duration-base ease-out-soft hover:bg-surface-elevated",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "disabled:cursor-not-allowed disabled:opacity-60",
            triggerClassName ?? "h-10 w-full px-3 text-sm",
          )}
        >
          {renderTrigger ? (
            renderTrigger(selected)
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
              {selected?.leading}
              <span className={cn("truncate", !selected && "text-muted")}>
                {selected?.label ?? placeholder}
              </span>
              {selected?.trailing}
            </span>
          )}
          <FiChevronDown size={14} aria-hidden className="ml-auto shrink-0 text-muted" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          collisionPadding={8}
          // Focus the search input through Radix's sequencing — a bare
          // `autoFocus` loses to the FocusScope of a parent Dialog (Modal).
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            "z-[60] flex max-h-[min(70vh,26rem)] flex-col overflow-hidden rounded-lg border border-border",
            "bg-surface-elevated shadow-elev-3 animate-fade-in",
            contentClassName ?? "w-[var(--radix-popover-trigger-width)] min-w-[16rem]",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <FiSearch size={14} aria-hidden className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={
                activeOption ? `${listboxId}-${activeOption.value}` : undefined
              }
              aria-autocomplete="list"
              className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            />
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="overflow-y-auto p-1"
          >
            {filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted">{emptyMessage}</p>
            )}
            {groups.map((group) => (
              <div key={group.label || "__ungrouped"} className="mb-1 last:mb-0">
                {group.label && (
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {group.label}
                  </p>
                )}
                {group.items.map((option) => (
                  <div
                    key={option.value}
                    id={`${listboxId}-${option.value}`}
                    data-value={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    onClick={() => select(option)}
                    onMouseMove={() => {
                      if (option.disabled) return;
                      const index = filtered.indexOf(option);
                      if (index !== activeIndex) setActiveIndex(index);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm",
                      option === activeOption && "bg-surface",
                      option.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {option.leading}
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {option.label}
                    </span>
                    {option.trailing}
                    {option.value === value && (
                      <FiCheck size={14} aria-hidden className="shrink-0 text-success" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default SearchSelect;
