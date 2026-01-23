
import React, { useEffect } from 'react';
import { useOS } from '../context/OSContext';
import StatusBar from './os/StatusBar';
import Launcher from '../apps/Launcher';
import Settings from '../apps/Settings';
import Character from '../apps/Character';
import Chat from '../apps/Chat'; 
import GroupChat from '../apps/GroupChat'; 
import ThemeMaker from '../apps/ThemeMaker';
import Appearance from '../apps/Appearance';
import Gallery from '../apps/Gallery'; 
import DateApp from '../apps/DateApp'; 
import UserApp from '../apps/UserApp';
import JournalApp from '../apps/JournalApp'; 
import ScheduleApp from '../apps/ScheduleApp'; 
import RoomApp from '../apps/RoomApp'; 
import CheckPhone from '../apps/CheckPhone'; // New Import
import { AppID } from '../types';
import { App as CapApp } from '@capacitor/app';
import { StatusBar as CapStatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const PhoneShell: React.FC = () => {
  const { theme, isLocked, unlock, activeApp, closeApp, virtualTime, isDataLoaded, toasts, unreadMessages, characters } = useOS();

  // Capacitor Native Handling
  useEffect(() => {
    const initNative = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                // 1. 设置状态栏覆盖 WebView (关键：让网页内容延伸到刘海屏区域)
                await CapStatusBar.setOverlaysWebView({ overlay: true });
                
                // 2. 隐藏原生状态栏 (使用我们的模拟状态栏替代)
                await CapStatusBar.hide();
                
                // 3. (可选) 如果隐藏失败，设置状态栏样式为透明/深色模式以融合
                await CapStatusBar.setStyle({ style: StatusBarStyle.Dark });

                // Request Notification Permissions
                const permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }
            } catch (e) {
                console.error("Native init failed", e);
            }
        }
    };
    initNative();

    // Handle Android Hardware Back Button
    const setupBackButton = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await CapApp.removeAllListeners();
                CapApp.addListener('backButton', ({ canGoBack }) => {
                    // If an app is open, close it (go to Launcher)
                    if (activeApp !== AppID.Launcher) {
                        closeApp();
                    } else if (!isLocked) {
                        // If on Launcher and not locked, maybe ask to exit or minimize
                        // For now, let's just minimize/exit
                        CapApp.exitApp();
                    }
                });
            } catch (e) { console.log('Back button listener setup failed'); }
        }
    };

    setupBackButton();

    // Re-bind when activeApp changes to ensure closure captures latest state
    return () => {
        if (Capacitor.isNativePlatform()) {
            CapApp.removeAllListeners().catch(() => {});
        }
    };
  }, [activeApp, isLocked, closeApp]);

  if (!isDataLoaded) {
    return <div className="w-full h-full bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div></div>;
  }

  // Helper to determine if the wallpaper is an image URL or a CSS gradient
  const getBgStyle = (wp: string) => {
      const isUrl = wp.startsWith('http') || wp.startsWith('data:') || wp.startsWith('blob:');
      return isUrl ? `url(${wp})` : wp;
  };

  const bgImageValue = getBgStyle(theme.wallpaper);
  const contentColor = theme.contentColor || '#ffffff';

  if (isLocked) {
    const unreadCount = Object.values(unreadMessages).reduce((a,b) => a+b, 0);
    const unreadCharId = Object.keys(unreadMessages)[0];
    const unreadChar = unreadCharId ? characters.find(c => c.id === unreadCharId) : null;

    return (
      <div 
        onClick={unlock}
        className="relative w-full h-full bg-cover bg-center cursor-pointer overflow-hidden group font-light select-none"
        style={{ backgroundImage: bgImageValue, color: contentColor }}
      >
        <div className="absolute inset-0 bg-black/5 backdrop-blur-sm transition-all group-hover:backdrop-blur-none group-hover:bg-transparent duration-700" />
        
        <div className="absolute top-24 w-full text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
           <div className="text-8xl tracking-tighter opacity-95 font-bold">
             {virtualTime.hours.toString().padStart(2,'0')}<span className="animate-pulse">:</span>{virtualTime.minutes.toString().padStart(2,'0')}
           </div>
           <div className="text-lg tracking-widest opacity-90 mt-2 uppercase text-xs font-bold">SullyOS Simulation</div>
        </div>

        {/* Lock Screen Notification */}
        {unreadCount > 0 && (
            <div className="absolute top-[40%] left-4 right-4 animate-slide-up">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 shadow-lg border border-white/10 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" /></svg>
                    </div>
                    <div className="flex-1 min-w-0 text-white text-left">
                        <div className="font-bold text-sm flex justify-between">
                            <span>{unreadChar ? unreadChar.name : 'Message'}</span>
                            <span className="text-[10px] opacity-70">刚刚</span>
                        </div>
                        <div className="text-xs opacity-90 truncate">
                            {unreadCount > 1 ? `收到 ${unreadCount} 条新消息` : '发来了一条新消息'}
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="absolute bottom-12 w-full flex flex-col items-center gap-3 animate-pulse opacity-80 drop-shadow-md">
          <div className="w-1 h-8 rounded-full bg-gradient-to-b from-transparent to-current"></div>
          <span className="text-[10px] tracking-widest uppercase font-semibold">Tap to Unlock</span>
        </div>
      </div>
    );
  }

  const renderApp = () => {
    switch (activeApp) {
      case AppID.Settings: return <Settings />;
      case AppID.Character: return <Character />;
      case AppID.Chat: return <Chat />;
      case AppID.GroupChat: return <GroupChat />; 
      case AppID.ThemeMaker: return <ThemeMaker />;
      case AppID.Appearance: return <Appearance />;
      case AppID.Gallery: return <Gallery />;
      case AppID.Date: return <DateApp />; 
      case AppID.User: return <UserApp />;
      case AppID.Journal: return <JournalApp />; 
      case AppID.Schedule: return <ScheduleApp />;
      case AppID.Room: return <RoomApp />; 
      case AppID.CheckPhone: return <CheckPhone />; // New App
      case AppID.Launcher:
      default: return <Launcher />;
    }
  };

  return (
    // Base container has a fallback gradient (Warm Pink/Purple) so it's never just white.
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-pink-200 via-purple-200 to-indigo-200 text-slate-900 font-sans select-none">
       {/* Wallpaper Layer */}
       <div 
         className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
         style={{ 
             backgroundImage: bgImageValue,
             // Only apply blur/scale if it's an app opening, but keep it subtle
             transform: activeApp !== AppID.Launcher ? 'scale(1.1) blur(10px)' : 'scale(1) blur(0px)',
             opacity: activeApp !== AppID.Launcher ? 0.6 : 1,
             // Removed filter saturation/brightness manipulation to let the gradient shine purely
         }}
       />
       
       {/* App Background Overlay (Glass Effect) */}
       <div className={`absolute inset-0 transition-all duration-500 ${activeApp === AppID.Launcher ? 'bg-transparent' : 'bg-white/50 backdrop-blur-3xl'}`} />
       
       <div className="relative z-10 w-full h-full flex flex-col pt-[env(safe-area-inset-top)]">
          <StatusBar />
          <div className="flex-1 relative overflow-hidden flex flex-col">{renderApp()}</div>
          
          {/* Home Indicator - Absolute Overlay */}
          <div className="absolute bottom-0 left-0 w-full h-6 flex justify-center items-end pb-2 z-50 pointer-events-none">
             <div className="w-32 h-1 bg-slate-900/10 rounded-full backdrop-blur-md"></div>
          </div>
       </div>

       {/* System Toasts - Enhanced Visibility */}
       <div className="absolute top-12 left-0 w-full flex flex-col items-center gap-2 pointer-events-none z-[60]">
          {toasts.map(toast => (
             <div key={toast.id} className="animate-fade-in bg-white/95 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-xl border border-black/5 flex items-center gap-3 max-w-[85%] ring-1 ring-white/20">
                 {toast.type === 'success' && <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0"></div>}
                 {toast.type === 'error' && <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></div>}
                 {toast.type === 'info' && <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0"></div>}
                 <span className="text-xs font-bold text-slate-800 truncate leading-none">{toast.message}</span>
             </div>
          ))}
       </div>
    </div>
  );
};

export default PhoneShell;
