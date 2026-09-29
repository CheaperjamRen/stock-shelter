import { routes } from './routes';

export default function App() {
  return <>{routes.map((r) => <div key={r.path}>{r.element}</div>)}</>;
}