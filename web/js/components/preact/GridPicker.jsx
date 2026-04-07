/**
 * GridPicker — a popover grid-cell selector for choosing columns × rows.
 * Hover over cells to preview the grid size; click to confirm.
 */

import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../i18n.js';

// Hard cap: more than 36 simultaneous HLS/MSE streams will exhaust tab memory.
// Streams beyond this limit are handled via pagination.
export const MAX_GRID_CELLS = 36;

const MAX_GRID_SIDE = Math.ceil(Math.sqrt(MAX_GRID_CELLS));

/**
 * Return the best [cols, rows] to display N streams.
 * The heuristic prefers layouts that fit the stream count with minimal waste
 * while staying reasonably close to the current viewport aspect ratio.
 * @param {number} n
 * @returns {[number, number]}
 */
export function computeOptimalGrid(n) {
  const count = Math.max(1, Math.min(MAX_GRID_CELLS, Math.floor(n || 1)));
  const viewportAspect = (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0)
    ? (window.innerWidth / window.innerHeight)
    : 1;

  let bestCols = 1;
  let bestRows = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestCells = Number.POSITIVE_INFINITY;

  for (let rows = 1; rows <= MAX_GRID_SIDE; rows++) {
    for (let cols = 1; cols <= MAX_GRID_SIDE; cols++) {
      const cells = cols * rows;
      if (cells < count) continue;

      const waste = cells - count;
      const layoutAspect = cols / rows;
      const aspectPenalty = Math.abs(Math.log(layoutAspect / viewportAspect));
      const stripPenalty = count > 2 && (cols === 1 || rows === 1) ? 2.75 : 0;
      const balancePenalty = Math.abs(cols - rows) * 0.08;
      const sizePenalty = cells * 0.01;
      const score = (waste * 5) + (aspectPenalty * 3) + stripPenalty + balancePenalty + sizePenalty;

      if (
        score < bestScore ||
        (Math.abs(score - bestScore) < 0.0001 && cells < bestCells) ||
        (Math.abs(score - bestScore) < 0.0001 && cells === bestCells && rows < bestRows)
      ) {
        bestScore = score;
        bestCells = cells;
        bestCols = cols;
        bestRows = rows;
      }
    }
  }

  return [bestCols, bestRows];
}

/**
 * GridPicker component.
 *
 * @param {object}   props
 * @param {number}   props.cols      Current column count
 * @param {number}   props.rows      Current row count
 * @param {Function} props.onSelect  Called with (cols, rows) on cell click
 * @param {number}   [props.maxCells]  Stream count used to recommend a layout.
 */
export function GridPicker({ cols, rows, onSelect, maxCells }) {
  const { t } = useI18n();
  const [hover, setHover] = useState({ c: cols, r: rows });
  const [open, setOpen]   = useState(false);
  const containerRef      = useRef(null);
  const streamCount = Number.isFinite(maxCells) && maxCells > 0 ? maxCells : 0;

  // Always expose the full supported layout range so the picker can reach
  // rectangular presets such as 4×2, 5×3, or 6×4.
  const gridCols = MAX_GRID_SIDE;
  const gridRows = MAX_GRID_SIDE;
  const recommendedLayout = computeOptimalGrid(streamCount || cols * rows || 1);

  // Keep hover in sync when external selection changes (e.g. auto-grid on load)
  useEffect(() => { setHover({ c: cols, r: rows }); }, [cols, rows]);

  // Close the popover on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        className="px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm flex items-center gap-1.5 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
        onClick={() => setOpen(o => !o)}
        title={t('live.selectGridLayout')}
        aria-label={t('live.gridLayoutAria', { cols, rows })}
      >
        {/* 2×2 grid icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3"  y="3"  width="7" height="7" rx="1"/>
          <rect x="14" y="3"  width="7" height="7" rx="1"/>
          <rect x="3"  y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <span className="font-medium tabular-nums">{cols}×{rows}</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-lg shadow-xl p-3 select-none"
          onMouseLeave={() => setHover({ c: cols, r: rows })}
        >
          <p className="text-xs font-semibold text-center text-foreground mb-2 tabular-nums">
            {hover.c} × {hover.r}
          </p>
          {streamCount > 0 && (
            <p className="text-[10px] text-center text-muted-foreground mb-2">
              Recommended: {recommendedLayout[0]} × {recommendedLayout[1]}
            </p>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 20px)`,
              gap: '3px',
            }}
          >
            {Array.from({ length: gridRows }, (_, r) =>
              Array.from({ length: gridCols }, (_, c) => {
                const cellCount   = (c + 1) * (r + 1);
                const overLimit   = cellCount > MAX_GRID_CELLS;
                const highlighted = !overLimit && r < hover.r && c < hover.c;
                const isCurrent   = !overLimit && r < rows   && c < cols;
                const isRecommended = !overLimit && (c + 1) === recommendedLayout[0] && (r + 1) === recommendedLayout[1];
                return (
                  <div
                    key={`${r}-${c}`}
                    style={{ width: '20px', height: '20px' }}
                    title={overLimit
                      ? t('live.gridCellExceedsLimit', { cols: c + 1, rows: r + 1, max: MAX_GRID_CELLS })
                      : `${c + 1}×${r + 1}`}
                    className={`rounded-sm border transition-colors ${
                      overLimit
                        ? 'bg-muted/30 border-border/30 opacity-30 cursor-not-allowed'
                        : highlighted
                          ? 'bg-primary border-primary cursor-pointer'
                          : isCurrent
                            ? 'bg-primary/25 border-primary/40 cursor-pointer'
                            : 'bg-muted border-border hover:border-primary/50 hover:bg-muted/80 cursor-pointer'
                    } ${isRecommended ? 'ring-1 ring-primary/60 shadow-sm' : ''}`}
                    onMouseEnter={() => { if (!overLimit) setHover({ c: c + 1, r: r + 1 }); }}
                    onClick={() => { if (!overLimit) { onSelect(c + 1, r + 1); setOpen(false); } }}
                  />
                );
              })
            )}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            {t('live.maxStreamsPerPage', { max: MAX_GRID_CELLS })}
          </p>
        </div>
      )}
    </div>
  );
}
