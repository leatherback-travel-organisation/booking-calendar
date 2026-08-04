import type { ApplicationAccessLevel, PlatformRole } from "./model";

export const SUPERPANEL_APPLICATION_ID = "4f96c764-d6f7-4f7f-9d76-99ec9cc89e31";
export const SUPERPANEL_APPLICATION_SLUG = "superpanel";
export const SUPERPANEL_USER_ROLE_ID = "59e25954-bfc8-4ceb-a55d-c8b0b50c7b6a";
export const SUPERPANEL_ADMIN_ROLE_ID = "0ab6228f-acde-44df-aef3-9475d30f72e1";

export const RECRUITMENT_APPLICATION_ID = "bd20f105-4b8d-4e4d-9a77-cc1fbb3e2c40";
export const RECRUITMENT_APPLICATION_SLUG = "recruitment";
export const RECRUITMENT_USER_ROLE_ID = "6d311b3b-b266-4adf-8441-5a4f4800e4f0";
export const RECRUITMENT_ADMIN_ROLE_ID = "77842d6f-c02d-4032-898e-2a1d1253f587";

export const APP_BUILDER_APPLICATION_ID = "35fb497e-7236-4f9e-ac2b-11fd55f5e809";
export const APP_BUILDER_APPLICATION_SLUG = "app-builder";
export const APP_BUILDER_USER_ROLE_ID = "43eeed02-938a-487f-b6d3-7085cc41f970";
export const APP_BUILDER_ADMIN_ROLE_ID = "c43e704c-4628-4ae4-9848-f95324b03564";

export function superPanelAccessLevelForPlatformRoles(
  roles: readonly PlatformRole[],
): ApplicationAccessLevel | null {
  return roles.some((role) => role === "super_admin" || role === "systems_admin")
    ? "admin"
    : null;
}
