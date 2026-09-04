import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** server/src -> 仓库根（src -> server -> repo） */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

/** 本地数据根目录：data/ */
export const DATA_DIR = path.join(ROOT_DIR, 'data');

export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const PORT = Number(process.env.GDA_PORT ?? 8787);
