import React from 'react';
import ReactDOM from 'react-dom';
import './tailwind.css';
import App from './App';
import './i18n'; // <--- DODANE: Aktywacja systemu tłumaczeń i autodetekcji języka

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);