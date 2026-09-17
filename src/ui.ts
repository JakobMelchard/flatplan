import { type Project, type Asset, layout, asset, uid, blank, download, readFile, shrinkImage } from './model';
import { Editor, type Tool } from './editor';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const { on, ...rest } = props, el = Object.assign(document.createElement(tag), rest);
  for (const [k, f] of Object.entries(on ?? {})) el.addEventListener(k, f as EventListener);
  el.append(...kids); return el;
};
const btn = (text: string, click: () => void, cls = '') => h('button', { textContent: text, className: cls, on: { click } });
const num = (v: number, oninput: (n: number) => void, step = 1) => h('input', { type: 'number', value: String(v), step: String(step), on: { input: (e: any) => oninput(+e.target.value) } });
const field = (label: string, ctl: HTMLElement) => h('label', { className: 'field' }, h('span', { textContent: label }), ctl);
const file = (text: string, accept: string, onFile: (f: File) => void) => h('label', { className: 'btn', textContent: text }, h('input', { type: 'file', accept, on: { change: (e: any) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); } } }));
const sec = (title: string, ...kids: (Node | string)[]) => h('div', { className: 'sec' }, h('h3', { textContent: title }), ...kids);

export function buildUI(top: HTMLElement, left: HTMLElement, right: HTMLElement, ed: Editor, setProject: (p: Project) => void) {
  const p = () => ed.p;
  let editing: Asset | null = null;

  // ================= top bar: tools | layouts | view =================
  const tb: Record<Tool, HTMLButtonElement> = { select: btn('Select', () => ed.setTool('select')), wall: btn('Wall', () => ed.setTool('wall')), scale: btn('Scale', () => ed.setTool('scale')) };
  const syncTools = () => (Object.keys(tb) as Tool[]).forEach(k => tb[k].classList.toggle('on', k === ed.tool));

  const laySel = h('select', { on: { change: (e: any) => { p().current = e.target.value; ed.sel = null; ed.changed(); } } });
  const renderLayouts = () => laySel.replaceChildren(...p().layouts.map(l => h('option', { value: l.id, textContent: l.name, selected: l.id === p().current })));
  const newLayout = (copy: boolean) => {
    const src = layout(p()), id = uid(), name = prompt('Layout name:', copy ? `${src.name} copy` : `Layout ${p().layouts.length + 1}`); if (!name) return;
    p().layouts.push({ id, name, items: copy ? src.items.map(i => ({ ...i, id: uid() })) : [] }); p().current = id; ed.changed();
  };

  const zoomLbl = h('span', { id: 'zoom' });
  ed.onView = () => { zoomLbl.textContent = `${Math.round(ed.k * 100)}%`; };

  top.append(
    h('div', { className: 'seg' }, tb.select, tb.wall, tb.scale),
    h('div', { className: 'sp' }),
    h('div', { className: 'row' }, h('small', { textContent: 'Layout' }), laySel,
      h('div', { className: 'seg' }, btn('New', () => newLayout(false)), btn('Dup', () => newLayout(true)),
        btn('Rename', () => { const l = layout(p()); l.name = prompt('Name:', l.name) || l.name; ed.changed(); }),
        btn('Delete', () => { if (p().layouts.length < 2 || !confirm(`Delete "${layout(p()).name}"?`)) return; p().layouts = p().layouts.filter(l => l.id !== p().current); p().current = p().layouts[0]!.id; ed.changed(); }))),
    h('div', { className: 'sp' }),
    h('div', { className: 'seg' }, btn('−', () => ed.zoom(1 / 1.25), 'sq'), zoomLbl, btn('+', () => ed.zoom(1.25), 'sq'), btn('Fit', () => ed.fit())),
    h('div', { className: 'seg' },
      btn('Export', () => download('flatplan.json', JSON.stringify(p()))),
      file('Import', '.json', async f => { setProject(JSON.parse(await readFile(f, 'text'))); refresh(); ed.fit(); }),
      btn('Reset', () => { if (confirm('Erase everything?')) { setProject(blank()); ed.changed(); } })));

  // ================= left: catalog =================
  const f = { name: h('input', { placeholder: 'Sofa' }), w: h('input', { type: 'number', value: '100' }), d: h('input', { type: 'number', value: '50' }), h: h('input', { type: 'number', value: '75' }), color: h('input', { type: 'color', value: '#7fa07f' }), img: '' };
  const imgBtn = file('Image…', 'image/*', async fl => { f.img = await shrinkImage(await readFile(fl, 'dataURL'), 600); imgBtn.textContent = 'Image ✓'; });
  const readForm = (): Omit<Asset, 'id'> => ({ name: f.name.value.trim() || 'Item', w: +f.w.value || 50, d: +f.d.value || 50, h: +f.h.value || 0, color: f.color.value, ...(f.img ? { img: f.img } : {}) });
  const form = h('details', { open: true });
  const fillForm = (a: Asset | null) => {
    editing = a; f.name.value = a?.name ?? ''; f.w.value = String(a?.w ?? 100); f.d.value = String(a?.d ?? 50); f.h.value = String(a?.h ?? 75); f.color.value = a?.color ?? '#7fa07f'; f.img = a?.img ?? '';
    imgBtn.textContent = f.img ? 'Image ✓' : 'Image…'; saveBtn.textContent = a ? 'Update' : 'Add'; delBtn.hidden = !a; cancelBtn.hidden = !a; if (a) form.open = true; renderList();
  };
  const saveBtn = btn('Add', () => { if (editing) { Object.assign(editing, readForm()); if (!f.img) delete editing.img; } else p().assets.push({ id: uid(), ...readForm() }); fillForm(null); ed.changed(); }, 'pri');
  const delBtn = btn('Delete', () => { if (!editing || !confirm(`Delete "${editing.name}" and all placed copies?`)) return; const id = editing.id; p().assets = p().assets.filter(a => a.id !== id); p().layouts.forEach(l => l.items = l.items.filter(i => i.asset !== id)); fillForm(null); ed.changed(); });
  const cancelBtn = btn('Cancel', () => fillForm(null));
  form.append(h('summary', { textContent: 'New item' }), h('div', {},
    field('Name', f.name),
    h('div', { className: 'grid3' }, field('W cm', f.w), field('D cm', f.d), field('H cm', f.h)),
    h('div', { className: 'grid2' }, field('Color', f.color), field('Top view', imgBtn)),
    h('div', { className: 'row' }, saveBtn, cancelBtn, delBtn)));

  const list = h('ul');
  const renderList = () => {
    const rows = p().assets.map(a => h('li', { draggable: true, className: a === editing ? 'on' : '', title: 'drag onto plan · click to edit · double-click to place', on: {
      dragstart: (e: any) => e.dataTransfer.setData('asset', a.id), click: () => fillForm(a === editing ? null : a), dblclick: () => ed.addItem(a.id) } },
      h('div', { className: 'sw', style: a.img ? `background-image:url(${a.img})` : `background:${a.color}` }), h('span', { textContent: a.name }), h('small', { textContent: `${a.w}×${a.d}` }),
      btn('+', () => ed.addItem(a.id), 'sq')));
    list.replaceChildren(...(rows.length ? rows : [h('div', { className: 'empty', textContent: 'No furniture yet. Add items above, then drag them onto the plan.' })]));
  };
  left.append(h('div', { className: 'sec' }, h('h3', { textContent: 'Catalog' }), form), h('div', { className: 'sec grow' }, list));
  fillForm(null);

  // ================= right: properties (contextual) + plan =================
  const props = h('div', { className: 'sec' });
  const renderSel = () => {
    const it = ed.selected(), a = it && asset(p(), it.asset);
    props.replaceChildren(h('h3', { textContent: 'Selection' }));
    if (it && a) {
      const bad = ed.collides(it, it.x, it.y, it.rot);
      props.append(h('div', { textContent: a.name }), h('small', { textContent: `${a.w} × ${a.d} × ${a.h} cm${bad ? ' — overlaps wall' : ''}`, style: bad ? 'color:#f87171' : '' }),
        h('div', { className: 'kv' },
          h('span', { textContent: 'X' }), num(it.x, v => { it.x = v; ed.changed(); }),
          h('span', { textContent: 'Y' }), num(it.y, v => { it.y = v; ed.changed(); }),
          h('span', { textContent: 'Rot °' }), num(it.rot, v => { it.rot = v; ed.changed(); }, 15)),
        h('div', { className: 'grid3' }, btn('↺ 90', () => ed.rotate(-90)), btn('↻ 90', () => ed.rotate(90)), btn('Dup', () => ed.dup())),
        btn('Delete item', () => ed.del()));
    } else if (ed.sel?.kind === 'wall') {
      const w = p().plan.walls[ed.sel.i]!;
      props.append(h('div', { textContent: 'Wall' }), h('small', { textContent: `${Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y).toFixed(0)} cm` }), btn('Delete wall', () => ed.del()));
    } else props.append(h('div', { className: 'empty', textContent: 'Nothing selected.' }));
  };

  const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', on: { input: (e: any) => { const im = p().plan.image; if (im) { im.opacity = +e.target.value; ed.changed(); } } } });
  const imgRow = h('div', { className: 'grid2' });
  const renderPlan = () => {
    const im = p().plan.image;
    imgRow.replaceChildren(file(im ? 'Replace image…' : 'Upload image…', 'image/*', async fl => {
      p().plan.image = { src: await shrinkImage(await readFile(fl, 'dataURL')), x: 0, y: 0, cmPerPx: 1, opacity: 0.6 }; ed.changed(); ed.fit(); ed.setTool('scale');
    }), btn(im ? 'Remove' : 'Set scale', () => im ? (delete p().plan.image, ed.changed()) : ed.setTool('scale')));
    opacity.value = String(im?.opacity ?? 0.6); opacity.disabled = !im;
  };
  const plan = sec('Floor plan', imgRow,
    h('div', { className: 'kv' }, h('span', { textContent: 'Opacity' }), opacity, h('span', { textContent: 'Wall cm' , title: 'wall thickness' }), num(p().plan.wallT ?? 10, v => { p().plan.wallT = v || 10; ed.changed(); })),
    btn('Clear all walls', () => { if (confirm('Delete all walls?')) { p().plan.walls = []; ed.changed(); } }),
    h('small', { textContent: 'Wall tool: click corners; type a length + Enter for exact cm; Shift = orthogonal. Scale tool: click two points of known distance.' }));
  const keys = sec('Shortcuts', h('small', { innerHTML: 'V select · W wall · F fit<br>Drag empty space / Alt+drag = pan · wheel = zoom<br>R / Shift+R ±90° · Q / E ±15° · arrows nudge<br>Del remove · Ctrl+D duplicate · Esc deselect' }));
  right.append(props, plan, keys);

  // ================= wiring =================
  const refresh = () => { renderList(); renderSel(); renderLayouts(); renderPlan(); syncTools(); ed.onView(); };
  ed.onSelect = () => { renderSel(); syncTools(); };
  refresh();
  return refresh;
}
