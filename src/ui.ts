import { type Project, type Asset, layout, asset, uid, blank, download, readFile, shrinkImage } from './model';
import { Editor, type Tool } from './editor';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const { on, ...rest } = props, el = Object.assign(document.createElement(tag), rest);
  for (const [k, f] of Object.entries(on ?? {})) el.addEventListener(k, f as EventListener);
  el.append(...kids); return el;
};
const num = (v: number, oninput: (n: number) => void, step = 1) => h('input', { type: 'number', value: String(v), step: String(step), on: { input: (e: any) => oninput(+e.target.value) } });

export function buildUI(side: HTMLElement, tools: HTMLElement, ed: Editor, setProject: (p: Project) => void) {
  const p = () => ed.p;
  let editing: Asset | null = null;

  // ---- tools
  const tbtn = (t: Tool | 'fit', txt: string) => h('button', { textContent: txt, on: { click: () => t === 'fit' ? ed.fit() : (ed.setTool(t), syncTools()) } });
  const tb: Record<string, HTMLButtonElement> = { select: tbtn('select', 'Select (V)'), wall: tbtn('wall', 'Wall (W)'), scale: tbtn('scale', 'Set scale'), fit: tbtn('fit', 'Fit (F)') };
  tools.append(...Object.values(tb));
  const syncTools = () => Object.entries(tb).forEach(([k, b]) => b.classList.toggle('on', k === ed.tool));

  // ---- plan
  const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', on: { input: (e: any) => { const im = p().plan.image; if (im) { im.opacity = +e.target.value; ed.changed(); } } } });
  const planSec = h('section', {}, h('h3', { textContent: 'Floor plan' }),
    h('div', { className: 'row' },
      h('label', { className: 'file', textContent: 'Upload plan image' }, h('input', { type: 'file', accept: 'image/*', on: { change: async (e: any) => {
        const f = e.target.files[0]; if (!f) return;
        p().plan.image = { src: await shrinkImage(await readFile(f, 'dataURL')), x: 0, y: 0, cmPerPx: 1, opacity: 0.6 };
        ed.changed(); ed.fit(); ed.setTool('scale'); syncTools();
      } } })),
      h('button', { textContent: 'Remove image', on: { click: () => { delete p().plan.image; ed.changed(); } } })),
    h('div', { className: 'row' }, h('span', { textContent: 'Opacity' }), opacity),
    h('button', { textContent: 'Clear all walls', on: { click: () => { if (confirm('Delete all walls?')) { p().plan.walls = []; ed.changed(); } } } }),
    h('small', { textContent: 'Walls: click points, type length + Enter for exact cm. After image upload: click 2 points of known distance.' }));

  // ---- furniture form
  const f = { name: h('input', { placeholder: 'Name' }), w: h('input', { type: 'number', placeholder: 'W cm', value: '100' }), d: h('input', { type: 'number', placeholder: 'D cm', value: '50' }),
    h: h('input', { type: 'number', placeholder: 'H cm', value: '75' }), color: h('input', { type: 'color', value: '#6b8e6b' }), img: '' as string };
  const imgLabel = h('label', { className: 'file', textContent: 'Top-down image' }, h('input', { type: 'file', accept: 'image/*', on: { change: async (e: any) => { const fl = e.target.files[0]; if (fl) { f.img = await shrinkImage(await readFile(fl, 'dataURL'), 600); imgLabel.textContent = 'Image ✓'; } } } }));
  const readForm = (): Omit<Asset, 'id'> => ({ name: f.name.value || 'item', w: +f.w.value || 50, d: +f.d.value || 50, h: +f.h.value || 0, color: f.color.value, ...(f.img ? { img: f.img } : {}) });
  const fillForm = (a: Asset | null) => { editing = a; f.name.value = a?.name ?? ''; f.w.value = String(a?.w ?? 100); f.d.value = String(a?.d ?? 50); f.h.value = String(a?.h ?? 75); f.color.value = a?.color ?? '#6b8e6b'; f.img = a?.img ?? ''; imgLabel.textContent = f.img ? 'Image ✓' : 'Top-down image'; addBtn.textContent = a ? 'Update' : 'Add'; delBtn.hidden = !a; renderList(); };
  const addBtn = h('button', { textContent: 'Add', on: { click: () => { if (editing) Object.assign(editing, readForm(), f.img ? {} : { img: undefined }); else p().assets.push({ id: uid(), ...readForm() }); fillForm(null); ed.changed(); } } });
  const delBtn = h('button', { textContent: 'Delete', hidden: true, on: { click: () => { if (!editing) return; p().assets = p().assets.filter(a => a !== editing); p().layouts.forEach(l => l.items = l.items.filter(i => i.asset !== editing!.id)); fillForm(null); ed.changed(); } } });
  const list = h('ul');
  const renderList = () => {
    list.replaceChildren(...p().assets.map(a => h('li', { draggable: true, className: a === editing ? 'on' : '', on: {
      dragstart: (e: any) => e.dataTransfer.setData('asset', a.id), click: () => fillForm(a === editing ? null : a), dblclick: () => ed.addItem(a.id) } },
      h('div', { className: 'sw', style: a.img ? `background-image:url(${a.img})` : `background:${a.color}` }), h('span', { textContent: a.name }), h('small', { textContent: `${a.w}×${a.d}` }),
      h('button', { textContent: '+', title: 'place', on: { click: (e: any) => { e.stopPropagation(); ed.addItem(a.id); } } }))));
  };
  const libSec = h('section', {}, h('h3', { textContent: 'Furniture' }),
    h('div', { className: 'row' }, f.name, f.color), h('div', { className: 'row' }, f.w, f.d, f.h), h('div', { className: 'row' }, imgLabel, addBtn, delBtn),
    list, h('small', { textContent: 'Drag onto plan, or + / double-click to place at center.' }));

  // ---- selection props
  const selSec = h('section', {}, h('h3', { textContent: 'Selected' }));
  const renderSel = () => {
    const it = ed.selected(), a = it && asset(p(), it.asset);
    selSec.replaceChildren(h('h3', { textContent: 'Selected' }));
    if (!it || !a) return selSec.append(h('small', { textContent: ed.sel?.kind === 'wall' ? 'wall — Del to remove' : 'nothing' }));
    selSec.append(h('div', { textContent: `${a.name} — ${a.w}×${a.d}×${a.h} cm` }),
      h('div', { className: 'row' }, h('span', { textContent: 'x' }), num(it.x, v => { it.x = v; ed.changed(); }), h('span', { textContent: 'y' }), num(it.y, v => { it.y = v; ed.changed(); })),
      h('div', { className: 'row' }, h('span', { textContent: 'rot' }), num(it.rot, v => { it.rot = v; ed.changed(); }, 15),
        h('button', { textContent: '↻90', on: { click: () => ed.rotate(90) } }), h('button', { textContent: 'dup', on: { click: () => ed.dup() } }), h('button', { textContent: 'del', on: { click: () => ed.del() } })));
  };

  // ---- layouts
  const laySel = h('select', { on: { change: (e: any) => { p().current = e.target.value; ed.sel = null; ed.changed(); } } });
  const renderLayouts = () => laySel.replaceChildren(...p().layouts.map(l => h('option', { value: l.id, textContent: l.name, selected: l.id === p().current })));
  const newLayout = (copy: boolean) => { const src = layout(p()), id = uid(); p().layouts.push({ id, name: prompt('Name:', copy ? src.name + ' copy' : `Layout ${p().layouts.length + 1}`) || 'Layout', items: copy ? src.items.map(i => ({ ...i, id: uid() })) : [] }); p().current = id; ed.changed(); };
  const laySec = h('section', {}, h('h3', { textContent: 'Layouts' }), laySel,
    h('div', { className: 'row' }, h('button', { textContent: 'New', on: { click: () => newLayout(false) } }), h('button', { textContent: 'Duplicate', on: { click: () => newLayout(true) } }),
      h('button', { textContent: 'Rename', on: { click: () => { const l = layout(p()); l.name = prompt('Name:', l.name) || l.name; ed.changed(); } } }),
      h('button', { textContent: 'Delete', on: { click: () => { if (p().layouts.length < 2 || !confirm('Delete layout?')) return; p().layouts = p().layouts.filter(l => l.id !== p().current); p().current = p().layouts[0]!.id; ed.changed(); } } })));

  // ---- project
  const projSec = h('section', {}, h('h3', { textContent: 'Project' }),
    h('div', { className: 'row' },
      h('button', { textContent: 'Export JSON', on: { click: () => download('flatplan.json', JSON.stringify(p())) } }),
      h('label', { className: 'file', textContent: 'Import JSON' }, h('input', { type: 'file', accept: '.json', on: { change: async (e: any) => { const fl = e.target.files[0]; if (fl) { setProject(JSON.parse(await readFile(fl, 'text'))); refresh(); ed.fit(); } } } })),
      h('button', { textContent: 'Reset', on: { click: () => { if (confirm('Erase everything?')) { setProject(blank()); refresh(); ed.changed(); } } } })));

  side.append(planSec, libSec, selSec, laySec, projSec);
  const refresh = () => { opacity.value = String(p().plan.image?.opacity ?? 0.6); renderList(); renderSel(); renderLayouts(); syncTools(); };
  ed.onSelect = renderSel;
  refresh();
  return refresh;
}
