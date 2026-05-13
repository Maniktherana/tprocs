export type ProcView = {
  /** Lines above the tail (0 = at bottom). */
  readonly viewOffset: number;
  /** When true, new output keeps the view pinned to the bottom. */
  readonly followTail: boolean;
};

export const initialProcView = (): ProcView => ({
  viewOffset: 0,
  followTail: true,
});

export const anchorViewAfterAppend = (
  view: ProcView,
  addedScrollbackLines: number,
  scrollbackCount: number,
): ProcView =>
  addedScrollbackLines <= 0 || view.followTail
    ? view
    : {
        ...view,
        viewOffset: Math.min(
          view.viewOffset + addedScrollbackLines,
          scrollbackCount,
        ),
      };

export const scrollViewUp = (
  view: ProcView,
  lines: number,
  scrollbackCount: number,
): ProcView => ({
  viewOffset: Math.min(view.viewOffset + lines, scrollbackCount),
  followTail: false,
});

export const scrollViewDown = (view: ProcView, lines: number): ProcView => {
  const viewOffset = Math.max(view.viewOffset - lines, 0);
  return {
    viewOffset,
    followTail: viewOffset === 0 ? true : view.followTail,
  };
};

export const scrollViewToTail = (): ProcView => initialProcView();

export const topLineId = (
  view: ProcView,
  totalRows: number,
  visibleRows: number,
): number => Math.max(0, totalRows - visibleRows - view.viewOffset);
