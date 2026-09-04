import type { PlayerPersona, Project } from '@gda/shared';
import { materializeSteps, updateProject } from './projectStore.js';

type ProjectResult = Project;

export async function addPersona(
  projectId: string,
  persona: { name: string; description: string },
): Promise<ProjectResult> {
  return updateProject(projectId, (p) => {
    const entry: PlayerPersona = {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: persona.name,
      description: persona.description,
      preset: false,
    };
    p.personas.push(entry);
    materializeSteps(p);
  });
}

export async function updatePersona(
  projectId: string,
  personaId: string,
  patch: { name?: string; description?: string },
): Promise<ProjectResult> {
  return updateProject(projectId, (p) => {
    const target = p.personas.find((x) => x.id === personaId);
    if (!target) throw new Error('画像不存在');
    if (patch.name !== undefined) target.name = patch.name;
    if (patch.description !== undefined) target.description = patch.description;
  });
}

export async function removePersona(projectId: string, personaId: string): Promise<ProjectResult> {
  return updateProject(projectId, (p) => {
    const target = p.personas.find((x) => x.id === personaId);
    if (!target) throw new Error('画像不存在');
    if (target.preset) throw new Error('预设画像不可删除');
    p.personas = p.personas.filter((x) => x.id !== personaId);
    materializeSteps(p);
  });
}


