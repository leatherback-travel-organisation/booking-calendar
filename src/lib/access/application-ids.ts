import type { ApplicationAccessLevel, PlatformRole } from "./model";

export const SUPERPANEL_APPLICATION_ID = "4f96c764-d6f7-4f7f-9d76-99ec9cc89e31";
export const SUPERPANEL_APPLICATION_SLUG = "superpanel";
export const SUPERPANEL_USER_ROLE_ID = "59e25954-bfc8-4ceb-a55d-c8b0b50c7b6a";
export const SUPERPANEL_ADMIN_ROLE_ID = "0ab6228f-acde-44df-aef3-9475d30f72e1";

export const RECRUITMENT_APPLICATION_ID = "bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40";
export const RECRUITMENT_APPLICATION_SLUG = "recruitment";
export const RECRUITMENT_USER_ROLE_ID = "6d311b3b-b266-4adf-8441-5a4f4800e4f0";
export const RECRUITMENT_ADMIN_ROLE_ID = "77842d6f-c02d-4032-898e-2a1d1253f587";

export const BOTSWARM_APPLICATION_ID = "dc84d929-96f5-4dab-afd0-fb8144596b4a";
export const BOTSWARM_APPLICATION_SLUG = "botswarm";
export const BOTSWARM_USER_ROLE_ID = "934b3e3f-73a9-47b9-8980-01594441bfe7";
export const BOTSWARM_ADMIN_ROLE_ID = "62b15bbb-7914-422c-ac19-d45a885454fd";

export const AGENTIC_OS_APPLICATION_ID = "b98aef40-9a08-44f3-8bb9-f840e37e92c4";
export const AGENTIC_OS_APPLICATION_SLUG = "agentic-os";
export const AGENTIC_OS_USER_ROLE_ID = "789bfb85-141f-47b5-85a2-7cb3e8222269";
export const AGENTIC_OS_ADMIN_ROLE_ID = "ef16690e-395b-48bd-b8f9-66711af17fc3";

export function superPanelAccessLevelForPlatformRoles(
  roles: readonly PlatformRole[],
): ApplicationAccessLevel | null {
  return roles.some((role) => role === "super_admin" || role === "systems_admin")
    ? "admin"
    : null;
}
