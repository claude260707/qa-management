import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

// 기존 프로젝트에서 pdfjs worker를 이미 설정해두신 방식이 있다면 그걸 따라가시고,
// 없다면 아래처럼 cdn worker를 지정하시면 됩니다. (다른 곳에서 이미 설정했다면 이 줄은 지워도 됩니다.)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  return fullText;
}

// 엑셀은 모든 시트의 모든 셀 값을 행 단위로 이어붙여 하나의 텍스트로 만든다.
export async function extractXlsxText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  let fullText = '';
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    fullText += `[시트: ${sheetName}]\n`;
    rows.forEach((row) => {
      const line = row.filter((cell) => cell !== undefined && cell !== null && cell !== '').join(' | ');
      if (line) fullText += line + '\n';
    });
    fullText += '\n';
  });
  return fullText;
}

export async function extractTxtText(file: File): Promise<string> {
  return await file.text();
}

export async function extractPptxText(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
      return numA - numB;
    });

  let fullText = '';
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async('text');
    const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)];
    const slideText = matches.map((m) => m[1]).join(' ');
    fullText += slideText + '\n\n';
  }
  return fullText;
}

export async function extractFileText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pptx')) return extractPptxText(file);
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return extractXlsxText(file);
  if (lower.endsWith('.txt')) return extractTxtText(file);
  return extractPdfText(file);
}
