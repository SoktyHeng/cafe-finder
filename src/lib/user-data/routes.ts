import "server-only";

import { getUserContext } from "./context";
import { createUserDataHandlers } from "./handlers";

/** One handler set (and rate limiter) per server instance. */
export const userDataRoutes = createUserDataHandlers({ getContext: getUserContext });
