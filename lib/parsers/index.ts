/**
 * Parser index — re-exports all parser modules for convenient imports.
 */

export { parseCsv, isCsvFile } from "./csv-parser"
export type { ParseCsvOptions, CsvParseResult } from "./csv-parser"

export { parseXlsx, getXlsxSheetNames, isXlsxFile } from "./excel-parser"
export type { ParseXlsxOptions, XlsxParseResult } from "./excel-parser"

export { parseJson, isJsonFile } from "./json-parser"
export type { JsonParseResult } from "./json-parser"

export { parseDocx, isDocxFile } from "./docx-parser"
export type { DocxParseResult } from "./docx-parser"

export { parsePdf, isPdfFile } from "./pdf-parser"
export type { PdfParseResult } from "./pdf-parser"
