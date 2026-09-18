import { type Project, type Asset, layout, asset, uid, blank, download, readFile, shrinkImage } from './model';
import { Editor, type Tool } from './editor';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const { on, ...rest } = props, el = Object.assign(document.createElement(tag), rest);
  for (const [k, f] of Object.entries(on ?? {})) el.addEventListener(k, f as EventListener);
  el.append(...kids); return el;
};
const I = {
  cursor: '<path d="M5 3l14 8-6 2-3 6z"/>', wall: '<path d="M3 20V4M21 20V4M3 12h18"/>', ruler: '<path d="M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>', rotr: '<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', upload: '<path d="M12 16V4m-5 5l5-5 5 5M4 20h16"/>', download: '<path d="M12 4v12m-5-5l5 5 5-5M4 20h16"/>',
  door: '<path d="M14 4v16H5V4zM5 20h14M11 12h.01"/><path d="M14 4l5 2v14"/>', window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>', flip: '<path d="M12 3v18M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>', reset: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
};
const svg = (d: string) => { const s = h('span'); s.innerHTML = `<svg viewBox="0 0 24 24">${d}</svg>`; return s.firstElementChild as SVGElement; };
const btn = (label: string, click: () => void, opts: { icon?: string; cls?: string; title?: string } = {}) =>
  h('button', { className: `btn ${opts.cls ?? ''}`, title: opts.title ?? '', on: { click } }, ...(opts.icon ? [svg(opts.icon)] : []), ...(label ? [label] : []));
const numIn = (v: number, oninput: (n: number) => void, unit = 'cm', step = 1, pre = '') =>
  h('div', { className: 'in' }, ...(pre ? [h('span', { className: 'pre', textContent: pre })] : []),
    h('input', { type: 'number', value: String(v), step: String(step), on: { input: (e: any) => oninput(+e.target.value) } }), h('span', { className: 'u', textContent: unit }));
const field = (label: string, ctl: HTMLElement) => h('label', { className: 'field' }, h('span', { textContent: label }), ctl);
const file = (label: string, accept: string, onFile: (f: File) => void, opts: { icon?: string; cls?: string } = {}) =>
  h('label', { className: `btn ${opts.cls ?? ''}` }, ...(opts.icon ? [svg(opts.icon)] : []), label,
    h('input', { type: 'file', accept, on: { change: (e: any) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); } } }));
const thumb = (a: Asset) => {
  const k = 34 / Math.max(a.w, a.d), i = h('i', { style: `width:${Math.max(4, a.w * k)}px;height:${Math.max(4, a.d * k)}px;${a.img ? `background-image:url(${a.img})` : `background:${a.color}`}` });
  return h('div', { className: 'th' }, i);
};
const PALETTE = ['#50fa7b', '#8be9fd', '#ffb86c', '#ff79c6', '#f1fa8c', '#bd93f9', '#ff5555'];
const kbd = (s: string) => s.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>');

export function buildUI(top: HTMLElement, left: HTMLElement, right: HTMLElement, main: HTMLElement, ed: Editor, setProject: (p: Project) => void) {
  const p = () => ed.p;

  // ============ header: brand · layout tabs · file actions ============
  const tabs = h('div', { className: 'tabs' });
  const renameLayout = (id: string) => { const l = p().layouts.find(l => l.id === id)!, n = prompt('Layout name', l.name)?.trim(); if (n) { l.name = n; ed.changed(); } };
  const renderTabs = () => tabs.replaceChildren(
    ...p().layouts.map(l => {
      const on = l.id === p().current;
      return h('button', { className: `tab ${on ? 'on' : ''}`, title: 'double-click to rename', on: { click: () => { if (!on) { p().current = l.id; ed.sel = null; ed.changed(); } }, dblclick: () => renameLayout(l.id) } }, l.name,
        ...(on && p().layouts.length > 1 ? [h('span', { className: 'x', title: 'delete layout', on: { click: (e: Event) => { e.stopPropagation(); if (!confirm(`Delete layout "${l.name}"?`)) return; p().layouts = p().layouts.filter(x => x.id !== l.id); p().current = p().layouts[0]!.id; ed.changed(); } } }, svg(I.x))] : []));
    }),
    h('button', { className: 'tab add', title: 'new layout', on: { click: () => { const id = uid(); p().layouts.push({ id, name: `Layout ${p().layouts.length + 1}`, items: [] }); p().current = id; ed.changed(); } } }, '+'),
    h('button', { className: 'tab', title: 'duplicate current layout', on: { click: () => { const s = layout(p()), id = uid(); p().layouts.push({ id, name: `${s.name} copy`, items: s.items.map(i => ({ ...i, id: uid() })) }); p().current = id; ed.changed(); } } }, svg(I.copy)));
  top.append(h('div', { className: 'brand' }, h('i'), 'flatplan'), tabs,
    h('div', { className: 'hgroup' },
      file('Import', '.json', async f => { setProject(JSON.parse(await readFile(f, 'text'))); refresh(); ed.fit(); }, { icon: I.upload, cls: 'ghost' }),
      btn('Export', () => download('flatplan.json', JSON.stringify(p())), { icon: I.download, cls: 'ghost' }),
      btn('', () => { if (confirm('Erase everything? Export first if unsure.')) { setProject(blank()); ed.changed(); ed.fit(); } }, { icon: I.reset, cls: 'ghost icon', title: 'Reset project' })));

  // ============ floating toolbar / zoom / status ============
  const tools: [Tool, string, string][] = [['select', I.cursor, 'Select  V'], ['wall', I.wall, 'Draw walls  W'], ['door', I.door, 'Door  D'], ['window', I.window, 'Window  N'], ['scale', I.ruler, 'Calibrate image scale']];
  const toolBtns = tools.map(([t, ic, tip]) => h('button', { className: 'tool', 'data-tip': tip, on: { click: () => ed.setTool(t) } }, svg(ic)));
  toolBtns.forEach((b, i) => b.setAttribute('data-tip', tools[i]![2]));
  const syncTools = () => toolBtns.forEach((b, i) => b.classList.toggle('on', tools[i]![0] === ed.tool));
  main.querySelector('#toolbar')!.append(toolBtns[0]!, h('span', { className: 'sep' }), ...toolBtns.slice(1, 4), h('span', { className: 'sep' }), toolBtns[4]!);

  const pct = h('span', { className: 'pct' });
  ed.onView = () => { pct.textContent = `${Math.round(ed.k * 100)} %`; };
  main.querySelector('#zoomer')!.append(btn('', () => ed.zoom(1 / 1.25), { icon: I.minus, cls: 'icon' }), pct, btn('', () => ed.zoom(1.25), { icon: I.plus, cls: 'icon' }), btn('', () => ed.fit(), { icon: I.fit, cls: 'icon', title: 'Fit  F' }));

  const st = { mode: h('b'), hint: h('span'), c: h('span', { className: 'c' }) };
  main.querySelector('#status')!.append(st.mode, st.hint, st.c);
  ed.status = (hint, coords) => { st.mode.textContent = ed.tool[0]!.toUpperCase() + ed.tool.slice(1); st.hint.textContent = hint; st.c.textContent = coords; };

  // ============ item dialog ============
  const f = { name: h('input', { placeholder: 'e.g. Sofa' }), w: h('input', { type: 'number', min: '1' }), d: h('input', { type: 'number', min: '1' }), h: h('input', { type: 'number', min: '0' }), color: h('input', { type: 'color' }), img: '' };
  let editing: Asset | null = null;
  const imgBtn = file('Top-view image', 'image/*', async fl => { f.img = await shrinkImage(await readFile(fl, 'dataURL'), 600); imgBtn.childNodes[1]!.textContent = 'Image set'; }, { icon: I.image });
  const clearImg = btn('', () => { f.img = ''; imgBtn.childNodes[1]!.textContent = 'Top-view image'; }, { icon: I.x, cls: 'icon', title: 'remove image' });
  const dTitle = h('span'), dDel = btn('Delete', () => { if (!editing || !confirm(`Delete "${editing.name}" and every placed copy?`)) return; const id = editing.id; p().assets = p().assets.filter(a => a.id !== id); p().layouts.forEach(l => l.items = l.items.filter(i => i.asset !== id)); dlg.close(); ed.changed(); }, { cls: 'danger', icon: I.trash });
  const dlg = h('dialog', {}, h('form', { method: 'dialog', on: { submit: (e: Event) => {
    e.preventDefault(); const v = { name: f.name.value.trim() || 'Item', w: +f.w.value || 50, d: +f.d.value || 50, h: +f.h.value || 0, color: f.color.value };
    if (editing) { Object.assign(editing, v); if (f.img) editing.img = f.img; else delete editing.img; } else p().assets.push({ id: uid(), ...v, ...(f.img ? { img: f.img } : {}) });
    dlg.close(); ed.changed();
  } } },
    h('div', { className: 'dh' }, dTitle, btn('', () => dlg.close(), { icon: I.x, cls: 'ghost icon' })),
    field('Name', h('div', { className: 'in' }, f.name)),
    h('div', { className: 'g3' }, field('Width', h('div', { className: 'in' }, f.w, h('span', { className: 'u', textContent: 'cm' }))), field('Depth', h('div', { className: 'in' }, f.d, h('span', { className: 'u', textContent: 'cm' }))), field('Height', h('div', { className: 'in' }, f.h, h('span', { className: 'u', textContent: 'cm' })))),
    h('div', { className: 'g2' }, field('Colour', h('div', { className: 'in' }, f.color)), field('Image (optional)', h('div', { style: 'display:flex;gap:6px;min-width:0' }, Object.assign(imgBtn, { style: 'flex:1;min-width:0;overflow:hidden' }), Object.assign(clearImg, { style: 'flex:none' })))),
    h('div', { className: 'df' }, dDel, btn('Cancel', () => dlg.close()), h('button', { className: 'btn pri', type: 'submit', textContent: 'Save' }))));
  document.body.append(dlg);
  const openDlg = (a: Asset | null) => {
    editing = a; dTitle.textContent = a ? 'Edit item' : 'New item'; dDel.hidden = !a;
    f.name.value = a?.name ?? ''; f.w.value = String(a?.w ?? 100); f.d.value = String(a?.d ?? 50); f.h.value = String(a?.h ?? 75); f.color.value = a?.color ?? PALETTE[p().assets.length % PALETTE.length]!; f.img = a?.img ?? '';
    imgBtn.childNodes[1]!.textContent = f.img ? 'Image set' : 'Top-view image'; dlg.showModal(); f.name.focus();
  };

  // ============ left: catalog ============
  const cards = h('div', { className: 'cards' });
  const renderCards = () => {
    const rows = p().assets.map(a => h('div', { className: 'card', draggable: true, title: 'Drag onto the plan', on: { dragstart: (e: any) => e.dataTransfer.setData('asset', a.id), dblclick: () => ed.addItem(a.id) } },
      thumb(a), h('div', {}, h('b', { textContent: a.name }), h('small', { textContent: `${a.w} × ${a.d} cm` })),
      h('div', { className: 'act' }, btn('', () => ed.addItem(a.id), { icon: I.plus, cls: 'icon', title: 'Place' }), btn('', () => openDlg(a), { icon: I.ruler, cls: 'icon', title: 'Edit' }))));
    cards.replaceChildren(...(rows.length ? rows : [h('div', { className: 'empty' }, 'No furniture yet.', h('br'), 'Add your pieces with real measurements, then drag them onto the plan.')]));
  };
  left.append(h('div', { className: 'ph' }, h('h2', { textContent: 'Furniture' }), btn('New', () => openDlg(null), { icon: I.plus, cls: 'pri' })), cards);

  // ============ right: inspector ============
  const insp = h('div', { className: 'sec' });
  const renderSel = () => {
    const it = ed.selected(), a = it && asset(p(), it.asset);
    if (it && a) {
      const bad = ed.collides(it, it.x, it.y, it.rot);
      insp.replaceChildren(h('div', {}, h('div', { className: 'title', textContent: a.name }), h('div', { className: `sub ${bad ? 'warn' : ''}`, textContent: bad ? 'Overlaps a wall' : `${a.w} × ${a.d} × ${a.h} cm` })),
        h('div', { className: 'g2' }, field('X', numIn(it.x, v => { it.x = v; ed.changed(); })), field('Y', numIn(it.y, v => { it.y = v; ed.changed(); }))),
        field('Rotation', h('div', { style: 'display:flex;gap:8px' }, Object.assign(numIn(it.rot, v => { it.rot = v; ed.changed(); }, '°', 15), { style: 'flex:1' }),
          h('div', { className: 'seg' }, btn('', () => ed.rotate(-90), { icon: I.rotl, cls: 'icon', title: 'Rotate −90°  Shift+R' }), btn('', () => ed.rotate(90), { icon: I.rotr, cls: 'icon', title: 'Rotate +90°  R' })))),
        h('div', { className: 'g2' }, btn('Duplicate', () => ed.dup(), { icon: I.copy }), btn('Delete', () => ed.del(), { icon: I.trash, cls: 'danger' })));
    } else if (ed.sel?.kind === 'open') {
      const o = ed.selectedOpening()!, G = ed.geom(o), door = o.kind === 'door';
      insp.replaceChildren(h('div', {}, h('div', { className: 'title', textContent: door ? 'Door' : 'Window' }), h('div', { className: 'sub', textContent: `on a ${G ? G.L.toFixed(0) : '?'} cm wall` })),
        h('div', { className: 'g2' }, field('Width', numIn(o.w, v => { o.w = Math.max(20, v || 20); ed.clampOpening(o); ed.changed(); })), field('From wall start', numIn(o.t, v => { o.t = v; ed.clampOpening(o); ed.changed(); }))),
        ...(door ? [h('div', { className: 'g2' }, btn('Hinge side', () => { o.hinge = o.hinge ? 0 : 1; ed.changed(); }, { icon: I.flip }), btn('Swing side', () => { o.swing = o.swing === 1 ? -1 : 1; ed.changed(); }, { icon: I.rotr }))] : []),
        btn(`Delete ${o.kind}`, () => ed.del(), { icon: I.trash, cls: 'danger' }));
    } else if (ed.sel?.kind === 'wall') {
      const w = p().plan.walls[ed.sel.i]!;
      insp.replaceChildren(h('div', {}, h('div', { className: 'title', textContent: 'Wall' }), h('div', { className: 'sub', textContent: `${Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y).toFixed(0)} cm` })),
        h('div', { className: 'g2' }, btn('Add door', () => { const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }; ed.addOpening('door', m); }, { icon: I.door }), btn('Add window', () => { const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }; ed.addOpening('window', m); }, { icon: I.window })),
        btn('Delete wall', () => ed.del(), { icon: I.trash, cls: 'danger' }));
    } else insp.replaceChildren(h('div', { className: 'hint', innerHTML: kbd('Select an item or wall to edit it.<br><br>[V] select · [W] draw walls · [F] fit view<br>Drag empty space or [Alt]+drag to pan, scroll to zoom.') }));
  };

  const opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', on: { input: (e: any) => { const im = p().plan.image; if (im) { im.opacity = +e.target.value; ed.changed(); } } } });
  const imgRow = h('div', { className: 'g2' });
  const renderPlan = () => {
    const im = p().plan.image;
    imgRow.replaceChildren(
      file(im ? 'Replace' : 'Upload plan', 'image/*', async fl => { p().plan.image = { src: await shrinkImage(await readFile(fl, 'dataURL')), x: 0, y: 0, cmPerPx: 1, opacity: 0.6 }; ed.changed(); ed.fit(); ed.setTool('scale'); }, { icon: I.image }),
      im ? btn('Remove', () => { delete p().plan.image; ed.changed(); }, { icon: I.x }) : btn('Set scale', () => ed.setTool('scale'), { icon: I.ruler }));
    opacity.value = String(im?.opacity ?? 0.6); opacity.disabled = !im;
  };
  right.append(insp,
    h('div', { className: 'sec' }, h('h3', { textContent: 'Floor plan' }), imgRow, field('Image opacity', opacity),
      field('Wall thickness', numIn(p().plan.wallT ?? 10, v => { p().plan.wallT = v || 10; ed.changed(); })),
      btn('Clear all walls', () => { if (confirm('Delete all walls?')) { p().plan.walls = []; ed.changed(); } }, { cls: 'danger', icon: I.trash })),
    h('div', { className: 'sec' }, h('h3', { textContent: 'How to' }), h('div', { className: 'hint', innerHTML: kbd(
      '<b>Walls</b> — press [W], click corners. Type a length and [Enter] for exact cm. [Shift] locks to 90°. Click the first corner to close.<br><br>' +
      '<b>Doors & windows</b> — [D] / [N], click a wall. Drag along the wall; set width, hinge and swing side in the inspector. Furniture keeps out of the door swing.<br><br>' +
      '<b>Plan image</b> — upload, then click two points with a known distance and enter it.<br><br>' +
      '<b>Furniture</b> — drag from the list. Items stop at walls and snap to them. [R] rotates 90°, [Q]/[E] 15°, arrows nudge, [Ctrl]+[D] duplicates, [Del] removes.') })));

  // ============ wiring ============
  const refresh = () => { renderTabs(); renderCards(); renderSel(); renderPlan(); syncTools(); ed.onView(); };
  ed.onSelect = () => { renderSel(); syncTools(); };
  refresh();
  return refresh;
}
