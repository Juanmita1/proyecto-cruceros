import { render } from 'preact';
import { App } from './App';
import { init } from './app/actions';
import { setupPwa } from './pwa';
import './styles.css';

render(<App />, document.getElementById('app')!);
setupPwa();
init().catch((e) => {
  document.getElementById('app')!.innerHTML = `<div class="splash">No se pudo iniciar la app: ${String(e)}<br>Compruebe que el navegador permite el almacenamiento local (no use modo privado).</div>`;
});
