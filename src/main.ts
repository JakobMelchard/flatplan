import { load, save, type Project } from './model';
import { Editor } from './editor';
import { buildUI } from './ui';

const status = document.getElementById('status')!;
const ed = new Editor(document.getElementById('c') as HTMLCanvasElement, load(), s => status.textContent = s);
const refresh = buildUI(document.getElementById('side')!, document.getElementById('tools')!, ed, (p: Project) => { ed.p = p; });
let t = 0;
ed.onChange = () => { refresh(); clearTimeout(t); t = window.setTimeout(() => { const err = save(ed.p); if (err) status.textContent = err; }, 300); };
ed.fit();
(window as any).ed = ed;
