import type { ReactNode } from 'react';
import ScreenerPage from './pages/ScreenerPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  /** Accessible without login. Routes without this flag require authentication. Has no effect when RouteGuard is not in use. */
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: '研选 · 智能选股与策略解释器',
    path: '/',
    element: <ScreenerPage />,
    public: true,
  },
];
