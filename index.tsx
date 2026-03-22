import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { KeepAlive } from './utils/keepAlive';
import { ProactiveChat } from './utils/proactiveChat';

// Register SW for keep-alive + proactive timers, then resume proactive schedules
KeepAlive.init().then(() => ProactiveChat.resume());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);