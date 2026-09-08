import { withBasePath } from '../shared/deployment.mjs';

export const appPath = resource => withBasePath(resource, import.meta.env.BASE_URL);
