type Attrs = Record<string, string>;
type XmlElement = {
  attrs: Attrs;
  inner: string;
};
export type Fetcher = typeof fetch;
export type Delay = (ms: number) => Promise<void>;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function decodeXml(value = "") {
  return value
    .replaceAll(/&#(\d+);/g, (_, codepoint: string) => String.fromCodePoint(Number(codepoint)))
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, codepoint: string) => String.fromCodePoint(Number.parseInt(codepoint, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function parseAttrs(attrs = "") {
  const result: Attrs = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  for (const match of attrs.matchAll(attrPattern)) {
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
}

function parseElements(xml: string, tagName: string): XmlElement[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => ({
    attrs: parseAttrs(match[1]),
    inner: match[2],
  }));
}

function openingAttrs(xml: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b([^>]*?)(?:\\/?>)`, "g");
  return [...xml.matchAll(pattern)].map((match) => parseAttrs(match[1]));
}

function firstOpeningAttrs(xml: string, tagName: string) {
  return openingAttrs(xml, tagName)[0] ?? {};
}

function firstText(xml: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`);
  const match = xml.match(pattern);
  return match ? decodeXml(match[1].trim()) : "";
}

async function fetchXml(url: string, token: string | undefined, fetcher: Fetcher) {
  const headers: Record<string, string> = {
    "User-Agent": "personal-data-jobs-bgg-shelf/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetcher(url, { headers });

  if (response.status === 202) {
    return { pending: true, xml: "" };
  }

  if (!response.ok) {
    throw new Error(`BGG request failed: ${response.status} ${response.statusText}`);
  }

  return { pending: false, xml: await response.text() };
}

export { sleep, parseElements, openingAttrs, firstOpeningAttrs, firstText, fetchXml };
