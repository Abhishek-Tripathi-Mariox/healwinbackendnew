import { parseCsv, parseCsvTable, toCsv, normalizeHeader } from "../services/csv";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('name,address\nRavi,"12, MG Road, Noida"')).toEqual([
      ["name", "address"],
      ["Ravi", "12, MG Road, Noida"],
    ]);
  });

  it("handles doubled quotes as a literal quote", () => {
    expect(parseCsv('name\n"Ravi ""Raj"" Kumar"')).toEqual([
      ["name"],
      ['Ravi "Raj" Kumar'],
    ]);
  });

  it("handles a newline inside a quoted field", () => {
    expect(parseCsv('name,note\nRavi,"line one\nline two"')).toEqual([
      ["name", "note"],
      ["Ravi", "line one\nline two"],
    ]);
  });

  it("handles CRLF endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("strips the Excel byte-order mark from the first header", () => {
    const [headers] = parseCsv("﻿name,email\nRavi,r@x.com");
    expect(headers[0]).toBe("name");
  });

  it("ignores trailing blank lines", () => {
    expect(parseCsv("a\n1\n\n\n")).toEqual([["a"], ["1"]]);
  });

  it("keeps empty cells in place", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("treats a whitespace-only line as blank", () => {
    // Spreadsheets leave these behind; they must not become an empty employee.
    expect(parseCsv("   \n")).toEqual([]);
    expect(parseCsv("a\n1\n   \n")).toEqual([["a"], ["1"]]);
  });
});

describe("normalizeHeader", () => {
  it("matches headers regardless of case, spaces and punctuation", () => {
    for (const h of ["Full Name", "full_name", "FULLNAME", "full-name", "Full.Name"]) {
      expect(normalizeHeader(h)).toBe("fullname");
    }
  });
});

describe("parseCsvTable", () => {
  it("keys rows by normalised header", () => {
    const t = parseCsvTable("Full Name,Joining Date\nRavi Kumar,2026-01-15");
    expect(t.rows).toEqual([{ fullname: "Ravi Kumar", joiningdate: "2026-01-15" }]);
    expect(t.headers).toEqual(["Full Name", "Joining Date"]);
  });

  it("trims cell whitespace", () => {
    const t = parseCsvTable("name\n  Ravi  ");
    expect(t.rows[0].name).toBe("Ravi");
  });

  it("fills missing trailing cells with empty strings", () => {
    const t = parseCsvTable("a,b,c\n1,2");
    expect(t.rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });

  it("handles a header-only file", () => {
    expect(parseCsvTable("a,b").rows).toEqual([]);
  });
});

describe("toCsv", () => {
  it("round-trips values that need quoting", () => {
    const csv = toCsv(["name", "note"], [{ name: 'Ravi "R"', note: "a, b" }]);
    const parsed = parseCsv(csv);
    expect(parsed[1]).toEqual(['Ravi "R"', "a, b"]);
  });

  it("starts with a BOM so Excel reads it as UTF-8", () => {
    expect(toCsv(["a"], [{ a: "1" }]).startsWith("﻿")).toBe(true);
  });

  it("writes empty strings for missing keys", () => {
    expect(parseCsv(toCsv(["a", "b"], [{ a: "1" }]))[1]).toEqual(["1", ""]);
  });
});
