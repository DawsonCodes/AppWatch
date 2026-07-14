import { render } from 'preact';
import { App } from './app.tsx';
import './styles/global.css';

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
