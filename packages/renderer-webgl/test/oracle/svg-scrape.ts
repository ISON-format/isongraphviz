// A test-only scrape of a V5 (igr-svg/1) document into the SvgReadoutLike shape of design 9.2 ("the oracle's own scrape"). It reads the line-oriented
// documents of fixtures/oracles-svg with a few prefix searches; it imports nothing from renderer-svg and is no part of any package.
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#9": "\t", "#10": "\n", "#13": "\r" };
const decode = (s: string): string => s.replace(/&([a-z#0-9]+);/g, (_m, n: string) => ENT[n] ?? `&${n};`);
const attr = (line: string, name: string): string | undefined => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(line);
  return m ? decode(m[1]!) : undefined;
};
const addressOf = (id: string): unknown => {
  const hex = id.slice(id.lastIndexOf("-") + 1);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
};

export interface ScrapedNode { address: unknown; cx: string; cy: string; selected: boolean; focused: boolean; label?: string }
export interface ScrapedEdge { address: unknown; selected: boolean; focused: boolean; marker: boolean; label?: string }
export interface Scraped { scene_sha256: string; layout_sha256: string; width: number; height: number; directed: boolean; nodes: ScrapedNode[]; edges: ScrapedEdge[] }

export function scrapeSvg(svg: string): Scraped {
  const lines = svg.split("\n");
  const head = lines.find((l) => l.startsWith("<svg "))!;
  const out: Scraped = {
    scene_sha256: attr(head, "data-igr-scene")!, layout_sha256: attr(head, "data-igr-layout")!, width: Number(attr(head, "width")), height: Number(attr(head, "height")),
    directed: svg.includes("<marker "), nodes: [], edges: [],
  };
  let cur: ScrapedNode | ScrapedEdge | undefined;
  for (const l of lines) {
    if (l.startsWith('<g id="')) {
      const id = attr(l, "id")!, cls = attr(l, "class")!.split(" ");
      const selected = cls.includes("igr-selected"), focused = cls.includes("igr-focused");
      if (cls.includes("igr-node")) { cur = { address: addressOf(id), cx: "", cy: "", selected, focused }; out.nodes.push(cur); }
      else { cur = { address: addressOf(id), selected, focused, marker: false }; out.edges.push(cur); }
    } else if (cur && l.startsWith('<circle class="igr-shape"')) { (cur as ScrapedNode).cx = attr(l, "cx")!; (cur as ScrapedNode).cy = attr(l, "cy")!; }
    else if (cur && l.startsWith('<path class="igr-line"')) (cur as ScrapedEdge).marker = l.includes("marker-end=");
    else if (cur && (l.startsWith('<text class="igr-label"') || l.startsWith('<text class="igr-elabel"'))) cur.label = decode(l.slice(l.indexOf(">") + 1, l.lastIndexOf("</text>")));
  }
  return out;
}
