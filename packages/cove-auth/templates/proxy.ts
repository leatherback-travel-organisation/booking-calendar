import { COVE_PROXY_MATCHER, createCoveProxy } from "@leatherback/cove-auth/proxy";

export const proxy = createCoveProxy();
export default proxy;

export const config = { matcher: [...COVE_PROXY_MATCHER] };
