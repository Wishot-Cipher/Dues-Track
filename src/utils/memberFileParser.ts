/**
 * memberFileParser.ts
 * Universal file parser for bulk member import.
 * Supports: CSV, TSV, TXT, Excel (.xlsx/.xls), Word (.docx)
 *
 * Detects columns by smart header matching — users don't need
 * exact column names. Works with files exported from Excel, Google
 * Sheets, Word tables, or plain text editors.
 */

import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

// ── Types ──
export interface ParsedMember {
  member_id: string;
  full_name: string;
  email: string;
  phone: string;
}

export interface ParseResult {
  members: ParsedMember[];
  totalRows: number;
  skippedRows: number;
  warnings: string[];
  detectedFormat: string;
  columnMapping: Record<string, string>;
}

type SupportedFormat = 'csv' | 'tsv' | 'txt' | 'xlsx' | 'xls' | 'docx' | 'unknown';

// ── Column detection patterns ──
// Each field has multiple aliases users might use as headers
const COLUMN_PATTERNS: Record<keyof ParsedMember, RegExp> = {
  member_id: /^(id|member.?id|matric|matric.?no|reg.?no|registration|student.?id|roll.?no|admission|adm.?no|index|code|number|no\.?|s\.?n\.?o?\.?|#)$/i,
  full_name: /^(name|full.?name|student.?name|member.?name|names|surname|first.?name|display.?name|person|student|member)$/i,
  email: /^(email|e-?mail|email.?address|mail|e.?mail.?address)$/i,
  phone: /^(phone|mobile|tel|telephone|cell|contact|phone.?no|mobile.?no|gsm|whatsapp|phone.?number)$/i,
};

// ── Public API ──

/**
 * Detect file format from extension or MIME type
 */
export function detectFormat(file: File): SupportedFormat {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, SupportedFormat> = {
    csv: 'csv',
    tsv: 'tsv',
    txt: 'txt',
    xlsx: 'xlsx',
    xls: 'xls',
    docx: 'docx',
  };
  if (mimeMap[ext]) return mimeMap[ext];
  // Fallback to MIME type
  if (file.type.includes('spreadsheet') || file.type.includes('excel')) return 'xlsx';
  if (file.type.includes('word') || file.type.includes('document')) return 'docx';
  if (file.type.includes('csv') || file.type.includes('comma')) return 'csv';
  if (file.type.includes('tab-separated')) return 'tsv';
  if (file.type.includes('text')) return 'txt';
  return 'unknown';
}

/**
 * Parse any supported file and return structured member data.
 * This is the main entry point — call with a File object.
 */
export async function parseFile(file: File): Promise<ParseResult> {
  const format = detectFormat(file);

  switch (format) {
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'docx':
      return parseWord(file);
    case 'csv':
    case 'tsv':
    case 'txt':
      return parseDelimited(file, format);
    default:
      // Try as text anyway
      return parseDelimited(file, 'csv');
  }
}

/**
 * Parse raw text input (pasted CSV/TSV).
 */
export function parseText(text: string): ParseResult {
  // Detect delimiter
  const firstLine = text.split('\n')[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  return parseDelimitedText(text, delimiter === '\t' ? 'tsv' : 'csv');
}

/**
 * Get human-readable accepted formats string
 */
export function getAcceptedFormats(): string {
  return '.csv, .xlsx, .xls, .docx, .tsv, .txt';
}

/**
 * Get the accept attribute for <input type="file">
 */
export function getFileAcceptAttribute(): string {
  return '.csv,.tsv,.txt,.xlsx,.xls,.docx,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

// ── Parsers ──

async function parseDelimited(file: File, format: string): Promise<ParseResult> {
  const text = await file.text();
  return parseDelimitedText(text, format);
}

function parseDelimitedText(text: string, format: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) {
    return { members: [], totalRows: 0, skippedRows: 0, warnings: ['File is empty'], detectedFormat: format, columnMapping: {} };
  }

  // Detect delimiter
  const firstLine = lines[0];
  let delimiter = ',';
  if (format === 'tsv' || firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';')) delimiter = ';';
  else if (firstLine.includes('|')) delimiter = '|';

  // Parse all lines into rows
  const rows = lines.map(line => splitRow(line, delimiter));

  // Try to detect header row
  const { hasHeader, mapping, headerRow } = detectColumns(rows);

  const dataRows = hasHeader ? rows.slice(1) : rows;
  return buildResult(dataRows, mapping, hasHeader ? headerRow : null, format, lines.length);
}

async function parseExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return { members: [], totalRows: 0, skippedRows: 0, warnings: ['No sheets found in workbook'], detectedFormat: 'xlsx', columnMapping: {} };
  }

  // Convert to array of arrays
  const rawRows: string[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const rows = rawRows.map(r => r.map(cell => String(cell).trim()));
  const nonEmptyRows = rows.filter(r => r.some(c => c));

  if (nonEmptyRows.length === 0) {
    return { members: [], totalRows: 0, skippedRows: 0, warnings: ['Spreadsheet is empty'], detectedFormat: 'xlsx', columnMapping: {} };
  }

  const { hasHeader, mapping, headerRow } = detectColumns(nonEmptyRows);
  const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;
  return buildResult(dataRows, mapping, hasHeader ? headerRow : null, 'xlsx', nonEmptyRows.length);
}

async function parseWord(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const warnings: string[] = [];

  try {
    // Try to extract HTML (mammoth converts tables to HTML tables)
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const html = result.value;

    // Check if there are tables
    if (html.includes('<table') && html.includes('<tr')) {
      return parseWordTable(html);
    }

    // No table — try extracting plain text lines
    const textResult = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = textResult.value;

    if (!text.trim()) {
      return { members: [], totalRows: 0, skippedRows: 0, warnings: ['Word document is empty'], detectedFormat: 'docx', columnMapping: {} };
    }

    // Try parsing as delimited text (some Word docs have tab-separated or comma-separated data)
    warnings.push('No table found in Word document — attempting to parse as text lines');
    const parsed = parseDelimitedText(text, 'docx');
    parsed.warnings = [...warnings, ...parsed.warnings];
    return parsed;
  } catch (err) {
    return { members: [], totalRows: 0, skippedRows: 0, warnings: [`Failed to parse Word document: ${err}`], detectedFormat: 'docx', columnMapping: {} };
  }
}

function parseWordTable(html: string): ParseResult {
  // Simple HTML table parser using regex (no DOM needed in worker-safe way)
  const rows: string[][] = [];

  // Extract all <tr>...</tr>
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    const tdRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      // Strip HTML tags from cell content
      const cellText = tdMatch[1].replace(/<[^>]*>/g, '').trim();
      cells.push(cellText);
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) {
    return { members: [], totalRows: 0, skippedRows: 0, warnings: ['Could not extract table data from Word document'], detectedFormat: 'docx', columnMapping: {} };
  }

  const { hasHeader, mapping, headerRow } = detectColumns(rows);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return buildResult(dataRows, mapping, hasHeader ? headerRow : null, 'docx', rows.length);
}

// ── Column Detection ──

interface ColumnDetection {
  hasHeader: boolean;
  mapping: ColumnMapping;
  headerRow: string[];
}

interface ColumnMapping {
  member_id: number;
  full_name: number;
  email: number;
  phone: number;
}

function detectColumns(rows: string[][]): ColumnDetection {
  if (rows.length === 0) {
    return { hasHeader: false, mapping: { member_id: 0, full_name: 1, email: 2, phone: 3 }, headerRow: [] };
  }

  const firstRow = rows[0];
  const mapping: ColumnMapping = { member_id: -1, full_name: -1, email: -1, phone: -1 };
  let matchCount = 0;

  // Try matching first row as header
  for (let col = 0; col < firstRow.length; col++) {
    const cellClean = firstRow[col].replace(/[_\-\s]+/g, ' ').trim();
    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (mapping[field as keyof ColumnMapping] === -1 && pattern.test(cellClean)) {
        mapping[field as keyof ColumnMapping] = col;
        matchCount++;
        break;
      }
    }
  }

  // If we matched at least 2 columns by header name, treat row 0 as header
  if (matchCount >= 2) {
    // Fill in any unmatched columns by position
    fillUnmapped(mapping, firstRow.length);
    return { hasHeader: true, mapping, headerRow: firstRow };
  }

  // No header — try smart heuristic mapping based on data content
  const sampleRow = rows.length > 1 ? rows[1] : rows[0];
  const heuristicMapping = mapByContent(sampleRow);
  return { hasHeader: false, mapping: heuristicMapping, headerRow: [] };
}

function fillUnmapped(mapping: ColumnMapping, totalCols: number) {
  const used = new Set(Object.values(mapping).filter(v => v >= 0));
  const unmappedFields = (Object.keys(mapping) as Array<keyof ColumnMapping>).filter(
    k => mapping[k] === -1,
  );

  // Assign remaining columns in order
  for (let col = 0; col < totalCols && unmappedFields.length > 0; col++) {
    if (!used.has(col)) {
      const field = unmappedFields.shift()!;
      mapping[field] = col;
      used.add(col);
    }
  }
}

function mapByContent(row: string[]): ColumnMapping {
  const mapping: ColumnMapping = { member_id: -1, full_name: -1, email: -1, phone: -1 };
  const used = new Set<number>();

  // Email is easy to detect
  for (let i = 0; i < row.length; i++) {
    if (/\S+@\S+\.\S+/.test(row[i])) {
      mapping.email = i;
      used.add(i);
      break;
    }
  }

  // Phone: digits, +, spaces, dashes, at least 7 digits
  for (let i = 0; i < row.length; i++) {
    if (used.has(i)) continue;
    const digits = row[i].replace(/\D/g, '');
    if (digits.length >= 7 && /^[\d\s+\-()]+$/.test(row[i].trim())) {
      mapping.phone = i;
      used.add(i);
      break;
    }
  }

  // Name: contains a space & mostly letters
  for (let i = 0; i < row.length; i++) {
    if (used.has(i)) continue;
    const val = row[i].trim();
    if (val.includes(' ') && /^[a-zA-ZÀ-ÿ\s.\-']+$/.test(val) && val.length > 3) {
      mapping.full_name = i;
      used.add(i);
      break;
    }
  }

  // ID: whatever column is left first, or contains slashes/digits mix
  for (let i = 0; i < row.length; i++) {
    if (used.has(i)) continue;
    mapping.member_id = i;
    used.add(i);
    break;
  }

  // Fallback: positional (0=id, 1=name, 2=email, 3=phone)
  if (mapping.member_id === -1) mapping.member_id = 0;
  if (mapping.full_name === -1) mapping.full_name = Math.min(1, row.length - 1);
  if (mapping.email === -1 && row.length > 2) mapping.email = 2;
  if (mapping.phone === -1 && row.length > 3) mapping.phone = 3;

  return mapping;
}

// ── Build Result ──

function buildResult(
  dataRows: string[][],
  mapping: ColumnMapping,
  headerRow: string[] | null,
  format: string,
  totalRowCount: number,
): ParseResult {
  const members: ParsedMember[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  const columnMapping: Record<string, string> = {};
  if (headerRow) {
    if (mapping.member_id >= 0 && mapping.member_id < headerRow.length) columnMapping['ID'] = headerRow[mapping.member_id];
    if (mapping.full_name >= 0 && mapping.full_name < headerRow.length) columnMapping['Name'] = headerRow[mapping.full_name];
    if (mapping.email >= 0 && mapping.email < headerRow.length) columnMapping['Email'] = headerRow[mapping.email];
    if (mapping.phone >= 0 && mapping.phone < headerRow.length) columnMapping['Phone'] = headerRow[mapping.phone];
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row || row.every(c => !c.trim())) {
      skipped++;
      continue;
    }

    const get = (idx: number) => (idx >= 0 && idx < row.length ? row[idx].trim() : '');

    const member_id = get(mapping.member_id);
    const full_name = get(mapping.full_name);

    if (!member_id && !full_name) {
      skipped++;
      warnings.push(`Row ${i + 1}: Missing both ID and name — skipped`);
      continue;
    }

    if (!member_id) {
      skipped++;
      warnings.push(`Row ${i + 1}: Missing ID — skipped`);
      continue;
    }

    if (!full_name) {
      warnings.push(`Row ${i + 1}: Missing name for "${member_id}" — will use ID as name`);
    }

    members.push({
      member_id,
      full_name: full_name || member_id,
      email: get(mapping.email),
      phone: get(mapping.phone),
    });
  }

  return {
    members,
    totalRows: totalRowCount,
    skippedRows: skipped,
    warnings,
    detectedFormat: format.toUpperCase(),
    columnMapping,
  };
}

// ── Helpers ──

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === ',') return parseCSVLine(line);
  return line.split(delimiter).map(s => s.trim());
}

/**
 * RFC 4180-compliant CSV line parser.
 * Handles quoted fields, escaped quotes, and commas within quotes.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}
