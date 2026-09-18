// All lengths in cm, world coords: +x right, +y down.
export type Pt = { x: number; y: number };
export type Wall = { id?: string; a: Pt; b: Pt };
// t = distance (cm) from wall.a to opening centre; hinge 0 = leaf pivots at the a-side jamb; swing ±1 = side of the wall (left/right of a→b) the door opens into
export type Opening = { id: string; wall: string; t: number; w: number; kind: 'door' | 'window'; hinge: 0 | 1; swing: 1 | -1 };
export type PlanImage = { src: string; x: number; y: number; cmPerPx: number; opacity: number };
export type Asset = { id: string; name: string; w: number; d: number; h: number; color: string; img?: string };
export type Item = { id: string; asset: string; x: number; y: number; rot: number }; // center, degrees
export type Layout = { id: string; name: string; items: Item[] };
export type Project = { plan: { walls: Wall[]; openings?: Opening[]; wallT?: number; image?: PlanImage }; assets: Asset[]; layouts: Layout[]; current: string };

const KEY = 'flatplan';
export const uid = () => Math.random().toString(36).slice(2, 10);

export const blank = (): Project => {
  const id = uid();
  return { plan: { walls: [], openings: [], wallT: 10 }, assets: [], layouts: [{ id, name: 'Layout 1', items: [] }], current: id };
};

export const load = (): Project => {
  try { const s = localStorage.getItem(KEY); if (s) return migrate(JSON.parse(s)); } catch {}
  return blank();
};

export const migrate = (p: Project): Project => { p.plan.walls.forEach(w => w.id ??= uid()); p.plan.openings ??= []; return p; };

export const save = (p: Project): string | null => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return null; }
  catch (e) { return `save failed (${(e as Error).name}) — export JSON instead`; }
};

export const layout = (p: Project) => p.layouts.find(l => l.id === p.current) ?? p.layouts[0]!;
export const asset = (p: Project, id: string) => p.assets.find(a => a.id === id);

export const download = (name: string, text: string) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  a.click(); URL.revokeObjectURL(a.href);
};

export const readFile = (f: File, as: 'text' | 'dataURL') => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej;
  as === 'text' ? r.readAsText(f) : r.readAsDataURL(f);
});

// Downscale big plan scans so localStorage survives.
export const shrinkImage = (src: string, max = 2000) => new Promise<string>(res => {
  const im = new Image();
  im.onload = () => {
    const k = Math.min(1, max / Math.max(im.width, im.height));
    if (k === 1) return res(src);
    const c = Object.assign(document.createElement('canvas'), { width: im.width * k, height: im.height * k });
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
    res(c.toDataURL('image/jpeg', 0.85));
  };
  im.src = src;
});
