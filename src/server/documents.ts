// Turns an uploaded PDF or plain-text file into bounded, page-referenced Source records.
// Nothing is stored here: the teacher reviews the text, then saves it as part of a pack draft.
import type { Source } from '../lib/contracts';
import { AppError, fail } from './errors';
import { LIMITS } from '../lib/limits';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

const tidy = (text: string): string =>
  text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Splits at paragraph, then sentence, then hard boundaries so each piece fits one source. */
export function chunkText(text: string, max: number = LIMITS.sourceText): string[] {
  const pieces: string[] = [];
  let current = '';
  const push = (part: string, joiner = '\n\n') => {
    if (current && current.length + part.length + joiner.length > max) {
      pieces.push(current);
      current = '';
    }
    current = current ? `${current}${joiner}${part}` : part;
  };
  for (const paragraph of tidy(text).split(/\n{2,}/)) {
    if (!paragraph) continue;
    if (paragraph.length <= max) {
      push(paragraph);
      continue;
    }
    for (const sentence of paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph]) {
      for (let start = 0; start < sentence.length; start += max) push(sentence.slice(start, start + max).trim(), ' ');
    }
  }
  if (current) pieces.push(current);
  return pieces.filter(Boolean);
}

async function pdfPages(bytes: Uint8Array): Promise<{ page: number; text: string }[]> {
  // Loaded on demand: pdfjs is heavy and only the PDF path needs it.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: bytes, isEvalSupported: false });
  try {
    const info = await parser.getInfo();
    if (info.total > LIMITS.pdfPages) fail(`PDF-en har for mange sider (maks ${LIMITS.pdfPages}).`, 413);
    const result = await parser.getText();
    return result.pages.map((page) => ({ page: page.num, text: page.text }));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(422, 'Kunne ikke lese PDF-en. Passordbeskyttede eller ødelagte filer støttes ikke.');
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function plainText(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\u0000')) throw new Error('binary');
    return text;
  } catch {
    return fail('Filen må være en PDF eller ren tekst (UTF-8).', 415);
  }
}

export async function extractSources(file: File): Promise<Source[]> {
  if (file.size > LIMITS.fileBytes) fail(`Filen er for stor (maks ${LIMITS.fileBytes / 1024 / 1024} MB).`, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const title = file.name.replace(/\.[^.]*$/, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.sourceTitle) || 'Dokument';
  const isPdf = PDF_MAGIC.every((byte, index) => bytes[index] === byte);
  const pages = isPdf ? await pdfPages(bytes) : [{ page: 1, text: plainText(bytes) }];

  const sources = pages.flatMap(({ page, text }) => chunkText(text).map((part) => ({ id: `src-${crypto.randomUUID()}`, title, page, text: part })));
  if (!sources.length) fail('Fant ingen tekst i filen. Skannede dokumenter (bilder) støttes ikke.');
  if (sources.length > LIMITS.sources) fail(`Dokumentet gir for mange kilder (maks ${LIMITS.sources}). Last opp en kortere del.`, 413);
  if (sources.reduce((sum, source) => sum + source.text.length, 0) > LIMITS.sourcesTotalChars) fail('Dokumentet har for mye tekst. Last opp en kortere del.', 413);
  return sources;
}
