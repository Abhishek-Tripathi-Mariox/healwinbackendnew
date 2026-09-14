/**
 * CSV parsing and writing.
 *
 * Small and dependency-free on purpose, but written to the real format rather
 * than by splitting on commas: a spreadsheet export routinely contains quoted
 * fields with commas in an address, doubled quotes inside a name, blank lines,
 * CRLF endings, and a UTF-8 byte-order mark that Excel adds and nothing else
 * expects. Each of those silently corrupts a naive split, which for a bulk
 * employee upload means wrong data written under someone's name.
 */

/** Parse CSV text into rows of raw cell strings. */
export const parseCsv = (input: string): string[][] => {
  // Excel writes a BOM; left in place it becomes part of the first header and
  // the column stops matching by name.
  const text = input.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Ignore a row that is entirely empty — trailing newlines are normal.
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // an escaped quote
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      // CRLF or a lone CR both end the row.
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Whatever is left after the last newline.
  if (field !== "" || row.length) endRow();
  return rows;
};

/**
 * Parse into objects keyed by header.
 *
 * Headers are matched loosely — lower-cased with spaces, underscores and
 * punctuation removed — so "Full Name", "full_name" and "FULLNAME" all work.
 * People building a sheet by hand should not have to match capitalisation.
 */
export const normalizeHeader = (h: string): string =>
  h.trim().toLowerCase().replace(/[\s_\-./]+/g, "");

export interface CsvTable {
  headers: string[];
  /** One entry per data row, keyed by normalised header. */
  rows: Record<string, string>[];
}

export const parseCsvTable = (input: string): CsvTable => {
  const raw = parseCsv(input);
  if (!raw.length) return { headers: [], rows: [] };
  const headers = raw[0].map((h) => h.trim());
  const keys = headers.map(normalizeHeader);
  const rows = raw.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    keys.forEach((k, idx) => {
      if (!k) return;
      obj[k] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
};

/** Quote a value for CSV output. */
export const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build CSV text from headers and rows. Emits a BOM so Excel reads UTF-8. */
export const toCsv = (
  headers: string[],
  rows: Array<Record<string, unknown>>,
  keys?: string[],
): string => {
  const cols = keys || headers;
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(cols.map((k) => csvCell(r[k])).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
};
