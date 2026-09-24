import '@fontsource-variable/onest';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/motion.css';
import './styles/paint.css';
import { render } from 'preact';
import { App } from './app.tsx';

const root = document.getElementById('app');
if (root) render(<App />, root);
