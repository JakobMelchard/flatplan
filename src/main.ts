import { load, save, type Project } from './model';
import { Editor } from './editor';
import { buildUI } from './ui';

const $ = (id: string) => document.getElementById(id)!;
const ed = new Editor($('c') as HTMLCanvasElement, load());
const refresh = buildUI($('top'), $('left'), $('right'), document.querySelector('main')!, ed, p => { ed.p = p; });
let t = 0;
ed.onChange = () => { refresh(); clearTimeout(t); t = window.setTimeout(() => { const err = save(ed.p); if (err) alert(err); }, 300); };
ed.fit();
ed.setTool('select');
(window as any).ed = ed;
