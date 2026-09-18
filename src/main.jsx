import React from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import './launch-controls.css';
import './blast-zone.css';
import {App} from './App.jsx';

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
