import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ActiveMsgRuntime } from './utils/activeMsgRuntime';
import { KeepAlive } from './utils/keepAlive';
import { ProactiveChat } from './utils/proactiveChat';
import { installIOSStandaloneWorkaround } from './utils/iosStandalone';

// Register the keep-alive Service Worker early so it's ready before any AI calls
KeepAlive.init().then(() => {
  // Resume any active proactive schedule after SW is ready
  ProactiveChat.resume();
  // 主动消息 2.0 需在设置中启用才会初始化
  try {
    const raw = localStorage.getItem('os_realtime_config');
    const cfg = raw ? JSON.parse(raw) : {};
    if (cfg.activeMsg2Enabled === true) {
      void ActiveMsgRuntime.init();
    }
  } catch {
    // 不启用 2.0
  }
});

installIOSStandaloneWorkaround();

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
