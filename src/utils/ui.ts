/**
 * Box-drawing and table utilities for the wt CLI.
 *
 * Uses rounded corners for boxes and straight lines for tables.
 * All color output uses picocolors.
 */

import pc from "picocolors";

// ============================================================================
// String measurement (strip ANSI for width calculations)
// ============================================================================

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Return the visible (printable) length of a string, ignoring ANSI codes. */
function visibleLength(str: string): number {
  return str.replace(ANSI_RE, "").length;
}

/** Strip all ANSI escape sequences from a string. */
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

// ============================================================================
// Truncation
// ============================================================================

/** Truncate a string to `maxLen` visible characters, appending an ellipsis. */
export function truncate(str: string, maxLen: number): string {
  if (maxLen < 1) return "";
  const plain = stripAnsi(str);
  if (plain.length <= maxLen) return str;
  // For strings with ANSI, operate on the plain version
  return plain.slice(0, maxLen - 1) + "\u2026";
}

// ============================================================================
// Duration formatting
// ============================================================================

/** Format a duration in milliseconds to a human-readable string. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

// ============================================================================
// Box drawing (rounded corners)
// ============================================================================

interface BoxOptions {
  title?: string;
  padding?: number;
  width?: number;
}

/**
 * Render content inside a rounded-corner box.
 *
 * ```
 * \u256D\u2500\u2500 Title \u2500\u2500\u2500\u2500\u2500\u2500\u256E
 * \u2502  content here  \u2502
 * \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F
 * ```
 */
export function box(
  content: string,
  opts: BoxOptions = {},
): string {
  const { title, padding = 1, width: explicitWidth } = opts;
  const pad = " ".repeat(padding);

  const lines = content.split("\n");
  const maxContentWidth = lines.reduce(
    (max, line) => Math.max(max, visibleLength(line)),
    0,
  );

  // inner width = content + padding on both sides
  const innerWidth = explicitWidth
    ? explicitWidth - 2 // subtract box borders
    : maxContentWidth + padding * 2;

  // Top border
  let top: string;
  if (title) {
    const titleStr = ` ${title} `;
    const remainingWidth = innerWidth - titleStr.length - 1; // -1 for the dash after corner
    top =
      pc.dim("\u256D\u2500") +
      pc.bold(titleStr) +
      pc.dim("\u2500".repeat(Math.max(0, remainingWidth)) + "\u256E");
  } else {
    top = pc.dim("\u256D" + "\u2500".repeat(innerWidth) + "\u256E");
  }

  // Content lines
  const middle = lines.map((line) => {
    const visible = visibleLength(line);
    const rightPad = Math.max(0, innerWidth - padding * 2 - visible);
    return pc.dim("\u2502") + pad + line + " ".repeat(rightPad) + pad + pc.dim("\u2502");
  });

  // Bottom border
  const bottom = pc.dim("\u2570" + "\u2500".repeat(innerWidth) + "\u256F");

  return [top, ...middle, bottom].join("\n");
}

// ============================================================================
// Table drawing (straight corners)
// ============================================================================

interface TableOptions {
  maxWidth?: number;
}

/**
 * Render a simple table with headers and rows.
 *
 * ```
 * \u250C\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2510
 * \u2502 Hdr \u2502 Hdr \u2502
 * \u251C\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2524
 * \u2502 val \u2502 val \u2502
 * \u2514\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2518
 * ```
 */
export function table(
  headers: string[],
  rows: string[][],
  opts: TableOptions = {},
): string {
  const { maxWidth } = opts;

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const headerLen = visibleLength(h);
    const maxCell = rows.reduce(
      (max, row) => Math.max(max, visibleLength(row[i] ?? "")),
      0,
    );
    return Math.max(headerLen, maxCell);
  });

  // Apply maxWidth constraint by shrinking the widest columns
  if (maxWidth) {
    const totalBorders = colWidths.length + 1; // | for each col + 1
    const totalPadding = colWidths.length * 2; // 1 space each side per col
    const availableContent = maxWidth - totalBorders - totalPadding;

    if (availableContent > 0) {
      const totalContent = colWidths.reduce((a, b) => a + b, 0);
      if (totalContent > availableContent) {
        const ratio = availableContent / totalContent;
        for (let i = 0; i < colWidths.length; i++) {
          colWidths[i] = Math.max(3, Math.floor(colWidths[i] * ratio));
        }
      }
    }
  }

  const hLine = (left: string, mid: string, right: string): string => {
    const segments = colWidths.map((w) => "\u2500".repeat(w + 2));
    return pc.dim(left + segments.join(mid) + right);
  };

  const formatRow = (cells: string[], bold = false): string => {
    const formatted = cells.map((cell, i) => {
      const w = colWidths[i];
      const truncated = truncate(cell ?? "", w);
      const visible = visibleLength(truncated);
      const padRight = Math.max(0, w - visible);
      const content = truncated + " ".repeat(padRight);
      return bold ? pc.bold(content) : content;
    });
    return pc.dim("\u2502") + formatted.map((c) => ` ${c} `).join(pc.dim("\u2502")) + pc.dim("\u2502");
  };

  const output: string[] = [];
  output.push(hLine("\u250C", "\u252C", "\u2510"));
  output.push(formatRow(headers, true));
  output.push(hLine("\u251C", "\u253C", "\u2524"));
  for (const row of rows) {
    output.push(formatRow(row));
  }
  output.push(hLine("\u2514", "\u2534", "\u2518"));

  return output.join("\n");
}
