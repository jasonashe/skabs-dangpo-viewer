// Host bridge.  Under Electron this forwards to the preload; under a plain
// http server (npm run serve) it falls back to fetch + localStorage so the
// whole reader can be driven headlessly.  Nothing else in the renderer knows
// which of the two it is talking to.

const LS_KEY = 'skabs-reader-state';

function browserHost() {
  const cache = new Map();
  const readText = async (url) => {
    if (cache.has(url)) return cache.get(url);
    const res = await fetch(url);
    const value = res.ok ? await res.text() : null;
    cache.set(url, value);
    return value;
  };
  return {
    kind: 'browser',
    platform: 'browser',
    chromeInsets: async () => ({
      titleBarLeft: 78, titleBarHeight: 46, showsOwnTitle: true,
      platform: 'browser',
    }),
    readData: async (name) => JSON.parse(await readText(`../data/${name}`)),
    readExplanation: (paraId) => readText(`../../Explanations/${paraId}.md`),
    listExplanations: async () => {
      const list = await readText('../../Explanations/index.json');
      return list ? JSON.parse(list) : [];
    },
    readQuote: async (id) => {
      const raw = await readText(`../../Explanations/quotes/${id}.json`);
      return raw ? JSON.parse(raw) : null;
    },
    readSource: async ({ file, offset = 0, before = 4000, after = 6000 }) => {
      const text = await readText(`../../Commentaries/${encodeURIComponent(file)}`);
      if (text == null) return null;
      const start = Math.max(0, offset - before);
      const end = Math.min(text.length, offset + after);
      return { start, end, total: text.length, text: text.slice(start, end) };
    },
    loadState: async () => {
      try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      } catch {
        return {};
      }
    },
    saveState: async (patch) => {
      const cur = await browserState();
      localStorage.setItem(LS_KEY, JSON.stringify({ ...cur, ...patch }));
      return true;
    },
    setShortcuts: async () => true,
    setTitleBarTheme: async () => true,
    onMenu: () => {},
  };
}

async function browserState() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}

export const host = window.skabsHost || browserHost();
