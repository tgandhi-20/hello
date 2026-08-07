/**
 * Tally chart kit — hand-rolled inline SVG, no chart library (CONTRACTS.md §1).
 * Every chart: scales to its container, draws only design tokens, handles empty/zero
 * data gracefully, animates its entrance in <=200ms via transform/opacity only, and
 * carries an accessible label (SVG is invisible to a screen reader without one).
 */
export * from './types';
export * from './utils';
export * from './ChartEnter';
export * from './Donut';
export * from './BarList';
export * from './Sparkline';
export * from './ColumnChart';
export * from './ProgressRing';
export * from './StackedBar';
