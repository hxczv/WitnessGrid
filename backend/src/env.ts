import type { SessionUser } from '@witnessgrid/contract';

export interface AppVariables {
  userId: string | undefined;
  sessionUser: SessionUser | undefined;
}

export type AppEnv = { Variables: AppVariables };