'use client';

import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import type { SettingsSection } from '@/utils/settingsSections';

// This instance lists the core's project settings sections only. The Pro previews of agent
// workflows and forms are left out: they cannot be turned on here. The hosted build returns
// the core's with its own added at any position, in a group of the core's or one of its own,
// or with one left out.
export default function useProjectSettingsSections(
  _project: ProjectDetail | null,
  core: SettingsSection[],
): SettingsSection[] {
  return core;
}
